// The writes of a Value's child records, called directly with a toy kind of child (a "thing" with a name), so each rule is seen alone:
// the order of the host calls of a create, the next-suffix retry of a taken tag, the conflict of a patch, the end of a record, and the
// migration of a record of an older shape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  ChildConflict,
  MoveStopped,
  createChild,
  endChild,
  endMade,
  endRow,
  findRowsOf,
  httpStatus,
  migrateChild,
  patchChild,
  rowFor,
  rowLabel,
  type ChildEnv,
  type ChildKind,
  type ParentRef,
} from "./index";
import { makeBrowser, planFindKey } from "../test/fakeHost";
import { createServer, entityUriOf, type Srv } from "../test/server";

type Thing = { name: string; note?: string };
const PV = "https://h.example.test/base";
const PARENT: ParentRef = { id: "val1", uri: entityUriOf("val1") };

const thing: ChildKind<Thing> = {
  noun: "thing",
  typeName: () => "Thing",
  isType: (t) => t === "t:Thing",
  tag: (i) => `Speed.${i.name}`,
  createFacts: (i, tag, parentUri, order) => ({ unitTag: tag, partOf: { "@id": parentUri }, elementOrder: order, name: i.name, ...(i.note ? { note: i.note } : {}) }),
  patch: (row, i) => {
    const out: Record<string, unknown> = {};
    if ((row.served?.facts?.name ?? row.facts.name) !== i.name) out.name = i.name;
    return out;
  },
};

const server = createServer({ ifMatch: true, patchTagCheck: true });
beforeEach(() => {
  server.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function setup(extra: Partial<ChildEnv> = {}) {
  const b = makeBrowser(server);
  const notices: string[] = [];
  const touched = vi.fn();
  const env: ChildEnv = { host: b.host, planVault: PV, del: b.deleteMutation, recs: new Map(), touched, notice: (t) => notices.push(t), ...extra };
  return { b, env, notices, touched };
}

/** A stored record of the toy kind, known to the vault and to the browser's finds. */
function stored(b: ReturnType<typeof makeBrowser>, id: string, served: Record<string, unknown>, typeUri = "t:Thing", n = 0): BaseRecord {
  server.set({ id, typeUri, served: { partOf: { "@id": PARENT.uri }, ...served }, n } satisfies Srv);
  const row = { ...server.asRow(server.get(id)!), updatedAt: 1 } as unknown as BaseRecord;
  const prev = b.qc.getQueryData<{ rows: BaseRecord[] }>(planFindKey(PV, "a:partOf", PARENT.id));
  b.qc.setQueryData(planFindKey(PV, "a:partOf", PARENT.id), { rows: [...(prev?.rows ?? []), row], total: 1, capped: false, unread: 0 });
  return row;
}

describe("httpStatus", () => {
  it("is the numeric status of a failure, and nothing for anything else", () => {
    expect(httpStatus(Object.assign(new Error("x"), { status: 409 }))).toBe(409);
    expect(httpStatus({ status: 0 })).toBe(0);
    expect(httpStatus({ status: "409" })).toBeUndefined();
    expect(httpStatus(new Error("x"))).toBeUndefined();
    expect(httpStatus(null)).toBeUndefined();
    expect(httpStatus("409")).toBeUndefined();
    expect(httpStatus(undefined)).toBeUndefined();
  });
});

describe("rowLabel", () => {
  it("is the record's tag, else its id", () => {
    expect(rowLabel({ id: "rec1", typeUri: "t:Thing", facts: { unitTag: "Speed.A" }, opaqueFacts: [], etag: null })).toBe("Speed.A");
    expect(rowLabel({ id: "rec1", typeUri: "t:Thing", facts: {}, opaqueFacts: [], etag: null })).toBe("rec1");
  });
});

describe("ChildConflict and MoveStopped", () => {
  it("are errors the card tells apart with instanceof", () => {
    const c = new ChildConflict("changed");
    expect(c).toBeInstanceOf(Error);
    expect(c).toBeInstanceOf(ChildConflict);
    expect(c.message).toBe("changed");
    expect(new Error("x")).not.toBeInstanceOf(ChildConflict);
  });
  it("a move that stopped carries the reason, its message and the undo", async () => {
    const undo = async () => ["Speed.A"];
    const m = new MoveStopped(new Error("create refused"), undo);
    expect(m).toBeInstanceOf(Error);
    expect(m.message).toBe("create refused");
    expect(m.reason).toBeInstanceOf(Error);
    expect(m.undo).toBe(undo);
    expect(await m.undo()).toEqual(["Speed.A"]);
    expect(new MoveStopped("not an error", undo).message).toBe("The move stopped.");
  });
});

describe("findRowsOf and rowFor", () => {
  it("read the rows the host holds now, and the record made in this session first", () => {
    const { b, env } = setup();
    expect(findRowsOf(env, PARENT.id)).toEqual([]);
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    expect(findRowsOf(env, PARENT.id)).toEqual([row]);
    expect(b.host.cachedPlanFind).toHaveBeenCalledWith(PV, "a:partOf", PARENT.id);
    expect(rowFor(env, PARENT.id, "t1")).toBe(row);
    expect(rowFor(env, PARENT.id, "nope")).toBeUndefined();
    const mine = { ...row, id: "mine" };
    env.recs.set("t1", mine);
    expect(rowFor(env, PARENT.id, "t1")).toBe(mine);
  });
});

describe("createChild", () => {
  it("makes the record, then reads it, remembers it, marks it, stores it, drops the pickers' searches and pins it, in that order", async () => {
    const { b, env } = setup();
    const row = await createChild(env, thing, PARENT, "new:1", { name: "A" });
    expect(b.calls.map((c) => c.split(" ")[0])).toEqual([
      "createRecord",
      "readRecord",
      "rememberRecord",
      "markFreshlyCreated",
      "storePlanRow",
      "invalidatePlanSearch",
      "prependPlanFind",
    ]);
    expect(b.host.createRecord).toHaveBeenCalledWith(
      PV,
      "t:Thing",
      { unitTag: "Speed.A", partOf: { "@id": PARENT.uri }, elementOrder: 1, name: "A" },
      "Speed.A",
    );
    // The new record is read by its id, with the plan vault in the place of the address.
    expect(b.host.readRecord).toHaveBeenCalledWith("made1", PV);
    expect(b.host.rememberRecord).toHaveBeenCalledWith({ id: "made1", vaultId: PV, typeUri: "t:Thing", updatedAt: Date.now() });
    expect(b.host.markFreshlyCreated).toHaveBeenCalledWith("made1");
    expect(b.host.storePlanRow).toHaveBeenCalledWith(PV, row, { insert: true });
    expect(b.host.invalidatePlanSearch).toHaveBeenCalledWith(PV);
    expect(b.host.prependPlanFind).toHaveBeenCalledWith(PV, "a:partOf", PARENT.id, row, { members: [entityUriOf("made1")], refresh: false });
    expect(row).toEqual({
      id: "made1",
      entityUri: entityUriOf("made1"),
      typeUri: "t:Thing",
      facts: { unitTag: "Speed.A", partOf: '{"@id":"https://h.example.test/base/e/val1"}', elementOrder: "1", name: "A" },
      opaqueFacts: [],
      etag: '"v1"',
      updatedAt: Date.now(),
      servedKeys: ["unitTag", "partOf", "elementOrder", "name"],
      served: {
        facts: { unitTag: "Speed.A", partOf: { "@id": PARENT.uri }, elementOrder: 1, name: "A" },
        context: undefined,
        etag: '"v1"',
      },
    });
    expect(env.recs.get("new:1")).toBe(row);
    expect(findRowsOf(env, PARENT.id)).toEqual([row]);
  });

  it("a record that cannot be read back is still made: no address, nothing pinned by address", async () => {
    const { b, env } = setup();
    b.host.readRecord.mockRejectedValueOnce(new Error("offline"));
    const row = await createChild(env, thing, PARENT, "new:1", { name: "A" });
    expect("entityUri" in row).toBe(false);
    expect(b.host.prependPlanFind).toHaveBeenCalledWith(PV, "a:partOf", PARENT.id, row, { members: [], refresh: false });
  });

  it("a taken tag (409) is tried again with .2, .3 ...; the failed tries are not kept", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    stored(b, "t2", { name: "A", unitTag: "Speed.A.2" });
    const row = await createChild(env, thing, PARENT, "new:1", { name: "A" });
    expect(b.host.createRecord.mock.calls.map((c) => c[3])).toEqual(["Speed.A", "Speed.A.2", "Speed.A.3"]);
    expect(row.facts.unitTag).toBe("Speed.A.3");
    expect(b.host.rememberRecord).toHaveBeenCalledTimes(1);
  });

  it("gives up after fifty tags with a sentence that names the kind", async () => {
    const { b, env } = setup();
    b.host.createRecord.mockRejectedValue(Object.assign(new Error("tag"), { status: 409 }));
    await expect(createChild(env, thing, PARENT, "new:1", { name: "A" })).rejects.toThrow("Could not find a free tag for this thing.");
    expect(b.host.createRecord).toHaveBeenCalledTimes(50);
    expect(b.host.createRecord.mock.calls.at(-1)![3]).toBe("Speed.A.50");
  });

  it("any other failure stops at once, unchanged", async () => {
    const { b, env } = setup();
    const boom = Object.assign(new Error("boom"), { status: 500 });
    b.host.createRecord.mockRejectedValueOnce(boom);
    await expect(createChild(env, thing, PARENT, "new:1", { name: "A" })).rejects.toBe(boom);
    expect(b.host.createRecord).toHaveBeenCalledTimes(1);
    expect(b.host.readRecord).not.toHaveBeenCalled();
    expect(b.host.storePlanRow).not.toHaveBeenCalled();
  });

  it("an answer with no id is a failure that says the record was not created", async () => {
    const { b, env } = setup();
    b.host.createRecord.mockResolvedValueOnce({ id: "", etag: null });
    await expect(createChild(env, thing, PARENT, "new:1", { name: "A" })).rejects.toThrow("The thing was not created.");
    expect(b.host.readRecord).not.toHaveBeenCalled();
  });

  it("the next free order: one past the highest among the rows and the records made here", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.A", elementOrder: 4 });
    env.recs.set("x", { ...stored(b, "t2", { name: "B", unitTag: "Speed.B", elementOrder: 9 }), id: "t2" });
    await createChild(env, thing, PARENT, "new:1", { name: "C" });
    expect(b.host.createRecord.mock.calls[0]![2]).toMatchObject({ elementOrder: 10 });
  });

  it("when the find stopped at its cap the highest order may be out of sight: the find's total plus one is the bound", async () => {
    const { b, env } = setup();
    b.qc.setQueryData(planFindKey(PV, "a:partOf", PARENT.id), { rows: [], total: 2500, capped: true, unread: 0, cap: 2000 });
    await createChild(env, thing, PARENT, "new:1", { name: "A" });
    expect(b.host.createRecord.mock.calls[0]![2]).toMatchObject({ elementOrder: 2501 });
  });

  it("a migrated record keeps its place: the order given is used as it is", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.A", elementOrder: 4 });
    await createChild(env, thing, PARENT, "new:1", { name: "B" }, { order: 2 });
    expect(b.host.createRecord.mock.calls[0]![2]).toMatchObject({ elementOrder: 2 });
  });

  it("asks the host for the type address of the kind, in the plan vault", async () => {
    const { b, env } = setup();
    await createChild(env, thing, PARENT, "new:1", { name: "A" });
    expect(b.host.typeUriForVaultNamespace).toHaveBeenCalledWith("Thing", PV);
  });
});

describe("patchChild", () => {
  it("writes only what changed, conditional on the version, then shows the saved row everywhere", async () => {
    const { b, env } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    await patchChild(env, thing, PARENT, "t1", { name: "B" });
    expect(b.host.patchRecord).toHaveBeenCalledTimes(1);
    const [id, patch, at, source, pre] = b.host.patchRecord.mock.calls[0]!;
    expect(id).toBe("t1");
    // The tag is built from the facts, so it follows the name.
    expect(patch).toEqual({ name: "B", unitTag: "Speed.B" });
    expect(at).toBe(entityUriOf("t1"));
    expect(source).toEqual({ at: entityUriOf("t1"), servedKeys: row.servedKeys });
    expect(pre).toEqual({ ifMatch: '"v0"' });
    expect(b.calls.map((c) => c.split(" ")[0]).filter((n) => n !== "liveRow")).toEqual([
      "ensureEtagUnchanged",
      "patchRecord",
      "storePlanRow",
      "setPlanRecord",
      "patchPlanFindRows",
    ]);
    const saved = env.recs.get("t1")!;
    expect(saved.facts.name).toBe("B");
    expect(saved.etag).toBe('"v1"');
    expect(findRowsOf(env, PARENT.id)[0]!.facts.name).toBe("B");
    expect(server.get("t1")!.served.name).toBe("B");
  });

  it("a record with no served document is patched with no source", async () => {
    const { b, env } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    env.recs.set("t1", { ...row, servedKeys: undefined });
    b.host.liveRow.mockImplementationOnce((_v, _id, fallback) => ({ updatedAt: 1, ...fallback }));
    await patchChild(env, thing, PARENT, "t1", { name: "B" });
    expect(b.host.patchRecord.mock.calls[0]![3]).toBeUndefined();
  });

  it("does nothing for a record it does not know, and for an item that equals the record", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    await patchChild(env, thing, PARENT, "nope", { name: "B" });
    await patchChild(env, thing, PARENT, "t1", { name: "A" });
    expect(b.host.patchRecord).not.toHaveBeenCalled();
  });

  it("with retag, a tag that no longer matches the item is a change on its own", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.Old" });
    await patchChild(env, thing, PARENT, "t1", { name: "A" }, { retag: true });
    expect(b.host.patchRecord.mock.calls[0]![1]).toEqual({ unitTag: "Speed.A" });
    expect(server.get("t1")!.served.unitTag).toBe("Speed.A");
  });

  it("a taken tag (409 without the conflict class) is tried again with .2", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.Old" });
    stored(b, "t2", { name: "A", unitTag: "Speed.A" });
    await patchChild(env, thing, PARENT, "t1", { name: "A" }, { retag: true });
    expect(b.host.patchRecord.mock.calls.map((c) => c[1])).toEqual([{ unitTag: "Speed.A" }, { unitTag: "Speed.A.2" }]);
    expect(server.get("t1")!.served.unitTag).toBe("Speed.A.2");
    expect(b.host.reconcileAfterConflict).not.toHaveBeenCalled();
  });

  it("a 409 that the host calls a conflict is a conflict: the row is read again, the sentence is said, then the find is read for this record", async () => {
    const { b, env, notices } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.Old" });
    stored(b, "t2", { name: "A", unitTag: "Speed.A" });
    b.host.isConflict.mockImplementation(() => true);
    const saidBeforeReread: number[] = [];
    const real = b.host.invalidatePlanFind.getMockImplementation()!;
    b.host.invalidatePlanFind.mockImplementationOnce(async (...args) => {
      saidBeforeReread.push(notices.length);
      return real(...args);
    });
    const err = await patchChild(env, thing, PARENT, "t1", { name: "A" }, { retag: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ChildConflict);
    expect(saidBeforeReread).toEqual([1]);
    expect(b.host.patchRecord).toHaveBeenCalledTimes(1);
    expect(notices).toEqual(["This thing changed elsewhere. The card now shows the latest; your change was not saved."]);
    expect(b.calls.map((c) => c.split(" ")[0]).filter((n) => !["liveRow", "readRecord"].includes(n))).toEqual([
      "ensureEtagUnchanged",
      "patchRecord",
      "reconcileAfterConflict",
      "patchPlanFindRows",
      "invalidatePlanFind",
    ]);
    expect(b.host.invalidatePlanFind).toHaveBeenCalledWith(PV, "a:partOf", PARENT.id, { members: [entityUriOf("t1")] });
  });

  it("a stale version (the conflict class) is a conflict: the sentence is said, the record is read again, the other person's value stays", async () => {
    const { b, env, notices } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.A" }, "t:Thing", 3);
    await patchChild(env, thing, PARENT, "t1", { name: "B" });
    expect(server.get("t1")!.n).toBe(4);
    // Another person writes behind this browser's back.
    server.get("t1")!.served.name = "Theirs";
    server.get("t1")!.n += 1;
    const err = await patchChild(env, thing, PARENT, "t1", { name: "C" }).catch((e) => e);
    expect(err).toBeInstanceOf(ChildConflict);
    expect(b.host.isConflict.mock.results.some((r) => r.value === true)).toBe(true);
    expect(notices).toEqual(["This thing changed elsewhere. The card now shows the latest; your change was not saved."]);
    expect(server.get("t1")!.served.name).toBe("Theirs");
    // The row the card holds is the one just read, so the next try is on top of it.
    expect(findRowsOf(env, PARENT.id).find((r) => r.id === "t1")!.facts.name).toBe("Theirs");
  });

  it("a row with no version and a different copy of the changed field is a conflict, said before the find is read", async () => {
    const { b, env, notices } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    env.recs.set("t1", { ...row, etag: null });
    b.host.liveRow.mockImplementationOnce((_v, _id, fallback) => ({ updatedAt: 1, ...fallback }));
    server.get("t1")!.served.name = "Someone's";
    const saidBeforeReread: number[] = [];
    const real = b.host.invalidatePlanFind.getMockImplementation()!;
    b.host.invalidatePlanFind.mockImplementationOnce(async (...args) => {
      saidBeforeReread.push(notices.length);
      return real(...args);
    });
    const err = await patchChild(env, thing, PARENT, "t1", { name: "B" }).catch((e) => e);
    expect(err).toBeInstanceOf(ChildConflict);
    expect(saidBeforeReread).toEqual([1]);
    expect(notices).toEqual(["This thing changed elsewhere. The card now shows the latest; your change was not saved."]);
    expect(b.host.patchRecord).not.toHaveBeenCalled();
    expect(b.host.invalidatePlanFind).toHaveBeenCalledTimes(1);
  });

  it("a row with no version that cannot be read is not written", async () => {
    const { b, env } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    env.recs.set("t1", { ...row, etag: null });
    b.host.liveRow.mockImplementationOnce((_v, _id, fallback) => ({ updatedAt: 1, ...fallback }));
    server.recs.delete("t1");
    await expect(patchChild(env, thing, PARENT, "t1", { name: "B" })).rejects.toThrow(
      "This thing's version could not be read, so it was not saved. Reload and try again.",
    );
    expect(b.host.patchRecord).not.toHaveBeenCalled();
  });

  it("any other failure is thrown as it is, with nothing stored", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    server.failPatch.add(1);
    await expect(patchChild(env, thing, PARENT, "t1", { name: "B" })).rejects.toThrow("boom");
    expect(b.host.storePlanRow).not.toHaveBeenCalled();
    expect(b.host.reconcileAfterConflict).not.toHaveBeenCalled();
  });

  it("gives up after fifty tags", async () => {
    const { b, env } = setup();
    stored(b, "t1", { name: "A", unitTag: "Speed.Old" });
    b.host.patchRecord.mockRejectedValue(Object.assign(new Error("tag"), { status: 409 }));
    await expect(patchChild(env, thing, PARENT, "t1", { name: "A" }, { retag: true })).rejects.toThrow("Could not find a free tag for this thing.");
    expect(b.host.patchRecord).toHaveBeenCalledTimes(50);
  });
});

describe("endChild, endRow and endMade", () => {
  it("endChild ends the record, takes it out of the find without a re-read, forgets it and tells the card", async () => {
    const { b, env, touched } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    env.recs.set("t1", row);
    await endChild(env, PARENT, "t1");
    expect(b.calls.filter((c) => /^(delete|dropPlanFind)/.test(c))).toEqual([
      `delete ["t1","${entityUriOf("t1")}",null]`,
      `dropPlanFind ["${PV}","a:partOf","val1","t1",{"members":[],"refresh":false}]`,
    ]);
    expect(server.deletes).toEqual(["t1"]);
    expect(env.recs.has("t1")).toBe(false);
    expect(findRowsOf(env, PARENT.id)).toEqual([]);
    expect(touched).toHaveBeenCalledTimes(1);
  });

  it("endChild does nothing for a record it does not know; a failed delete drops nothing and does not tell the card", async () => {
    const { b, env, touched } = setup();
    await endChild(env, PARENT, "nope");
    expect(server.deletes).toEqual([]);
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    env.recs.set("t1", row);
    server.failDelete.add("t1");
    await expect(endChild(env, PARENT, "t1")).rejects.toThrow("delete refused");
    expect(b.host.dropPlanFind).not.toHaveBeenCalled();
    expect(env.recs.has("t1")).toBe(true);
    expect(touched).not.toHaveBeenCalled();
  });

  it("endRow ends a record known only as a row, with the version when one is given, and forgets the key that held it", async () => {
    const { b, env, touched } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    env.recs.set("k", row);
    await endRow(env, PARENT.id, row, { ifMatch: '"v0"' });
    expect(server.deleteArgs).toEqual([{ id: "t1", ifMatch: '"v0"' }]);
    expect(env.recs.has("k")).toBe(false);
    expect(touched).toHaveBeenCalledTimes(1);
    const other = stored(b, "t2", { name: "B", unitTag: "Speed.B" });
    await endRow(env, PARENT.id, other);
    expect(server.deleteArgs[1]).toEqual({ id: "t2", ifMatch: null });
    expect(b.host.dropPlanFind).toHaveBeenLastCalledWith(PV, "a:partOf", PARENT.id, "t2", { members: [], refresh: false });
  });

  it("endMade says whether the record is gone; it does not tell the card", async () => {
    const { b, env, touched } = setup();
    const row = stored(b, "t1", { name: "A", unitTag: "Speed.A" });
    expect(await endMade(env, PARENT.id, row)).toBe(true);
    expect(b.host.dropPlanFind).toHaveBeenCalledTimes(1);
    const other = stored(b, "t2", { name: "B", unitTag: "Speed.B" });
    server.failDelete.add("t2");
    expect(await endMade(env, PARENT.id, other)).toBe(false);
    expect(b.host.dropPlanFind).toHaveBeenCalledTimes(1);
    expect(touched).not.toHaveBeenCalled();
  });
});

describe("migrateChild", () => {
  const legacy: ChildKind<Thing> = {
    ...thing,
    isOld: (row) => row.typeUri === "t:OldThing",
    twin: (rows, item, old) => rows.find((r) => r.typeUri === "t:Thing" && r.id !== old.id && r.facts.name === item.name),
  };

  it("makes the new record in the old one's place, ends the old one with the version just read, and gives the new one the plain tag", async () => {
    const { b, env, touched } = setup();
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A", elementOrder: 7 }, "t:OldThing");
    const made = await migrateChild(env, legacy, PARENT, "old1", { name: "A", note: "n" }, old);
    // the old record held the plain tag while the new one was made
    expect(b.host.createRecord.mock.calls.map((c) => c[3])).toEqual(["Speed.A", "Speed.A.2"]);
    expect(b.host.createRecord.mock.calls[1]![2]).toMatchObject({ elementOrder: 7, note: "n" });
    expect(server.deleteArgs).toEqual([{ id: "old1", ifMatch: '"v0"' }]);
    expect(server.patches).toEqual([{ id: "made1", body: { unitTag: "Speed.A" } }]);
    expect(env.recs.get("old1")!.id).toBe("made1");
    expect(made.id).toBe("made1");
    expect(touched).toHaveBeenCalled();
  });

  it("an order held as text is kept as a number", async () => {
    const { b, env } = setup();
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A", elementOrder: "3" }, "t:OldThing");
    await migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old);
    expect(b.host.createRecord.mock.calls[1]![2]).toMatchObject({ elementOrder: 3 });
  });

  it("a record that cannot be read again says so and makes nothing", async () => {
    const { b, env } = setup();
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A" }, "t:OldThing");
    b.host.readRecord.mockRejectedValueOnce(new Error("offline"));
    await expect(migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old)).rejects.toThrow(
      "This thing's version could not be read, so it was not saved. Reload and try again.",
    );
    expect(b.host.createRecord).not.toHaveBeenCalled();
  });

  it("a record that changed since the card read it: nothing is made, the sentence is said, the find is read for that record", async () => {
    const { b, env, notices } = setup();
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A" }, "t:OldThing");
    server.get("old1")!.served.name = "Theirs";
    const err = await migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old).catch((e) => e);
    expect(err).toBeInstanceOf(ChildConflict);
    expect(notices).toEqual(["Someone else changed this thing; it is shown as it is now."]);
    expect(b.host.createRecord).not.toHaveBeenCalled();
    expect(b.host.invalidatePlanFind).toHaveBeenCalledWith(PV, "a:partOf", PARENT.id, { members: [entityUriOf("old1")] });
  });

  it("a twin of the new shape that the fresh find holds is adopted: nothing is made, nothing is ended", async () => {
    const { b, env, notices } = setup();
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A" }, "t:OldThing");
    const twin = stored(b, "twin1", { name: "A", unitTag: "Speed.A.9" });
    const err = await migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old).catch((e) => e);
    expect(err).toBeInstanceOf(ChildConflict);
    expect(env.recs.get("old1")!.id).toBe(twin.id);
    expect(notices).toHaveLength(1);
    expect(b.host.createRecord).not.toHaveBeenCalled();
    expect(server.deletes).toEqual([]);
    // the fresh find was asked for, not read from the cache
    expect(b.host.fetchPlanFind).toHaveBeenCalledWith(PV, "a:partOf", PARENT.id, PARENT.uri, { staleTime: 0 });
  });

  it("when the old record cannot be ended because of the conflict class, the new record is ended again and the card is told", async () => {
    const { b, env, notices } = setup();
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A" }, "t:OldThing");
    server.deleteStatus.set("old1", 412);
    const err = await migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old).catch((e) => e);
    expect(err).toBeInstanceOf(ChildConflict);
    expect(server.deletes).toEqual(["made1"]);
    expect(notices).toEqual(["Someone else changed this thing; it is shown as it is now."]);
  });

  it("when the old record cannot be ended for another reason, the new record is ended again and the error names it", async () => {
    const { b, env } = setup();
    void b;
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A" }, "t:OldThing");
    server.failDelete.add("old1");
    const err = await migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old).catch((e) => e);
    expect(err).not.toBeInstanceOf(ChildConflict);
    expect((err as Error).message).toBe("delete refused Nothing was changed; the thing is back as it was.");
    expect(server.deletes).toEqual(["made1"]);
    expect(env.recs.has("old1")).toBe(false);
  });

  it("when the new record cannot be ended again, the error names it so it can be removed by hand", async () => {
    const { b, env } = setup();
    void b;
    const old = stored(b, "old1", { name: "A", unitTag: "Speed.A" }, "t:OldThing");
    server.failDelete.add("old1");
    server.failDelete.add("made1");
    const err = await migrateChild(env, legacy, PARENT, "old1", { name: "A" }, old).catch((e) => e);
    expect((err as Error).message).toBe(
      "delete refused The new thing Speed.A.2 could not be removed; the old one is as it was. Remove Speed.A.2 by hand.",
    );
  });
});
