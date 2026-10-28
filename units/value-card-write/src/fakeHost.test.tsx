// The fake host the other tests stand on, tested against what the app's own stack does: a pinned row survives a re-read that is
// late, a dropped row does not come back, a narrowed re-read reads only its members fresh, the newest copy of a row wins.
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { PlanFind } from "./index";
import { makeBrowser, planRecordKey } from "../test/fakeHost";
import { createServer, entityUriOf, type Srv } from "../test/server";

const server = createServer();
beforeEach(() => server.reset());
const PV = "https://h.example.test/base";
const PARENT = "val1";

const put = (id: string, served: Record<string, unknown> = {}) =>
  server.set({ id, typeUri: "t:Thing", served: { partOf: { "@id": entityUriOf(PARENT) }, unitTag: id, ...served }, n: 0 } satisfies Srv);
const rowOf = (id: string, over: Partial<BaseRecord> = {}) => ({ ...server.asRow(server.get(id)!), ...over }) as unknown as BaseRecord;
const ids = (f: PlanFind | undefined) => (f?.rows ?? []).map((r) => r.id);

describe("the find of the children of a record", () => {
  it("is read from the vault: the records that are a part of the parent, each read", async () => {
    put("a");
    put("b");
    const b = makeBrowser(server);
    const find = await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    expect(ids(find).sort()).toEqual(["a", "b"]);
    expect(find).toMatchObject({ total: 2, capped: false, unread: 0 });
    expect(b.host.cachedPlanFind(PV, "a:partOf", PARENT)).toBe(find);
  });

  it("counts a member that cannot be read as unread", async () => {
    put("a");
    const b = makeBrowser(server);
    b.host.readRecord.mockImplementation(async () => {
      throw new Error("offline");
    });
    const find = await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    expect(find).toMatchObject({ rows: [], total: 1, unread: 1 });
  });

  it("a fetch inside its stale time is the cached find; with 0 it is read again", async () => {
    put("a");
    const b = makeBrowser(server);
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 15_000 });
    put("b");
    expect(ids(await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 15_000 }))).toEqual(["a"]);
    expect(ids(await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 })).sort()).toEqual(["a", "b"]);
  });
});

describe("a pinned row and a dropped row", () => {
  it("a row pinned at the head survives a re-read that does not return it yet", async () => {
    put("a");
    const b = makeBrowser(server);
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    b.host.prependPlanFind(PV, "a:partOf", PARENT, rowOf("a", { id: "late", entityUri: entityUriOf("late") }), { refresh: false });
    expect(ids(b.host.cachedPlanFind(PV, "a:partOf", PARENT))).toEqual(["late", "a"]);
    const again = await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    expect(ids(again)).toEqual(["late", "a"]);
  });

  it("a row dropped stays out of a re-read that still returns it, until the vault stops returning it", async () => {
    put("a");
    put("b");
    const b = makeBrowser(server);
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    b.host.dropPlanFind(PV, "a:partOf", PARENT, "a", { refresh: false });
    expect(ids(b.host.cachedPlanFind(PV, "a:partOf", PARENT))).toEqual(["b"]);
    expect(ids(await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 }))).toEqual(["b"]);
    server.recs.delete("a");
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    put("a");
    expect(ids(await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 })).sort()).toEqual(["a", "b"]);
  });

  it("a patch of one record is shown on every find that holds it, and in the pinned row", async () => {
    put("a");
    const b = makeBrowser(server);
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    b.host.prependPlanFind(PV, "a:partOf", PARENT, rowOf("a"), { refresh: false });
    b.host.patchPlanFindRows(PV, "a", (r) => ({ ...r, facts: { ...r.facts, unitTag: "changed" } }));
    expect(b.host.cachedPlanFind(PV, "a:partOf", PARENT)!.rows[0]!.facts.unitTag).toBe("changed");
    expect(b.pins.get(`${PV}\na:partOf\n${PARENT}`)![0]!.facts.unitTag).toBe("changed");
  });
});

describe("a re-read of named members", () => {
  it("reads the named members from the vault and leaves the others on their cached row", async () => {
    put("a", { name: "old-a" });
    put("b", { name: "old-b" });
    const b = makeBrowser(server);
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    server.get("a")!.served.name = "new-a";
    server.get("b")!.served.name = "new-b";
    await b.host.invalidatePlanFind(PV, "a:partOf", PARENT, { members: [entityUriOf("a")] });
    // The find was inactive, so nothing was read yet; the next read of it takes the named member fresh.
    const find = await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    const name = (id: string) => find.rows.find((r) => r.id === id)!.facts.name;
    expect(name("a")).toBe("new-a");
    expect(name("b")).toBe("old-b");
  });

  it("with no members named every member is read fresh", async () => {
    put("a", { name: "old-a" });
    const b = makeBrowser(server);
    await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    server.get("a")!.served.name = "new-a";
    await b.host.invalidatePlanFind(PV, "a:partOf", PARENT);
    const find = await b.host.fetchPlanFind(PV, "a:partOf", PARENT, entityUriOf(PARENT), { staleTime: 0 });
    expect(find.rows[0]!.facts.name).toBe("new-a");
  });
});

describe("the row cache", () => {
  it("the newest of the list's row, the record read and the fallback wins; the greater updatedAt, then the one with a version", () => {
    const b = makeBrowser(server);
    const row = (id: string, updatedAt: number, etag: string | null) => ({ id, typeUri: "t:Thing", facts: {}, opaqueFacts: [], etag, updatedAt }) as unknown as BaseRecord;
    b.host.storePlanRow(PV, row("r", 5, '"a"'), { insert: true });
    expect(b.host.liveRow(PV, "r", row("r", 3, '"z"')).etag).toBe('"a"');
    expect(b.host.liveRow(PV, "r", row("r", 9, '"z"')).etag).toBe('"z"');
    expect(b.host.liveRow(PV, "x", row("x", 1, null)).updatedAt).toBe(1);
    // A row that has no updatedAt is stamped.
    expect(typeof b.host.liveRow(PV, "x", { ...row("x", 0, null), updatedAt: undefined } as unknown as BaseRecord).updatedAt).toBe("number");
  });

  it("a stored row replaces itself in the lists that hold it and never adds without insert", () => {
    const b = makeBrowser(server);
    const row = { id: "r", typeUri: "t:Thing", facts: { n: "1" }, opaqueFacts: [], etag: '"a"', updatedAt: 1 } as unknown as BaseRecord;
    b.host.storePlanRow(PV, row);
    expect(b.lists.get(PV)).toBeUndefined();
    b.host.storePlanRow(PV, row, { insert: true });
    b.host.storePlanRow(PV, { ...row, facts: { n: "2" } });
    expect(b.lists.get(PV)!.map((r) => r.facts.n)).toEqual(["2"]);
  });

  it("a read of a record without a version is made, stored, and the version is given back; unreadable and conflict are told", async () => {
    put("a", { name: "x" });
    const b = makeBrowser(server);
    const held = { ...rowOf("a"), updatedAt: 1 } as never;
    const bare = { ...rowOf("a"), etag: null, updatedAt: 1 } as never;
    const ok = await b.host.ensureEtagUnchanged(PV, bare, () => true);
    expect("row" in ok && ok.row.etag).toBe('"v0"');
    expect(await b.host.ensureEtagUnchanged(PV, bare, () => false)).toEqual({ conflict: true });
    server.recs.delete("a");
    expect(await b.host.ensureEtagUnchanged(PV, bare, () => true)).toEqual({ unreadable: true });
    expect(await b.host.ensureEtagUnchanged(PV, held, () => false)).toEqual({ row: held });
  });

  it("a conflict is reconciled by reading the record into the lists and the record read", async () => {
    put("a", { name: "theirs" });
    const b = makeBrowser(server);
    const fresh = await b.host.reconcileAfterConflict(PV, { id: "a", entityUri: entityUriOf("a") });
    expect(fresh!.facts.name).toBe("theirs");
    expect(b.lists.get(PV)![0]!.id).toBe("a");
    expect(b.qc.getQueryData(planRecordKey("a", entityUriOf("a")))).toBe(fresh);
    server.recs.delete("a");
    expect(await b.host.reconcileAfterConflict(PV, { id: "a", entityUri: entityUriOf("a") })).toBeNull();
  });
});

describe("the vault", () => {
  it("answers 409 to a tag another record holds, and a stale version with the conflict class", async () => {
    const s = createServer({ ifMatch: true, patchTagCheck: true });
    s.set({ id: "a", typeUri: "t:Thing", served: { unitTag: "T" }, n: 0 });
    s.set({ id: "b", typeUri: "t:Thing", served: { unitTag: "U" }, n: 0 });
    await expect(s.patch("b", { unitTag: "T" })).rejects.toMatchObject({ status: 409 });
    await expect(s.patch("b", { x: "1" }, { ifMatch: '"v7"' })).rejects.toMatchObject({ status: 412 });
    expect(await s.patch("b", { x: "1" }, { ifMatch: '"v0"' })).toEqual({ etag: '"v1"' });
  });
});
