// Persist on the in-memory store (memoryKv). Ported from the source app's tests that call persist.ts alone (named in the README); the app's pages and bridge are left out.
import { describe, expect, test, vi } from "vitest";
import { indexedDbKv, memoryKv, Persist, FUTURE_SKEW_MS, SCHEMA, type DiskRec } from "./persist";

const P = "https://pietari.example/vault", WS = "https://team.example/vault", PERSON = P, WORKSPACE = WS;
const A = (id: string) => `${WORKSPACE}/e/${id}`;
const dump = (kv: { recs: Map<string, unknown> }) => JSON.stringify([...kv.recs.values()]);
const DAY = 24 * 60 * 60_000;

// from p154-b4.test.tsx
describe("a clock set back", () => {
  const store = (id: string, used: number): DiskRec => ({ id, principal: P, ws: WS, kind: "store", name: id, value: { records: [{ entity: `${WS}/e/1`, typeUri: "t:X" }], cursor: "c1", partial: false }, bytes: 10, used, v: SCHEMA });
  const entry = (id: string, at: number): DiskRec => ({ id, principal: P, ws: WS, kind: "entry", name: id, value: { __at: at, value: { topics: [] } }, bytes: 10, used: Date.now(), v: SCHEMA });
  test("a store or entry stamped in the future counts as expired (reloaded, and removed from the disk); a minute of skew is tolerated", async () => {
    const kv = memoryKv();
    const now = 100 * DAY;
    await kv.put([store("future", now + 2 * DAY), store("skew", now + FUTURE_SKEW_MS - 1), store("ok", now - 1000), entry("futureEntry", now + 2 * DAY), entry("okEntry", now - 1000)]);
    const p = new Persist(kv, P, { now: () => now });
    await p.adopt();
    const h = await p.hydrate(WS);
    expect(h.stores.map((s) => s.key).sort()).toEqual(["ok", "skew"]);
    expect(h.entries.map((e) => e.key)).toEqual([`${P}|${WS}|okEntry`]);
    await new Promise((x) => setTimeout(x, 0));
    expect([...kv.recs.keys()].sort()).toEqual(["ok", "okEntry", "skew"]);
  });
});

// from p154-persist.test.tsx
describe("the stored copy", () => {
  test("a store copy that does not look whole, another schema, or another person is never read (and is removed)", async () => {
    const kv = memoryKv();
    const rec = (over: Partial<DiskRec>): DiskRec => ({ id: "x", principal: PERSON, ws: WORKSPACE, kind: "store", name: "n", value: {}, bytes: 1, used: Date.now(), v: SCHEMA, ...over });
    await kv.put([
      rec({ id: "a", name: "a", value: { records: [{ entity: "e1" }], cursor: "", partial: false } }), // no position
      rec({ id: "b", name: "b", value: { records: "nope", cursor: "c" } }),
      rec({ id: "c", name: "c", v: 0, value: { records: [], cursor: "c" } }),
      rec({ id: "d", name: "d", principal: "https://other.example/vault", value: { records: [], cursor: "c" } }),
      rec({ id: "g", name: "good", value: { records: [{ entity: "e1" }], cursor: "c1", partial: false } }),
    ]);
    const p = new Persist(kv, PERSON);
    await p.adopt();
    const h = await p.hydrate(WORKSPACE);
    expect(h.stores.map((s) => s.key)).toEqual(["good"]);
    await new Promise((x) => setTimeout(x, 0));
    expect([...kv.recs.keys()].sort()).toEqual(["g"]); // the others are gone: foreign and old by adopt, malformed by hydrate
  });
});

describe("bounds and fallbacks", () => {
  test("the size bound evicts the least recently used records first and never the vault list", async () => {
    const kv = memoryKv();
    let t = 1;
    const p = new Persist(kv, PERSON, { maxBytes: 1000, now: () => t++, schedule: () => undefined });
    await p.adopt();
    p.saveVaults([{ vaultId: WORKSPACE } as never]);
    for (const n of ["one", "two", "three"]) {
      p.saveStore({ vaultId: WORKSPACE, type: n, filterKey: "", snap: { records: [{ entity: A(n), typeUri: "t:X" }], cursor: "c", partial: false }, bytes: 400 });
    }
    await p.flush();
    const names = [...kv.recs.values()].map((r) => r.name).sort();
    expect(p.size()).toBeLessThanOrEqual(1000);
    expect(names).toContain("list"); // the vault list stays
    expect(names.some((n) => n.includes("|one|"))).toBe(false); // the oldest went
    expect(names.some((n) => n.includes("|three|"))).toBe(true);
  });

  test("writes are batched: many saves are ONE put", async () => {
    const kv = memoryKv();
    const put = vi.spyOn(kv, "put");
    let fire: () => void = () => undefined;
    const p = new Persist(kv, PERSON, { schedule: (fn) => { fire = fn; return 1; } });
    await p.adopt();
    for (let i = 0; i < 20; i++) p.saveEntry(WORKSPACE, "topics", { i }, i);
    expect(put).not.toHaveBeenCalled(); // nothing on the paint path
    fire();
    await p.flush();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]![0]).toHaveLength(1); // the same key, the last value
  });


  test("a failing disk, or a refused quota: Persist carries on and the disk is off", async () => {
    expect(await indexedDbKv(undefined, "example-cache")).toBeNull();
    const bad = memoryKv();
    bad.put = async () => { throw new Error("QuotaExceededError"); };
    const p = new Persist(bad, PERSON, { schedule: () => undefined });
    await p.adopt();
    p.saveEntry(WORKSPACE, "topics", { a: 1 }, 1);
    await expect(p.flush()).resolves.toBeUndefined();
    expect(p.disk).toBe(false);
    p.saveEntry(WORKSPACE, "topics", { a: 2 }, 2); // a later save is a no-op, not a throw
    await expect(p.flush()).resolves.toBeUndefined();
    const dead = memoryKv();
    dead.read = async () => { throw new Error("gone"); };
    const q = new Persist(dead, PERSON);
    expect(await q.hydrate(WORKSPACE)).toEqual({ vaults: undefined, entries: [], stores: [] });
  });
});

// from p154-b6-persist.test.tsx
describe("persist guards", () => {
  test("P1 quota: close() while the older half is being removed: the retry is not made", async () => {
    const kv = memoryKv(); const real = { put: kv.put, remove: kv.remove };
    const pr = new Persist(kv, "A", { schedule: () => undefined });
    await pr.adopt(); pr.saveEntry("ws", "topics", { s: "old" }, 1); await pr.flush();
    let unblock!: () => void; const gate = new Promise<void>((r) => { unblock = r; });
    kv.put = async () => { throw new Error("QuotaExceededError"); };
    kv.remove = async (ids) => { await gate; return real.remove(ids); };
    pr.saveEntry("ws", "links", { s: "A-secret" }, 2);
    const f = pr.flush();
    await new Promise((r) => setTimeout(r, 10));
    pr.close(); await kv.wipe();
    let putCalls = 0; kv.put = async (rs) => { putCalls++; return real.put(rs); };
    unblock(); await f;
    expect(putCalls).toBe(0);
    expect(dump(kv)).not.toContain("A-secret");
  });
  test("P2 quota: clear() alone (no close) while the put is in flight: nothing is written after the wipe", async () => {
    const kv = memoryKv();
    let unblock!: () => void; const gate = new Promise<void>((r) => { unblock = r; });
    const real = kv.put; let n = 0;
    kv.put = async (rs) => { n++; if (n === 1) { await gate; throw new Error("QuotaExceededError"); } return real(rs); };
    const pr = new Persist(kv, "A", { schedule: () => undefined });
    await pr.adopt(); pr.saveEntry("ws", "topics", { s: "A-secret" }, 1);
    const f = pr.flush();
    await pr.clear();
    unblock(); await f;
    expect(dump(kv)).not.toContain("A-secret");
  });
  test("P3 a Persist closed by sign-out does not turn into 'disk off' state that blocks B's own new Persist", async () => {
    const kv = memoryKv();
    const a = new Persist(kv, "A", { schedule: () => undefined }); await a.adopt(); a.saveEntry("ws", "topics", { s: "A-secret" }, 1); await a.flush();
    a.close(); await a.clear();
    const b = new Persist(kv, "B", { schedule: () => undefined }); await b.adopt(); b.saveEntry("ws", "topics", { s: "B-own" }, 2); await b.flush();
    expect(dump(kv)).toContain("B-own"); expect(dump(kv)).not.toContain("A-secret");
  });
});
