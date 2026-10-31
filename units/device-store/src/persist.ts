// the browser's stored copy of what the app has read. The copy is a STARTING POINT, never an answer:
//   - it is keyed by person (principal) and workspace, and carries a schema version; another person's records, an older schema or a record that does not look whole are dropped, never read;
//   - what is read from it is stale on arrival: the next use catches up with since= from the stored position (a store) or reloads (an entry); an invalid position is a full reload, as without a copy;
//   - a missing or partial copy is "no cache" (iOS Safari may delete script-written storage after ~7 days without a visit), never "no data";
//   - writes are debounced and batched, off the paint path, and the copy is bounded (default 25 MB, least recently used first); any failure (no IndexedDB, private mode, quota) turns the disk off for the session and the
//     memory cache carries on exactly as it did.
// This file knows nothing of React or of the pages. The host connects it to its in-memory cache and its vault client.
import type { ListedRecord, RecordDoc, ReachableVault, StoreEvent } from "./types";

export const SCHEMA = 1;
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
/**
 * A stored STORE older than this is not used (it is deleted and the type is loaded in full). The change feed `since=` reports live rows only: a record ended or deleted elsewhere is not in it (GilbPlatform
 * src/lws/records.ts: `lifecycle=ended` is a separate list with its own cursor), so a copy that has missed days of changes could still hold such a row. A full reload bounds that to a day.
 */
export const STORE_MAX_AGE_MS = 24 * 60 * 60_000;
export type Kind = "entry" | "store" | "vaults";
/** One stored record: small metadata (kept in an index) and its value. */
export interface DiskRec { id: string; principal: string; ws: string; kind: Kind; name: string; value: unknown; bytes: number; used: number; v: number }
type Meta = Omit<DiskRec, "value">;

/** The storage underneath: IndexedDB in the browser, a Map in tests. Every method may reject; Persist treats that as "disk off". */
export interface Kv {
  read(principal: string, ws: string): Promise<DiskRec[]>;
  index(): Promise<Meta[]>;
  put(recs: DiskRec[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  wipe(): Promise<void>;
}

export function memoryKv(): Kv & { recs: Map<string, DiskRec> } {
  const recs = new Map<string, DiskRec>();
  const meta = ({ value: _v, ...m }: DiskRec): Meta => m;
  return {
    recs,
    read: async (principal, ws) => [...recs.values()].filter((r) => r.principal === principal && r.ws === ws).map((r) => structuredClone(r)),
    index: async () => [...recs.values()].map(meta),
    put: async (rs) => { for (const r of rs) recs.set(r.id, structuredClone(r)); },
    remove: async (ids) => { for (const i of ids) recs.delete(i); },
    wipe: async () => { recs.clear(); },
  };
}

/** IndexedDB, or null when it is not there or will not open (private mode, blocked, a newer schema than this code). An older schema is wiped by the upgrade. */
export function indexedDbKv(factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB, name: string, schema = SCHEMA): Promise<Kv | null> {
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    let settled = false;
    const settle = (kv: Kv | null) => { if (!settled) { settled = true; resolve(kv); } };
    try { req = factory.open(name, schema); } catch { settle(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const n of Array.from(db.objectStoreNames)) db.deleteObjectStore(n); // an older schema is not migrated: it is a cache
      const m = db.createObjectStore("meta", { keyPath: "id" });
      m.createIndex("pw", ["principal", "ws"]);
      db.createObjectStore("data", { keyPath: "id" });
    };
    req.onerror = () => settle(null);
    // Another tab holds an older connection that does not let go: do not wait for it (the app runs from memory); if it lets go later, the connection that then opens is closed, not leaked.
    req.onblocked = () => settle(null);
    req.onsuccess = () => {
      const db = req.result;
      // Another tab (a newer build) wants to upgrade: this connection closes at once so that tab is never blocked by this one. Later calls here fail, and Persist turns the disk off.
      db.onversionchange = () => db.close();
      if (settled) { db.close(); return; }
      settle(wrap(db));
    };
  });
}

const done = <T>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const finished = (t: IDBTransaction): Promise<void> => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
function wrap(db: IDBDatabase): Kv {
  return {
    async read(principal, ws) {
      const t = db.transaction(["meta", "data"], "readonly");
      const metas = (await done(t.objectStore("meta").index("pw").getAll([principal, ws]))) as Meta[];
      const out: DiskRec[] = [];
      for (const m of metas) { const d = (await done(t.objectStore("data").get(m.id))) as { id: string; value: unknown } | undefined; if (d) out.push({ ...m, value: d.value }); }
      return out;
    },
    async index() { return (await done(db.transaction("meta", "readonly").objectStore("meta").getAll())) as Meta[]; },
    async put(recs) {
      const t = db.transaction(["meta", "data"], "readwrite");
      for (const { value, ...m } of recs) { t.objectStore("meta").put(m); t.objectStore("data").put({ id: m.id, value }); }
      await finished(t);
    },
    async remove(ids) {
      const t = db.transaction(["meta", "data"], "readwrite");
      for (const id of ids) { t.objectStore("meta").delete(id); t.objectStore("data").delete(id); }
      await finished(t);
    },
    async wipe() {
      const t = db.transaction(["meta", "data"], "readwrite");
      t.objectStore("meta").clear(); t.objectStore("data").clear();
      await finished(t);
    },
  };
}

export interface Hydrated {
  vaults: ReachableVault[] | undefined;
  entries: Array<{ key: string; value: unknown; at: number }>;
  stores: Array<{ key: string; snap: { records: Array<ListedRecord & { body?: RecordDoc }>; cursor: string; partial: boolean } }>;
}
export interface PersistOptions { maxBytes?: number; now?: () => number; flushMs?: number; /** how a flush is scheduled (tests flush by hand) */ schedule?: (fn: () => void, ms: number) => unknown }

/** A stored stamp counts only if it is not in the future: a device clock set back (or a copy from a clock that was ahead) makes the age negative, and such a copy is expired, so it is reloaded. A minute of skew is tolerated. */
export const FUTURE_SKEW_MS = 60_000;
const fresh = (now: number, stamp: number, maxAge: number): boolean => stamp <= now + FUTURE_SKEW_MS && now - stamp <= maxAge;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export class Persist {
  private readonly pending = new Map<string, DiskRec>();
  private index = new Map<string, Meta>();
  private timer: unknown;
  private off = false;
  private readonly max: number;
  private readonly now: () => number;
  private readonly flushMs: number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly kv: Kv | null;
  readonly principal: string;
  constructor(kv: Kv | null, principal: string, o: PersistOptions = {}) {
    this.kv = kv;
    this.principal = principal;
    this.max = o.maxBytes ?? DEFAULT_MAX_BYTES;
    this.now = o.now ?? (() => Date.now());
    this.flushMs = o.flushMs ?? 400;
    this.schedule = o.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    if (!kv) this.off = true;
  }
  get disk(): boolean { return !this.off; }
  /** The person this copy was for is gone: it writes nothing more (what is queued is dropped; a write already sent was ordered before whatever wipes the disk next). */
  close(): void { this.closed = true; this.pending.clear(); }
  private closed = false;
  private id(ws: string, kind: Kind, name: string): string { return `${this.principal}|${ws}|${kind}|${name}`; }

  /** The first act for a person: records of ANY OTHER person on this device are deleted (a principal change clears the store), and the index is read. */
  async adopt(): Promise<void> {
    if (this.off) return;
    try {
      const all = await this.kv!.index();
      const foreign = all.filter((m) => m.principal !== this.principal || m.v !== SCHEMA);
      if (foreign.length) await this.kv!.remove(foreign.map((m) => m.id));
      this.index = new Map(all.filter((m) => !foreign.includes(m)).map((m) => [m.id, m]));
    } catch { this.off = true; }
  }

  /** What the disk holds for this person's list of vaults and for one workspace. Records that do not look whole are skipped and removed. Never rejects. */
  async hydrate(ws: string): Promise<Hydrated> {
    const out: Hydrated = { vaults: undefined, entries: [], stores: [] };
    if (this.off) return out;
    let recs: DiskRec[];
    try { recs = [...(await this.kv!.read(this.principal, "")), ...(ws ? await this.kv!.read(this.principal, ws) : [])]; } catch { this.off = true; return out; }
    const bad: string[] = [];
    for (const r of recs) {
      if (r.principal !== this.principal || r.v !== SCHEMA) { bad.push(r.id); continue; }
      if (r.kind === "vaults") {
        if (Array.isArray(r.value) && r.value.every((x) => isObj(x) && typeof x.vaultId === "string")) out.vaults = r.value as ReachableVault[]; else bad.push(r.id);
      } else if (r.kind === "entry") {
        const w = r.value;
        if (isObj(w) && typeof w.__at === "number" && "value" in w && fresh(this.now(), w.__at, Infinity)) out.entries.push({ key: `${this.principal}|${r.ws}|${r.name}`, value: w.value, at: w.__at }); else bad.push(r.id);
      } else if (r.kind === "store") {
        const v = r.value;
        if (!fresh(this.now(), r.used, STORE_MAX_AGE_MS)) bad.push(r.id);
        else if (isObj(v) && Array.isArray(v.records) && typeof v.cursor === "string" && v.cursor !== "" && v.records.every((x) => isObj(x) && typeof x.entity === "string")) {
          out.stores.push({ key: r.name, snap: { records: v.records as never, cursor: v.cursor, partial: v.partial === true } });
        } else bad.push(r.id);
      }
      const m = this.index.get(r.id); if (m) { m.used = this.now(); }
    }
    if (bad.length) { void this.kv!.remove(bad).catch(() => undefined); for (const i of bad) this.index.delete(i); }
    return out;
  }

  private queue(rec: DiskRec): void {
    if (this.off || this.closed) return;
    this.pending.set(rec.id, rec);
    if (this.timer === undefined) this.timer = this.schedule(() => { this.timer = undefined; void this.flush(); }, this.flushMs);
  }
  saveEntry(ws: string, name: string, value: unknown, at: number): void { this.queue({ id: this.id(ws, "entry", name), principal: this.principal, ws, kind: "entry", name, value: { __at: at, value }, bytes: 0, used: this.now(), v: SCHEMA }); }
  saveStore(e: StoreEvent): void {
    if (e.snap.partial && e.snap.reason !== undefined) return; // a copy a failure cut short is not worth keeping
    const name = `${e.vaultId}|${e.type}|${e.filterKey}`;
    this.queue({ id: this.id(e.vaultId, "store", name), principal: this.principal, ws: e.vaultId, kind: "store", name, value: { records: e.snap.records, cursor: e.snap.cursor, partial: e.snap.partial }, bytes: e.bytes, used: this.now(), v: SCHEMA });
  }
  /** An entry whose value is made when it is written (not at every change): the read memo is one large object that changes often. */
  saveEntryLazy(ws: string, name: string, make: () => unknown, at: () => number): void { this.queue({ id: this.id(ws, "entry", name), principal: this.principal, ws, kind: "entry", name, value: () => ({ __at: at(), value: make() }), bytes: 0, used: this.now(), v: SCHEMA }); }
  saveVaults(list: ReachableVault[]): void { this.queue({ id: this.id("", "vaults", "list"), principal: this.principal, ws: "", kind: "vaults", name: "list", value: list, bytes: 0, used: this.now(), v: SCHEMA }); }

  /** Writes what is queued (one batch), then brings the copy back under its bound. Never rejects; a failure turns the disk off. */
  async flush(): Promise<void> {
    if (this.off || this.closed || this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const r of batch) {
      if (typeof r.value === "function") r.value = (r.value as () => unknown)();
      if (r.kind === "store" && r.bytes > 0) continue;
      try { r.bytes = JSON.stringify(r.value).length; } catch { r.bytes = 0; }
    }
    try {
      await this.kv!.put(batch);
      for (const r of batch) { const { value: _v, ...m } = r; this.index.set(r.id, m); }
      await this.enforce();
    } catch (e) {
      if (this.closed) return; // (closed while this write was in flight: no retry)
      // Quota (or any failure): drop the older half once and try again; if that fails too the disk is off for this session.
      if (!(await this.shrinkAndRetry(batch))) this.off = true;
    }
  }
  private async shrinkAndRetry(batch: DiskRec[]): Promise<boolean> {
    if (this.closed) return true; // the person is gone (a sign-out may have wiped the disk): nothing is written, and that is not a failure of the disk
    try {
      const old = [...this.index.values()].filter((m) => m.kind !== "vaults").sort((a, b) => a.used - b.used);
      const drop = old.slice(0, Math.ceil(old.length / 2)).map((m) => m.id);
      if (drop.length) { await this.kv!.remove(drop); for (const i of drop) this.index.delete(i); }
      if (this.closed) return true; // closed while the older half was being dropped: the retry is not made
      await this.kv!.put(batch);
      for (const r of batch) { const { value: _v, ...m } = r; this.index.set(r.id, m); }
      return true;
    } catch { return false; }
  }
  /** Least recently used records go first, until the total is within the bound. The vault list is never evicted. */
  private async enforce(): Promise<void> {
    let total = 0;
    for (const m of this.index.values()) total += m.bytes;
    if (total <= this.max) return;
    const order = [...this.index.values()].filter((m) => m.kind !== "vaults").sort((a, b) => a.used - b.used);
    const drop: string[] = [];
    for (const m of order) { if (total <= this.max) break; total -= m.bytes; drop.push(m.id); }
    if (drop.length) { await this.kv!.remove(drop); for (const i of drop) this.index.delete(i); }
  }
  /** Bytes the copy holds (as of the last flush). */
  size(): number { let n = 0; for (const m of this.index.values()) n += m.bytes; return n; }

  /** Sign-out: everything goes, whoever it belonged to. */
  async clear(): Promise<void> {
    this.closed = true; // whatever is still on its way (a retry after a quota failure) writes nothing after this wipe
    this.pending.clear();
    this.index = new Map();
    if (this.off) return;
    try { await this.kv!.wipe(); } catch { this.off = true; }
  }
}
