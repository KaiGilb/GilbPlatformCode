// The one piece of glue: one app name wires the person hub, the session cache, the background jobs, the prefetch registry and the device store,
// so that a change of person or a sign-out leaves nothing of the person before in any of them. The units do the work; this only connects them.
import { createBackgroundJobs, type BackgroundJobs, type BackgroundJobsOptions } from "@kaigilb/gilbplatformcode-background-jobs";
import { indexedDbKv, Persist, type Hydrated, type Kv, type PersistOptions } from "@kaigilb/gilbplatformcode-device-store";
import { createPrefetchRegistry, type PrefetchRegistry, type WarmContext } from "@kaigilb/gilbplatformcode-prefetch-registry";
import { principalGuard, registerCache, setPrincipal } from "@kaigilb/gilbplatformcode-principal-hub";
import { keyParts, sessionCache, type SessionCache } from "@kaigilb/gilbplatformcode-session-cache";

export interface SpeedKitOptions {
  /** The app's own name. The storage key of the jobs, the name of the browser database and the names under which the parts register with the hub are made from it. */
  appName: string;
  /** The job store's options. The kit supplies `storageKey` and `cacheNames` from the app name. */
  jobs: Omit<BackgroundJobsOptions, "storageKey" | "cacheNames">;
  /** The resources (the last part of a cache key) whose values are plain data and are kept on the device. Default: none. */
  persistResources?: readonly string[];
  /** The session cache. Default: the one the session-cache unit makes. */
  cache?: SessionCache;
  /** Opens the device's database. Default: IndexedDB under `<appName>-cache`. */
  openKv?: () => Promise<Kv | null>;
}
export interface StartOptions {
  /** The workspace whose copy is read now. Default: none (only the vault list is read). */
  workspace?: string;
  /** How long start() waits for the disk before it goes on without it (default 400 ms). */
  waitMs?: number;
  persist?: PersistOptions;
  /** Gets what was read from the disk besides the cache entries (stores, vault list). Not called when the person changed in the meantime. */
  onHydrated?: (h: Hydrated) => void;
}

export function createSpeedKit<Ctx extends WarmContext = WarmContext>(o: SpeedKitOptions) {
  const cache = o.cache ?? sessionCache;
  const openKv = o.openKv ?? (() => indexedDbKv(undefined, `${o.appName}-cache`));
  const persistable = new Set(o.persistResources ?? []);
  const jobs: BackgroundJobs = createBackgroundJobs({ ...o.jobs, storageKey: `${o.appName}.jobIntents`, cacheNames: { views: `${o.appName}.jobs`, intents: `${o.appName}.jobIntents` } });
  const prefetch: PrefetchRegistry<Ctx> = createPrefetchRegistry<Ctx>({ cacheName: `${o.appName}.prefetch` });
  let persist: Persist | null = null;
  let wiping: Promise<void> = Promise.resolve();

  /** The person's copy on the device is closed and wiped; the next start waits for the wipe. */
  function stopDisk(): Promise<void> {
    cache.onCommit(undefined);
    const p = persist;
    persist = null;
    if (p) { p.close(); wiping = wiping.then(() => p.clear()); }
    return wiping;
  }
  // A cache made by createSessionCache is not registered with the hub (only the unit's own one is): the kit does it, so a change of person empties whichever cache the app uses.
  registerCache(`${o.appName}.sessionCache`, () => cache.clear());
  // The hub tells every registered part when the person changes: the device copy goes with the memory.
  registerCache(`${o.appName}.deviceStore`, (next) => { if (persist && persist.principal !== next) void stopDisk(); });

  /** Sign-in, or a change of person: says whose tab this is, then reads this person's copy from the device BEFORE the network. Never rejects for a slow or missing disk. */
  async function start(principal: string, s: StartOptions = {}): Promise<{ disk: boolean; hydrated: boolean }> {
    setPrincipal(principal);
    const alive = principalGuard(); // taken now, before any await: a change of person from here on drops what this start reads
    jobs.setJobPrincipal(principal);
    cache.onCommit(undefined);
    persist?.close(); // the same person again: the earlier run writes nothing more (another person was already stopped and wiped by the hub)
    persist = null;
    await wiping;
    const work = (async () => {
      const kv = await openKv();
      if (!alive()) return false;
      const p = new Persist(kv, principal, s.persist);
      persist = p;
      // Listening starts now, before the slow reads: a network answer that commits while the disk is still being read is saved too (Persist queues and flushes on its own timer).
      cache.onCommit((key, value, at) => { const k = keyParts(key); if (k.principal === p.principal && persistable.has(k.resource)) p.saveEntry(k.workspace, k.resource, value, at); });
      await p.adopt();
      const h = await p.hydrate(s.workspace ?? "");
      if (!alive()) return false;
      cache.hydrate(h.entries);
      s.onHydrated?.(h);
      return h.entries.length + h.stores.length + (h.vaults ? 1 : 0) > 0;
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hydrated = await Promise.race([work.catch(() => false), new Promise<false>((r) => { timer = setTimeout(() => r(false), s.waitMs ?? 400); })]);
    clearTimeout(timer);
    return { disk: (persist as Persist | null)?.disk ?? false, hydrated };
  }

  /** The copy of a workspace the person switched to, read from the device. */
  async function hydrateWorkspace(ws: string): Promise<void> {
    const p = persist;
    if (!p || !ws) return;
    const alive = principalGuard();
    const h = await p.hydrate(ws);
    if (alive()) cache.hydrate(h.entries);
  }

  /** Sign-out: nobody is signed in, the memory is cleared, and the copy on the device is wiped, whoever it belonged to (also when no copy was running). */
  async function end(): Promise<void> {
    const had = persist !== null; // asked before the hub's clear stops the copy
    setPrincipal(null);
    await stopDisk();
    if (!had) { try { await (await openKv())?.wipe(); } catch { /* the copy is a cache */ } }
  }

  return { appName: o.appName, cache, jobs, prefetch, start, hydrateWorkspace, end, persistResource: (name: string) => { persistable.add(name); }, currentPersist: () => persist };
}
export type SpeedKit<Ctx extends WarmContext = WarmContext> = ReturnType<typeof createSpeedKit<Ctx>>;
