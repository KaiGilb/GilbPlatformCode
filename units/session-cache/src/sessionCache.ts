// The session cache. A page opens from what the last visit loaded (stale-while-revalidate) instead of waiting for the platform.
// No React in this file (the hook is useCached.ts). Keys are `workspace|resource` (cacheKey), so two workspaces never share an entry, and everything is dropped when the person
// changes workspace (clearSessionCache). The cache is a copy of what the pages already read; it adds no write and no new read route.
//
//   swr(key, loader)      the cached value AT ONCE (undefined on a miss) and, when it is older than STALE_MS or the tab regained focus since it was loaded, ONE background revalidation (shared by every caller).
//   refresh(key, loader?) ALWAYS loads (a write just happened): never skipped for freshness, never joined to a load that started before it; the newest load wins.
//   invalidate(keys)      marks entries stale (value kept, so the page still shows it): the next swr revalidates; an entry someone is subscribed to is revalidated now (when it is already loading, once more right after that load). A key ending in `*` is a prefix.
//   warm(key, loader)     prefetch: loads when there is no fresh value and no load in flight; never throws.
//   subscribe(key, fn)    told on every change of that entry (value, updating, error).
//   peek(key)             the entry as a snapshot (a stable object until it changes).
// A failed load keeps the last good value and exposes the error. Memory is bounded by entries and by estimated bytes (least recently used go first; an entry in flight or subscribed to stays).

import { currentPrincipal, principalGuard, registerCache } from "@kaigilb/gilbplatformcode-principal-hub";

/** A value older than this is revalidated when it is used. */
export const STALE_MS = 30_000;
export const MAX_ENTRIES = 200;
export const MAX_BYTES = 32 * 1024 * 1024;

export interface CacheState<T> { data: T | undefined; updating: boolean; error: unknown; updatedAt: number | undefined }
export type Loader<T> = () => Promise<T>;

interface Entry<T> {
  has: boolean; value?: T; at: number; focus: number; stale: boolean; error?: unknown;
  inflight?: Promise<T>; dirty?: boolean; gen: number; loader?: Loader<unknown>; bytes: number; used: number; snap: CacheState<T>;
}

export interface SessionCacheOptions { now?: () => number; staleMs?: number; maxEntries?: number; maxBytes?: number; sizeOf?: (v: unknown) => number }

/**
 * `principal|workspace|resource`. The PERSON is part of every key, taken from the hub when the key is made: a write that is made late, under a key made while A was in the tab, lands under A's key, which nobody else
 * ever reads (and which the hub's clear removes). A page that writes after an await makes its key BEFORE the await and keeps it. The workspace is the vault address of the account the person is in.
 */
export const cacheKey = (workspace: string, resource: string): string => `${currentPrincipal() ?? ""}|${workspace}|${resource}`;
/** The parts of a key made by cacheKey. */
export const keyParts = (key: string): { principal: string; workspace: string; resource: string } => { const [principal = "", workspace = "", ...rest] = key.split("|"); return { principal, workspace, resource: rest.join("|") }; };

const IDLE: CacheState<never> = Object.freeze({ data: undefined, updating: false, error: undefined, updatedAt: undefined });
const estimate = (v: unknown): number => { try { return JSON.stringify(v)?.length ?? 0; } catch { return 0; } };

export function createSessionCache(o: SessionCacheOptions = {}) {
  const now = o.now ?? (() => Date.now());
  const staleMs = o.staleMs ?? STALE_MS;
  const maxEntries = o.maxEntries ?? MAX_ENTRIES;
  const maxBytes = o.maxBytes ?? MAX_BYTES;
  const sizeOf = o.sizeOf ?? estimate;
  const entries = new Map<string, Entry<unknown>>();
  const subs = new Map<string, Set<() => void>>();
  let focusEpoch = 0;
  let commitListener: ((key: string, value: unknown, at: number) => void) | undefined;
  const committed = (key: string, e: Entry<unknown>) => { try { commitListener?.(key, e.value, e.at); } catch { /* a listener must not break a load */ } };
  let tick = 0;

  const snapOf = (e: Entry<unknown>): CacheState<unknown> => ({ data: e.has ? e.value : undefined, updating: e.inflight !== undefined, error: e.error, updatedAt: e.has ? e.at : undefined });
  const touch = (e: Entry<unknown>) => { e.snap = snapOf(e); };
  const notify = (key: string) => { for (const f of [...(subs.get(key) ?? [])]) f(); };
  const get = (key: string): Entry<unknown> => {
    let e = entries.get(key);
    if (!e) { e = { has: false, at: 0, focus: focusEpoch, stale: false, gen: 0, bytes: 0, used: ++tick, snap: IDLE }; entries.set(key, e); }
    return e;
  };
  const isFresh = (e: Entry<unknown>) => e.has && !e.stale && now() - e.at < staleMs && e.focus === focusEpoch;
  const held = (key: string, e: Entry<unknown>) => e.inflight !== undefined || (subs.get(key)?.size ?? 0) > 0;

  /** Bound the memory: the least recently used entry that nobody waits on or shows goes first. `keep` is the entry just written. */
  function enforce(keep: string): void {
    let total = 0;
    for (const e of entries.values()) total += e.bytes;
    while (entries.size > maxEntries || total > maxBytes) {
      let victim: string | undefined, oldest = Infinity;
      for (const [k, e] of entries) if (k !== keep && !held(k, e) && e.used < oldest) { oldest = e.used; victim = k; }
      if (victim === undefined) return;
      total -= entries.get(victim)!.bytes;
      entries.delete(victim);
    }
  }

  function start<T>(key: string, e: Entry<T>, loader: Loader<T>): Promise<T> {
    e.loader = loader as Loader<unknown>;
    const gen = ++e.gen;
    const alive = principalGuard(); // an answer for the person before is dropped
    let raw: Promise<T>;
    try { raw = Promise.resolve(loader()); } catch (err) { raw = Promise.reject(err); } // the loader starts now, not on a later tick
    const p: Promise<T> = raw.then(
      (v) => {
        // A later load, an invalidation or a clear has superseded this one: its answer is returned to its caller and kept by nobody.
        if (e.gen === gen && entries.get(key) === (e as Entry<unknown>) && alive()) {
          e.has = true; e.value = v; e.at = now(); e.focus = focusEpoch; e.stale = false; e.error = undefined; e.inflight = undefined;
          e.bytes = sizeOf(v); e.used = ++tick;
          touch(e as Entry<unknown>);
          enforce(key);
          committed(key, e as Entry<unknown>);
          // Invalidated while this load ran (and someone is showing the entry): its answer may predate the write, so ask once more, now.
          if (e.dirty && e.loader) { e.dirty = false; e.stale = true; void start(key, e as Entry<unknown>, e.loader).catch(() => undefined); }
          else notify(key);
        }
        return v;
      },
      (err) => {
        if (e.gen === gen && entries.get(key) === (e as Entry<unknown>) && alive()) { e.error = err; e.inflight = undefined; touch(e as Entry<unknown>); notify(key); }
        throw err;
      },
    );
    p.catch(() => undefined); // the entry holds the error; a caller that does not await must not raise an unhandled rejection
    e.inflight = p;
    touch(e as Entry<unknown>);
    notify(key);
    return p;
  }

  /** Revalidates unless fresh; joins the load already in flight. */
  function ensure<T>(key: string, loader: Loader<T>): Promise<T> {
    const e = get(key) as Entry<T>;
    e.used = ++tick;
    if (isFresh(e)) return Promise.resolve(e.value as T);
    if (e.inflight) return e.inflight;
    return start(key, e, loader);
  }

  return {
    key: cacheKey,
    peek<T = unknown>(key: string): CacheState<T> {
      const e = entries.get(key);
      if (!e) return IDLE as CacheState<T>;
      e.used = ++tick;
      return e.snap as CacheState<T>;
    },
    /** The cached value at once, and the promise of the revalidated one (the cached value when it was fresh; on a failed revalidation, the last good value). */
    swr<T>(key: string, loader: Loader<T>): { value: T | undefined; stale: boolean; promise: Promise<T> } {
      const e = get(key) as Entry<T>;
      const had = e.has, value = e.value, fresh = isFresh(e);
      const p = ensure(key, loader);
      return { value: had ? value : undefined, stale: had && !fresh, promise: had ? p.catch(() => value as T) : p };
    },
    refresh<T>(key: string, loader?: Loader<T>): Promise<T> {
      const e = get(key) as Entry<T>;
      const l = loader ?? (e.loader as Loader<T> | undefined);
      if (!l) return Promise.reject(new Error(`session cache: nothing to refresh for ${keyParts(key).resource || key}`));
      e.used = ++tick;
      return start(key, e, l);
    },
    /** A page that has just loaded the value its own way puts it here, so the next visit (or another page) starts from it. Fresh as of now; a load still running for the key is superseded. */
    set<T>(key: string, value: T): void {
      const e = get(key) as Entry<T>;
      e.gen++; e.inflight = undefined;
      e.has = true; e.value = value; e.at = now(); e.focus = focusEpoch; e.stale = false; e.error = undefined;
      e.bytes = sizeOf(value); e.used = ++tick;
      touch(e as Entry<unknown>);
      enforce(key);
      committed(key, e as Entry<unknown>);
      notify(key);
    },
    /** Told with each value that lands (a load answered, or `set`): the browser-side copy keeps what it can. One listener. */
    onCommit(fn: ((key: string, value: unknown, at: number) => void) | undefined): void { commitListener = fn; },
    /**
     * Puts values read from disk in, BEFORE anything is asked. Each is a starting point only: it is stale (the next use revalidates it, with since= for what is stored as a store), it is dated as it was stored,
     * and a key that already holds a value (a load answered first) is left alone. Subscribers are told.
     */
    hydrate(items: ReadonlyArray<{ key: string; value: unknown; at: number }>): void {
      for (const it of items) {
        const e = get(it.key);
        if (e.has || e.inflight) continue;
        e.has = true; e.value = it.value; e.at = it.at; e.focus = focusEpoch; e.stale = true; e.error = undefined;
        e.bytes = sizeOf(it.value); e.used = ++tick;
        touch(e);
        enforce(it.key);
        notify(it.key);
      }
    },
    invalidate(keys: string | readonly string[]): void {
      const list = typeof keys === "string" ? [keys] : keys;
      const hit = new Set<string>();
      for (const k of list) {
        if (k.endsWith("*")) { for (const key of entries.keys()) if (key.startsWith(k.slice(0, -1))) hit.add(key); }
        else if (entries.has(k)) hit.add(k);
      }
      for (const key of hit) {
        const e = entries.get(key)!;
        if ((subs.get(key)?.size ?? 0) > 0 && e.inflight) { e.stale = true; e.dirty = true; touch(e); continue; } // shown and loading: one more load follows this one, not one per invalidation
        e.stale = true; e.gen++; e.inflight = undefined; // a load that started before this cannot make the entry fresh
        touch(e);
        if ((subs.get(key)?.size ?? 0) > 0 && e.loader) void start(key, e, e.loader).catch(() => undefined);
        else notify(key);
      }
    },
    warm<T>(key: string, loader: Loader<T>): Promise<void> {
      return ensure(key, loader).then(() => undefined, () => undefined);
    },
    subscribe(key: string, fn: () => void): () => void {
      let set = subs.get(key);
      if (!set) { set = new Set(); subs.set(key, set); }
      set.add(fn);
      return () => {
        const s = subs.get(key);
        if (!s) return;
        s.delete(fn);
        if (s.size === 0) {
          subs.delete(key);
          const e = entries.get(key);
          if (e && !e.has && !e.inflight) entries.delete(key); // a subscriber's placeholder that never got a value
        }
      };
    },
    /** The tab regained focus: every value loaded before is stale for the next use; what a page is showing is revalidated now. */
    notifyFocus(): void {
      focusEpoch++;
      for (const [key, e] of entries) if ((subs.get(key)?.size ?? 0) > 0 && e.loader && !e.inflight) void start(key, e, e.loader).catch(() => undefined);
    },
    /** Drops every entry (a workspace switch). Loads in flight finish for their callers and are kept by nobody. Subscribers are told. */
    clear(): void {
      entries.clear();
      for (const key of [...subs.keys()]) notify(key);
    },
    size: () => entries.size,
    bytes: () => { let n = 0; for (const e of entries.values()) n += e.bytes; return n; },
    /** Listens for the tab regaining focus. Returns the remover. */
    installFocus(target: Pick<EventTarget, "addEventListener" | "removeEventListener"> & { document?: Document } = window): () => void {
      const onFocus = () => this.notifyFocus();
      const onVisible = () => { if (typeof document !== "undefined" && document.visibilityState === "visible") this.notifyFocus(); };
      target.addEventListener("focus", onFocus);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
      return () => { target.removeEventListener("focus", onFocus); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible); };
    },
  };
}

export type SessionCache = ReturnType<typeof createSessionCache>;

/** The app's one cache. */
export const sessionCache: SessionCache = createSessionCache();
registerCache("sessionCache", () => sessionCache.clear()); // the next person sees none of this person's pages

/** Drops the whole session cache (the person changed workspace). */
export function clearSessionCache(): void { sessionCache.clear(); }
