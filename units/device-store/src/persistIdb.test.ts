// The real IndexedDB adapter (indexedDbKv) against fake-indexeddb 6.2.6 (a spec-complete in-memory IndexedDB), and Persist on it.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { indexedDbKv, Persist, SCHEMA, type DiskRec, type Kv } from "./persist";

const P = "https://pietari.example/vault", Q = "https://anna.example/vault", WS = "https://team.example/vault";
const rec = (over: Partial<DiskRec> = {}): DiskRec => ({ id: `${P}|${WS}|store|n`, principal: P, ws: WS, kind: "store", name: "n", value: { records: [{ entity: "e1", typeUri: "t:X" }], cursor: "c1", partial: false }, bytes: 100, used: Date.now(), v: SCHEMA, ...over });
let factory: IDBFactory;
const open = async (schema = SCHEMA): Promise<Kv> => (await indexedDbKv(factory, "example-cache", schema))!;
beforeEach(() => { factory = new IDBFactory(); });
afterEach(() => { vi.useRealTimers(); });

/** A raw connection of the kind another tab or an older build would hold. */
const raw = (version: number, setup: (db: IDBDatabase) => void, onversionchange?: () => void) => new Promise<IDBDatabase>((resolve, reject) => {
  const r = factory.open("example-cache", version);
  r.onupgradeneeded = () => setup(r.result);
  r.onsuccess = () => { if (onversionchange) r.result.onversionchange = onversionchange; resolve(r.result); };
  r.onerror = () => reject(r.error);
});

describe("open and upgrade", () => {
  test("a fresh database opens at the schema version with its two stores and the index", async () => {
    const kv = await open();
    expect(kv).toBeTruthy();
    const db = await raw(SCHEMA, () => undefined);
    expect([...db.objectStoreNames].sort()).toEqual(["data", "meta"]);
    expect(db.version).toBe(SCHEMA);
    db.close();
  });

  test("a schema bump drops the old version's data and stores (a cache is not migrated)", async () => {
    const old = await raw(1, (db) => { db.createObjectStore("legacy"); const m = db.createObjectStore("meta", { keyPath: "id" }); m.put({ id: "x", principal: P, ws: WS }); db.createObjectStore("data", { keyPath: "id" }); });
    old.close();
    const kv = await open(2);
    const db = await raw(2, () => undefined);
    expect([...db.objectStoreNames].sort()).toEqual(["data", "meta"]); // `legacy` is gone
    db.close();
    expect(await kv.index()).toEqual([]); // the old meta row is gone with its store
    await kv.put([rec()]);
    expect((await kv.read(P, WS))).toHaveLength(1);
  });

  test("a database NEWER than this code is not opened (null: the app runs from memory)", async () => {
    (await raw(5, (db) => { db.createObjectStore("meta", { keyPath: "id" }); db.createObjectStore("data", { keyPath: "id" }); })).close();
    expect(await indexedDbKv(factory, "example-cache", 1)).toBeNull();
  });

  test("no factory, or one that throws on open, is null", async () => {
    expect(await indexedDbKv(undefined, "example-cache")).toBeNull();
    expect(await indexedDbKv({ open: () => { throw new Error("SecurityError"); } } as unknown as IDBFactory, "example-cache")).toBeNull();
  });
});

describe("put, read, remove, wipe", () => {
  test("what is put is read back by person and workspace, with its value; remove and wipe delete value and index together", async () => {
    const kv = await open();
    await kv.put([rec(), rec({ id: "b", name: "b", ws: "https://other.example/vault" }), rec({ id: "c", name: "c", principal: Q })]);
    const mine = await kv.read(P, WS);
    expect(mine.map((r) => r.id)).toEqual([`${P}|${WS}|store|n`]);
    expect((mine[0]!.value as { cursor: string }).cursor).toBe("c1");
    expect((await kv.index()).map((m) => m.id).sort()).toEqual(["b", "c", `${P}|${WS}|store|n`].sort());
    await kv.remove(["b"]);
    expect((await kv.index()).some((m) => m.id === "b")).toBe(false);
    expect(await kv.read(P, "https://other.example/vault")).toEqual([]);
    await kv.wipe();
    expect(await kv.index()).toEqual([]);
    expect(await kv.read(P, WS)).toEqual([]);
  });

  test("a put replaces a record of the same id (the store's newest copy wins)", async () => {
    const kv = await open();
    await kv.put([rec()]);
    await kv.put([rec({ value: { records: [], cursor: "c2", partial: false } })]);
    const got = await kv.read(P, WS);
    expect(got).toHaveLength(1);
    expect((got[0]!.value as { cursor: string }).cursor).toBe("c2");
  });
});

describe("Persist on the real adapter", () => {
  test("the debounced batch: many saves are ONE transaction-batch put, and nothing is written before the timer", async () => {
    const kv = await open();
    const put = vi.spyOn(kv, "put");
    let fire: () => void = () => undefined;
    const p = new Persist(kv, P, { schedule: (fn) => { fire = fn; return 1; } });
    await p.adopt();
    for (let i = 0; i < 30; i++) { p.saveEntry(WS, `k${i % 3}`, { i }, i); }
    expect(put).not.toHaveBeenCalled();
    expect(await kv.index()).toEqual([]);
    fire(); await p.flush();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]![0]).toHaveLength(3);
    expect((await kv.index()).length).toBe(3);
  });

  test("the size bound evicts least recently used records first from the real store; the vault list stays", async () => {
    const kv = await open();
    let t = 1;
    const p = new Persist(kv, P, { maxBytes: 1000, now: () => t++, schedule: () => undefined });
    await p.adopt();
    p.saveVaults([{ vaultId: WS } as never]);
    for (const n of ["one", "two", "three"]) p.saveStore({ vaultId: WS, type: n, filterKey: "", snap: { records: [{ entity: `${WS}/e/${n}`, typeUri: "t:X" }], cursor: "c", partial: false }, bytes: 400 });
    await p.flush();
    const names = (await kv.index()).map((m) => m.name);
    expect(names).toContain("list");
    expect(names.some((n) => n.includes("|one|"))).toBe(false);
    expect(names.some((n) => n.includes("|three|"))).toBe(true);
    expect((await kv.index()).reduce((n, m) => n + m.bytes, 0)).toBeLessThanOrEqual(1000);
    expect((await kv.read(P, WS)).some((r) => r.name.includes("|one|"))).toBe(false); // the value went with the index row
  });

  test("the default bound is 25 MB", async () => {
    const { DEFAULT_MAX_BYTES } = await import("./persist");
    expect(DEFAULT_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  test("quota exceeded: the older half is dropped and the write retried; if that fails too, the disk is OFF for the session and nothing throws", async () => {
    const kv = await open();
    const real = kv.put.bind(kv);
    let failures = 1;
    kv.put = async (rs) => { if (failures-- > 0) throw new DOMException("full", "QuotaExceededError"); return real(rs); };
    let t = 1;
    const p = new Persist(kv, P, { schedule: () => undefined, now: () => t++ });
    await p.adopt();
    await real([rec({ id: "old1", used: 0, bytes: 5, name: "old1" }), rec({ id: "old2", used: 0, bytes: 5, name: "old2" })]);
    p.saveEntry(WS, "topics", { a: 1 }, 1);
    await expect(p.flush()).resolves.toBeUndefined();
    expect(p.disk).toBe(true); // the retry made room and wrote
    expect((await kv.index()).some((m) => m.name === "topics")).toBe(true);
    kv.put = async () => { throw new DOMException("full", "QuotaExceededError"); };
    p.saveEntry(WS, "topics", { a: 2 }, 2);
    await expect(p.flush()).resolves.toBeUndefined();
    expect(p.disk).toBe(false);
    p.saveEntry(WS, "topics", { a: 3 }, 3);
    await expect(p.flush()).resolves.toBeUndefined(); // off: a later save does nothing
  });

  test("a corrupt or partial record is skipped and REMOVED: no position, wrong shape, a data row lost, another schema, another person", async () => {
    const kv = await open();
    await kv.put([
      rec({ id: "nopos", name: "nopos", value: { records: [{ entity: "e" }], cursor: "", partial: false } }),
      rec({ id: "shape", name: "shape", value: { records: "x", cursor: "c" } }),
      rec({ id: "oldv", name: "oldv", v: 0 }),
      rec({ id: "other", name: "other", principal: Q }),
      rec({ id: "good", name: "good" }),
      rec({ id: "orphan", name: "orphan" }),
    ]);
    // a data row lost while its index row stayed (a partial store, as an eviction by the browser can leave)
    const db = await raw(SCHEMA, () => undefined);
    await new Promise<void>((res, rej) => { const t = db.transaction("data", "readwrite"); t.objectStore("data").delete("orphan"); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    db.close();
    const p = new Persist(kv, P);
    await p.adopt();
    const h = await p.hydrate(WS);
    expect(h.stores.map((s) => s.key)).toEqual(["good"]);
    await new Promise((x) => setTimeout(x, 10));
    const left = (await kv.index()).map((m) => m.id).sort();
    expect(left).toEqual(["good", "orphan"]); // `orphan` has no value: it is never returned (and a later hydrate or eviction clears its index row)
    expect((await kv.read(P, WS)).map((r) => r.id)).toEqual(["good"]);
  });

  test("a sign-out wipes everything; a principal change deletes the person before's records and keeps no one else's", async () => {
    const kv = await open();
    await kv.put([rec(), rec({ id: "q1", name: "q1", principal: Q }), rec({ id: "v", kind: "vaults", ws: "", name: "list", value: [] })]);
    const next = new Persist(kv, "https://third.example/vault");
    await next.adopt();
    expect(await kv.index()).toEqual([]); // a third person: nothing of P or Q stays
    await kv.put([rec()]);
    await new Persist(kv, P).clear();
    expect(await kv.index()).toEqual([]);
  });
});

describe("two tabs", () => {
  test("two connections at the same version work side by side", async () => {
    const a = await open(), b = await open();
    await a.put([rec()]);
    expect((await b.read(P, WS)).length).toBe(1);
  });

  test("a newer tab upgrading is NOT blocked by this one: this connection closes on versionchange, the newer opens, this tab's disk turns off without hanging", async () => {
    const a = await open(1);
    const pa = new Persist(a, P, { schedule: () => undefined });
    await pa.adopt();
    const t0 = Date.now();
    const b = await open(2);
    expect(b).toBeTruthy(); // not null: it was not blocked
    expect(Date.now() - t0).toBeLessThan(1000);
    pa.saveEntry(WS, "topics", { a: 1 }, 1);
    await expect(pa.flush()).resolves.toBeUndefined(); // the closed connection fails; Persist swallows it
    expect(pa.disk).toBe(false);
    await b.put([rec()]);
    expect((await b.read(P, WS)).length).toBe(1);
  });

  test("an old tab that never lets go blocks the upgrade: the open answers null at once (the app runs from memory), and never hangs", async () => {
    const stubborn = await raw(1, (db) => { db.createObjectStore("meta", { keyPath: "id" }); db.createObjectStore("data", { keyPath: "id" }); }); // no onversionchange: it holds
    const t0 = Date.now();
    const kv = await indexedDbKv(factory, "example-cache", 2);
    expect(kv).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    stubborn.close(); // it lets go later: the connection that then opens must be closed, not leaked
    await new Promise((x) => setTimeout(x, 20));
    const after = await open(2);
    expect(after).toBeTruthy(); // nothing is left holding the version
  });
});

