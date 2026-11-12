// The flow against the fake platform as the platform, through the units' real clients (lws-records, picture-set, picture-upload).
import { RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addWithPicture, deleteWithPicture, FILES_NOT_REMOVED, linkPicture, PictureSaveError, removePicture, replacePicture } from "./index";
import { FACT, VAULT_ORIGIN, bytes, makeWorld, prepared, type World } from "../test/world";

let w: World;
beforeEach(() => {
  w = makeWorld();
});
afterEach(() => w.done());

const idOf = (entity: string) => entity.slice(entity.lastIndexOf("/") + 1);
/** The order the fake saw the calls in, as "METHOD path". */
const order = () => w.fake.calls.all.map((c) => `${c.method} ${c.path}`);

describe("add against the fake", () => {
  it("record-first: the record is patched with {fact: {@id: master}} and If-Match carries the record's ETag", async () => {
    const r = await addWithPicture(w.deps(), { name: "Heron" }, prepared());
    const created = w.fake.state.records.get(r.record.id)!;
    expect(created.facts[FACT] ?? created.facts[`a:${FACT}`]).toEqual({ "@id": r.record.picture });
    const patches = w.recordPatches(r.record);
    expect(patches).toHaveLength(1);
    expect(Object.values(patches[0]!.body as object)).toEqual([{ "@id": r.record.picture }]);
    expect(Object.keys(patches[0]!.body as object)[0]).toMatch(new RegExp(`${FACT}$`));
    expect(patches[0]!.headers["if-match"]).toMatch(/^"sha256:/);
    expect(r.record.picture).toMatch(new RegExp(`^${VAULT_ORIGIN}/vault/e/`));
    expect(r.notice).toBeNull();
    expect(w.fake.violations).toEqual([]);
  });

  it("a stale ETag: lws-records' RecordConflictError surfaces from linkPicture unchanged, and the flow ends the new files", async () => {
    const stale = await w.boat("Heron");
    w.fake.bump(stale.id);
    await expect(linkPicture(stale, FACT, "https://ann.fake.test/vault/e/x")).rejects.toBeInstanceOf(RecordConflictError);

    const err = await addWithPicture(w.deps({ createRecord: async (f) => { const b = await w.boat(f.name); w.fake.bump(b.id); return b; } }), { name: "Egret" }, prepared(2)).catch((e) => e);
    expect(err).toBeInstanceOf(PictureSaveError);
    expect(err.cause).toBeInstanceOf(RecordConflictError);
    const files = [...w.fake.state.files.values()];
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endedSeq !== null)).toBe(true);
    expect(w.fake.state.records.get(err.record.id)!.endedSeq).toBeNull();
  });

  it("a failed link PATCH ends the new files and throws a PictureSaveError whose record is the saved record", async () => {
    w.fake.failNext("PATCH /lws/r/:id", { status: 500, skip: 1 }); // skip the small copy's own link; the next PATCH is the record's
    const err = await addWithPicture(w.deps(), { name: "Heron" }, prepared()).catch((e) => e);
    expect(err).toBeInstanceOf(PictureSaveError);
    expect(err.record.name).toBe("Heron");
    expect(w.fake.state.records.get(err.record.id)!.endedSeq).toBeNull();
    expect([...w.fake.state.files.values()].every((f) => f.endedSeq !== null)).toBe(true);
    expect(w.fake.calls.of("DELETE /files/:id")).toHaveLength(2);
  });

  it("picture-first: a create that fails ends the uploaded set and rethrows the original error", async () => {
    const boom = new Error("create refused");
    const err = await addWithPicture(w.deps({ createRecord: async () => { throw boom; } }), { name: "Heron" }, prepared(), { order: "picture-first" }).catch((e) => e);
    expect(err).toBe(boom);
    expect(w.fake.state.files.size).toBe(2);
    expect([...w.fake.state.files.values()].every((f) => f.endedSeq !== null)).toBe(true);
  });

  it("picture-first: the record is created holding the link", async () => {
    const r = await addWithPicture(w.deps(), { name: "Heron" }, prepared(), { order: "picture-first" });
    expect(r.record.picture).not.toBeNull();
    expect(w.recordPatches(r.record)).toHaveLength(0);
  });
});

describe("replace against the fake", () => {
  async function withOld() {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await w.boat("Heron", w.fileUrl(old.master.id));
    await w.reload();
    return { old, boat };
  }

  it("ends the old group only after the link succeeded", async () => {
    const { old, boat } = await withOld();
    w.fake.calls.clear();
    const r = await replacePicture(w.deps(), boat, prepared());
    expect(r.record.picture).not.toBe(w.fileUrl(old.master.id));
    const seq = order();
    const link = seq.lastIndexOf(`PATCH /lws/r/${boat.id}`);
    const endOld = seq.indexOf(`DELETE /files/${old.master.id}`);
    expect(link).toBeGreaterThan(-1);
    expect(endOld).toBeGreaterThan(link);
    expect(seq.indexOf(`DELETE /files/${old.thumb.id}`)).toBeGreaterThan(link);
    expect(w.ended(old.master.id) && w.ended(old.thumb.id)).toBe(true);
  });

  it("a failed link ends the NEW set and keeps the old", async () => {
    const { old, boat } = await withOld();
    w.fake.failNext("PATCH /lws/r/:id", { status: 500, skip: 1 });
    const err = await replacePicture(w.deps(), boat, prepared()).catch((e) => e);
    expect(err).toBeInstanceOf(PictureSaveError);
    expect(err.record).toBe(boat);
    expect(w.ended(old.master.id) || w.ended(old.thumb.id)).toBe(false);
    const fresh = [...w.fake.state.files.entries()].filter(([id]) => id !== old.master.id && id !== old.thumb.id);
    expect(fresh).toHaveLength(2);
    expect(fresh.every(([, f]) => f.endedSeq !== null)).toBe(true);
    expect((await w.read(boat.id, boat.entity)).picture).toBe(w.fileUrl(old.master.id));
  });
});

describe("remove against the fake", () => {
  it("sends null, the fact is gone on re-read, and the old files are ended", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await w.boat("Heron", w.fileUrl(old.master.id));
    await w.reload();
    const r = await removePicture(w.deps(), boat);
    const patches = w.recordPatches(boat);
    expect(patches).toHaveLength(1);
    expect(Object.values(patches[0]!.body as object)).toEqual([null]);
    expect(patches[0]!.headers["if-match"]).toBe(boat.etag);
    expect(r.record.picture).toBeNull();
    expect((await w.read(boat.id, boat.entity)).picture).toBeNull();
    expect(w.ended(old.master.id) && w.ended(old.thumb.id)).toBe(true);
  });

  it("a record with no picture: zero calls", async () => {
    const boat = await w.boat("Heron");
    w.fake.calls.clear();
    const r = await removePicture(w.deps(), boat);
    expect(r).toEqual({ record: boat, notice: null });
    expect(w.fake.calls.count()).toBe(0);
  });
});

describe("delete against the fake", () => {
  it("ends the files first, then deletes the record", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await w.boat("Heron", w.fileUrl(old.master.id));
    await w.reload();
    w.fake.calls.clear();
    const r = await deleteWithPicture(w.deps(), boat);
    expect(r.notice).toBeNull();
    const seq = order();
    expect(seq.indexOf(`DELETE /files/${old.master.id}`)).toBeGreaterThan(-1);
    expect(seq.indexOf(`DELETE /lws/r/${boat.id}`)).toBeGreaterThan(seq.indexOf(`DELETE /files/${old.thumb.id}`));
    expect(w.fake.state.records.get(boat.id)!.endedSeq).not.toBeNull();
  });

  it("a 403 on DELETE /files/:id is the FILES_NOT_REMOVED notice and the record is still deleted", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await w.boat("Heron", w.fileUrl(old.master.id));
    await w.reload();
    w.fake.failNext("DELETE /files/:id", { status: 403, times: 2 });
    const r = await deleteWithPicture(w.deps(), boat);
    expect(r.notice).toBe(FILES_NOT_REMOVED);
    expect(w.ended(old.master.id)).toBe(false);
    expect(w.fake.state.records.get(boat.id)!.endedSeq).not.toBeNull();
  });
});

describe("the read-back against the fake", () => {
  it("a link written in the {@id} form is read back, and a /base/e/ spelling of the same file counts as the same link", async () => {
    const f = w.fake.seedFile(w.vault, { name: "a.jpg", bytes: bytes(10) });
    const boat = await w.boat("Heron");
    const out = await linkPicture(boat, FACT, `${VAULT_ORIGIN}/base/e/${f.id}`);
    expect(idOf(out.picture!)).toBe(f.id);
    expect(out.etag).toMatch(/^"sha256:/);
  });
});
