// Every export is pinned, and an app's own record type that fits the structural types round-trips.
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, test } from "vitest";
import * as unit from "./index";
import { DEFAULT_MAX_BYTES, FUTURE_SKEW_MS, indexedDbKv, memoryKv, Persist, SCHEMA, STORE_MAX_AGE_MS, type DiskRec, type Kind, type Kv } from "./persist";
import type { ListedRecord, ReachableVault, RecordDoc, StoreEvent } from "./types";

const P = "https://ann.example.test/vault", WS = "https://team.example.test/vault";

describe("the public surface", () => {
  test("the library entry exports exactly these runtime names", () => {
    expect(Object.keys(unit).sort()).toEqual(["DEFAULT_MAX_BYTES", "FUTURE_SKEW_MS", "Persist", "SCHEMA", "STORE_MAX_AGE_MS", "indexedDbKv", "memoryKv"]);
  });
  test("the constants", () => {
    expect(SCHEMA).toBe(1);
    expect(DEFAULT_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(STORE_MAX_AGE_MS).toBe(24 * 60 * 60_000);
    expect(FUTURE_SKEW_MS).toBe(60_000);
  });
  test("memoryKv has these members and starts empty", async () => {
    const kv = memoryKv();
    expect(Object.keys(kv).sort()).toEqual(["index", "put", "read", "recs", "remove", "wipe"]);
    expect(kv.recs.size).toBe(0);
    expect(await kv.index()).toEqual([]);
  });
  test("a Persist has these members, a null disk is off, and the person is readable", () => {
    const p = new Persist(null, P);
    expect(p.principal).toBe(P);
    expect(p.disk).toBe(false);
    for (const m of ["adopt", "hydrate", "saveEntry", "saveStore", "saveEntryLazy", "saveVaults", "flush", "clear", "close", "size"]) expect(typeof (p as never)[m], m).toBe("function");
    expect(p.size()).toBe(0);
  });
  test("indexedDbKv has no default name: the name is a parameter and two names are two databases", async () => {
    const factory = new IDBFactory();
    // @ts-expect-error the name is required: leaving it out does not compile
    await indexedDbKv(factory);
    const a = (await indexedDbKv(factory, "name-a"))!, b = (await indexedDbKv(factory, "name-b"))!;
    const rec: DiskRec = { id: "1", principal: P, ws: WS, kind: "entry", name: "n", value: { __at: 1, value: 1 }, bytes: 1, used: 1, v: SCHEMA };
    await a.put([rec]);
    expect(await b.index()).toEqual([]);
    expect((await a.index()).length).toBe(1);
    expect([...(await factory.databases())].map((d) => d.name).filter((n) => n === "name-a" || n === "name-b").sort()).toEqual(["name-a", "name-b"]);
  });
  test("lazy entries are made when written; lazy values are not made before the flush", async () => {
    const kv = memoryKv();
    const p = new Persist(kv, P, { schedule: () => undefined });
    await p.adopt();
    let made = 0;
    p.saveEntryLazy(WS, "memo", () => { made++; return { v: 1 }; }, () => 7);
    expect(made).toBe(0);
    await p.flush();
    expect(made).toBe(1);
    const h = await new Persist(kv, P).hydrate(WS);
    expect(h.entries).toEqual([{ key: `${P}|${WS}|memo`, value: { v: 1 }, at: 7 }]);
  });
  test("a partial store cut short by a failure is not kept; a partial store without a reason is", async () => {
    const kv = memoryKv();
    const p = new Persist(kv, P, { schedule: () => undefined });
    await p.adopt();
    const snap = (reason?: string) => ({ records: [{ entity: "e1", typeUri: "t:X" }], cursor: "c", partial: true, ...(reason ? { reason } : {}) });
    p.saveStore({ vaultId: WS, type: "A", filterKey: "", snap: snap("failed"), bytes: 10 });
    p.saveStore({ vaultId: WS, type: "B", filterKey: "", snap: snap(), bytes: 10 });
    await p.flush();
    expect([...kv.recs.values()].map((r) => r.name)).toEqual([`${WS}|B|`]);
  });
  test("the stored kinds are entry, store and vaults", () => {
    const kinds: Kind[] = ["entry", "store", "vaults"];
    expect(kinds).toHaveLength(3);
  });
});

describe("an app's own record type fits the structural types and round-trips", () => {
  interface AppRecord extends ListedRecord { entity: string; typeUri: string; body: RecordDoc; ownerNote: string }
  interface AppVault extends ReachableVault { colour: string }

  test("rows and vaults of the app's own types go through memoryKv and come back whole", async () => {
    const kv: Kv & { recs: Map<string, DiskRec> } = memoryKv();
    const rows: AppRecord[] = [{ entity: `${WS}/e/1`, typeUri: "t:Note", body: { title: "One" }, ownerNote: "kept" }];
    const event: StoreEvent = { vaultId: WS, type: "Note", filterKey: "all", snap: { records: rows, cursor: "c9", partial: false }, bytes: 50 };
    const vaults: AppVault[] = [{ vaultId: WS, name: "Team", modes: ["read"], colour: "red" }];
    const p = new Persist(kv, P, { schedule: () => undefined });
    await p.adopt();
    p.saveStore(event);
    p.saveVaults(vaults);
    await p.flush();
    const back = await new Persist(kv, P).hydrate(WS);
    expect(back.stores).toEqual([{ key: `${WS}|Note|all`, snap: { records: rows, cursor: "c9", partial: false } }]);
    expect(back.vaults).toEqual(vaults);
  });
});
