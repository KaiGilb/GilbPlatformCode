// The fake against the code-bank clients that will use it, through their own functions: lws-records (create, read, patch, delete)
// and record-sync (the complete copy). Nothing here calls the fake directly except to seed or to look at what the client sent.
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { RecordConflictError, RecordForbiddenError, createRecord, deleteRecord, patchRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { completeCopy } from "@kaigilb/gilbplatformcode-record-sync/complete-copy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { world, type Who, type World } from "./support";

function signAs(who: Who) {
  const sign = (method: string, url: string) => who.headers(method, url);
  setLwsAuth({
    bearerHeaderFor: (url, method) => sign(method ?? "GET", url),
    dpopReadAuth: sign,
    dpopWriteAuth: sign,
    invalidateDpop: () => undefined,
    tokenManager: { getSession: async () => ({ principal: who.person.principal, vault: null, vaults: [] }), invalidate: () => undefined },
  });
}

let w: World;
beforeEach(async () => {
  w = await world();
  setBaseOrigin(w.fake.origin);
  vi.stubGlobal("fetch", w.fake.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
});

describe("lws-records against the fake: create, read, patch, delete", () => {
  it("create then read gives the facts back and the ETag the create answered", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const made = await createRecord(w.annV.id, "t:Sailboat", { name: "Heron", berthCount: 4 });
    expect(made.id).toMatch(/^06f/);
    expect(made.etag).toMatch(/^"sha256:/);
    expect(made.entity).toBe(`https://ann.fake.test/vault/e/${made.id}`);
    expect(w.fake.state.records.get(made.id)).toMatchObject({ type: "Sailboat", vaultId: w.annV.id });
    const rec = await readRecord(made.id, made.entity!);
    expect(rec).not.toBeNull();
    expect(rec!.etag).toBe(made.etag);
    expect(rec!.facts).toMatchObject({ name: "Heron", berthCount: "4" }); // the client flattens facts to text for its editor
    expect(w.fake.state.records.get(made.id)!.facts.berthCount).toBe(4); // the fake holds what the client sent
    expect(w.fake.calls.all.every((c) => c.proof.ok)).toBe(true);
  });
  it("patch with the read ETag returns the new ETag; a second patch with the old one is a RecordConflictError and writes nothing", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const made = await createRecord(w.annV.id, "t:Sailboat", { name: "Heron" });
    const first = await patchRecord(made.id, { name: "Egret" }, made.entity!, undefined, { ifMatch: made.etag });
    expect(first.etag).toMatch(/^"sha256:/);
    expect(first.etag).not.toBe(made.etag);
    await expect(patchRecord(made.id, { name: "Lost" }, made.entity!, undefined, { ifMatch: made.etag })).rejects.toBeInstanceOf(RecordConflictError);
    expect((await readRecord(made.id, made.entity!))!.facts).toMatchObject({ name: "Egret" });
  });
  it("an edit from another device makes the client's next conditional patch a conflict (bump)", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const made = await createRecord(w.annV.id, "t:Sailboat", { name: "Heron" });
    w.fake.bump(made.id);
    await expect(patchRecord(made.id, { name: "x" }, made.entity!, undefined, { ifMatch: made.etag })).rejects.toBeInstanceOf(RecordConflictError);
  });
  it("a reader's create is a RecordForbiddenError carrying the platform's sentence", async () => {
    w.fake.grant(w.annV, w.ben, "read");
    signAs(await w.as(w.ben));
    const err = await createRecord(w.annV.id, "t:Sailboat", { name: "x" }).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(RecordForbiddenError);
    expect((err as Error).message).toMatch(/no write reach|can.t|not allowed|permission/i);
  });
  it("delete ends the record: a later delete with no precondition is idempotent, and the record leaves the live list", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const made = await createRecord(w.annV.id, "t:Sailboat", { name: "Heron" });
    await deleteRecord(made.id, made.entity!);
    await deleteRecord(made.id, made.entity!);
    expect(w.fake.state.records.get(made.id)!.endedSeq).not.toBeNull();
    const copy = await completeCopy({ origin: w.fake.origin, fetch: ann.fetch }, w.annV.id, "t:Sailboat");
    expect(copy.records).toEqual([]);
  });
  it("a conditional delete with a stale ETag is a RecordConflictError; with a current one it ends the record", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const made = await createRecord(w.annV.id, "t:Sailboat", { name: "Heron" });
    w.fake.bump(made.id);
    await expect(deleteRecord(made.id, made.entity!, { ifMatch: made.etag })).rejects.toBeInstanceOf(RecordConflictError);
    const now = (await readRecord(made.id, made.entity!))!.etag;
    await deleteRecord(made.id, made.entity!, { ifMatch: now });
    expect(w.fake.state.records.get(made.id)!.endedSeq).not.toBeNull();
  });
});

describe("record-sync completeCopy against the fake", () => {
  const seed = (n: number) => Array.from({ length: n }, (_, i) => w.fake.seedRecord(w.annV, { type: "Sailboat", facts: { name: `Boat${i + 1}` } }));

  it("copies 45 records newest first by the bookmark walk (include=body, limit, after) and names the position to continue from", async () => {
    seed(45);
    const ann = await w.as(w.ann);
    const copy = await completeCopy({ origin: w.fake.origin, fetch: ann.fetch }, w.annV.id, "t:Sailboat", { pageLimit: 20 });
    expect(copy.records).toHaveLength(45);
    expect(copy.records[0]!.label).toBe("Boat45");
    expect(copy.records[44]!.label).toBe("Boat1");
    expect(copy.records[0]!.body).toMatchObject({ "@type": "t:Sailboat", name: "Boat45" });
    expect(copy.truncated).toBeUndefined();
    expect(typeof copy.cursor).toBe("string");
    const q = w.fake.calls.all.map((c) => c.query);
    expect(q[0]).toMatchObject({ type: ["Sailboat"], since: ["head"] });
    expect(q.some((x) => x.after !== undefined && x.offset === undefined)).toBe(true);
    expect(q.every((x) => x.type?.[0] === "Sailboat")).toBe(true); // bare, never t:
    expect(w.fake.violations).toEqual([]);
  });
  it("a record changed and one added while the walk runs are merged by the since pass", async () => {
    const rs = seed(30);
    const ann = await w.as(w.ann);
    let once = false;
    const copy = await completeCopy({ origin: w.fake.origin, fetch: ann.fetch }, w.annV.id, "t:Sailboat", {
      pageLimit: 20,
      onPage: () => {
        if (once) return;
        once = true;
        w.fake.edit(rs[0]!.id, { name: "Renamed" });
        w.fake.seedRecord(w.annV, { type: "Sailboat", facts: { name: "Added" } });
      },
    });
    const labels = copy.records.map((r) => r.label);
    expect(labels).toHaveLength(31);
    expect(labels.slice(0, 2).sort()).toEqual(["Added", "Renamed"]);
    expect(labels).not.toContain("Boat1");
  });
  it("a second copy continues from nothing: its head is a cursor the fake accepts", async () => {
    seed(3);
    const ann = await w.as(w.ann);
    const client = { origin: w.fake.origin, fetch: ann.fetch };
    const a = await completeCopy(client, w.annV.id, "Sailboat");
    w.fake.seedRecord(w.annV, { type: "Sailboat", facts: { name: "Four" } });
    const b = await completeCopy(client, w.annV.id, "Sailboat");
    expect(b.records).toHaveLength(4);
    expect(b.cursor).not.toBe(a.cursor);
  });
  it("a person with no read reach gets the platform's 403 through the client as RecordListError", async () => {
    seed(1);
    const cat = await w.as(w.cat);
    await expect(completeCopy({ origin: w.fake.origin, fetch: cat.fetch }, w.annV.id, "Sailboat")).rejects.toMatchObject({ status: 403 });
  });
});
