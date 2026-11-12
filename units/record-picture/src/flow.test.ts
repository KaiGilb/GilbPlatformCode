// The flow's ORDER with every step a stub (run-7's pictureFlow.test.ts, ported to the unit's API), then the cases the unit adds.
import { describe, expect, it, vi } from "vitest";
import { addWithPicture, deleteWithPicture, FILES_NOT_REMOVED, PictureSaveError, removePicture, replacePicture, type PictureFlowDeps, type PreparedPicture } from "./index";
import { checkPictureFile } from "./prepare";

interface Rec { id: string; picture: string | null }
const E = (n: string) => `https://h.example.test/vault/e/${n}`;
const rec = (over: Partial<Rec> = {}): Rec => ({ id: "p1", picture: null, ...over });
const pic: PreparedPicture = { thumb: new Blob(["t"]), screen: new Blob(["s"]), previewUrl: "blob:x" };
type Form = { name: string };
const form: Form = { name: "Fern" };

function fake(log: string[], over: Partial<PictureFlowDeps<Rec, Form>> = {}): PictureFlowDeps<Rec, Form> {
  return {
    fact: "image",
    createRecord: async (_f, p) => (log.push(p ? `create+${p.fact}=${p.master}` : "create"), rec(p ? { picture: p.master } : {})),
    upload: async () => (log.push("upload"), { master: E("new"), thumb: E("newt"), screenBytes: 2, thumbBytes: 1, warning: null } as never),
    link: async (r, m) => (log.push(`link:${m}`), { ...r, picture: m }),
    endFiles: async (m, c) => (log.push(`end:${m}+${c.join(",")}`), []),
    copiesOf: () => [E("oldt")],
    deleteRecord: async () => void log.push("delete"),
    pictureOf: (r) => r.picture,
    ...over,
  };
}

describe("checkPictureFile (ported)", () => {
  it("accepts a picture, rejects a non-image and one over 25 MB before decoding", () => {
    expect(checkPictureFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(checkPictureFile(new File(["x"], "a.txt", { type: "text/plain" }))).toMatch(/not a picture/);
    const big = new File(["x"], "b.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    expect(checkPictureFile(big)).toMatch(/25 MB/);
  });
});

describe("picture flow order (ported)", () => {
  it("add: create the record, then upload, then link", async () => {
    const log: string[] = [];
    const r = await addWithPicture(fake(log), form, pic);
    expect(log).toEqual(["create", "upload", `link:${E("new")}`]);
    expect(r.record.picture).toBe(E("new"));
    expect(r.notice).toBeNull();
  });
  it("add without a picture only creates", async () => {
    const log: string[] = [];
    await addWithPicture(fake(log), form, null);
    expect(log).toEqual(["create"]);
  });
  it("add: an upload that fails keeps the created record in a PictureSaveError and ends nothing", async () => {
    const log: string[] = [];
    const cause = new Error("too big");
    const err = await addWithPicture(fake(log, { upload: async () => { throw cause; } }), form, pic).catch((e) => e);
    expect(err).toBeInstanceOf(PictureSaveError);
    expect(err.record.id).toBe("p1");
    expect(err.message).toMatch(/too big/);
    expect(err.cause).toBe(cause);
    expect(log).toEqual(["create"]);
  });
  it("add: a link that fails ends the new files again", async () => {
    const log: string[] = [];
    const cause = new Error("412");
    const err = await addWithPicture(fake(log, { link: async () => { throw cause; } }), form, pic).catch((e) => e);
    expect(err).toBeInstanceOf(PictureSaveError);
    expect(err.cause).toBe(cause);
    expect(err.record.id).toBe("p1");
    expect(log).toEqual(["create", "upload", `end:${E("new")}+${E("newt")}`]);
  });
  it("replace: upload the new one, link, then end the old files", async () => {
    const log: string[] = [];
    await replacePicture(fake(log), rec({ picture: E("old") }), pic);
    expect(log).toEqual(["upload", `link:${E("new")}`, `end:${E("old")}+${E("oldt")}`]);
  });
  it("replace: a failed upload leaves the old picture alone", async () => {
    const log: string[] = [];
    const deps = fake(log, { upload: async () => { throw new Error("offline"); } });
    await expect(replacePicture(deps, rec({ picture: E("old") }), pic)).rejects.toThrow("offline");
    expect(log).toEqual([]);
  });
  it("replace: old files that cannot be ended give a notice, not a failure", async () => {
    const deps = fake([], { endFiles: async () => { throw new Error("403"); } });
    const r = await replacePicture(deps, rec({ picture: E("old") }), pic);
    expect(r.notice).toBe(FILES_NOT_REMOVED);
  });
  it("remove: link null, then end the files", async () => {
    const log: string[] = [];
    const r = await removePicture(fake(log), rec({ picture: E("old") }));
    expect(log).toEqual(["link:null", `end:${E("old")}+${E("oldt")}`]);
    expect(r.record.picture).toBeNull();
  });
  it("delete: ends the files before deleteRecord", async () => {
    const log: string[] = [];
    const r = await deleteWithPicture(fake(log), rec({ picture: E("old") }));
    expect(log).toEqual([`end:${E("old")}+${E("oldt")}`, "delete"]);
    expect(r.notice).toBeNull();
  });
  it("delete: still deletes the record when the files cannot be ended, and says so", async () => {
    const log: string[] = [];
    const r = await deleteWithPicture(fake(log, { endFiles: async () => [E("oldt")] }), rec({ picture: E("old") }));
    expect(log).toEqual(["delete"]);
    expect(r.notice).toBe(FILES_NOT_REMOVED);
  });
  it("delete of a record with no picture only deletes", async () => {
    const log: string[] = [];
    const endFiles = vi.fn();
    await deleteWithPicture(fake(log, { endFiles }), rec());
    expect(endFiles).not.toHaveBeenCalled();
    expect(log).toEqual(["delete"]);
  });
});

describe("what the unit adds to the flow", () => {
  it("the notice carries the storing warning", async () => {
    const up = async () => ({ master: E("new"), thumb: null, warning: "small copy not linked" });
    expect((await addWithPicture(fake([], { upload: up }), form, pic)).notice).toBe("small copy not linked");
    expect((await replacePicture(fake([], { upload: up }), rec(), pic)).notice).toBe("small copy not linked");
  });
  it("the new set's copies are exactly [thumb]; a set with no thumb ends the master alone", async () => {
    const log: string[] = [];
    const up = async () => ({ master: E("new"), thumb: null, warning: null });
    await addWithPicture(fake(log, { upload: up, link: async () => { throw new Error("x"); } }), form, pic).catch(() => undefined);
    expect(log).toEqual(["create", `end:${E("new")}+`]);
  });
  it("picture-first: upload, then create with the fact name and the master", async () => {
    const log: string[] = [];
    const r = await addWithPicture(fake(log), form, pic, { order: "picture-first" });
    expect(log).toEqual(["upload", `create+image=${E("new")}`]);
    expect(r.record.picture).toBe(E("new"));
  });
  it("picture-first: a create that fails ends the uploaded set and rethrows the original error unchanged", async () => {
    const log: string[] = [];
    const boom = new Error("create refused");
    const err = await addWithPicture(fake(log, { createRecord: async () => { throw boom; } }), form, pic, { order: "picture-first" }).catch((e) => e);
    expect(err).toBe(boom);
    expect(log).toEqual(["upload", `end:${E("new")}+${E("newt")}`]);
  });
  it("picture-first without a picture only creates, and a failed upload creates nothing", async () => {
    const log: string[] = [];
    await addWithPicture(fake(log), form, null, { order: "picture-first" });
    expect(log).toEqual(["create"]);
    const log2: string[] = [];
    await expect(addWithPicture(fake(log2, { upload: async () => { throw new Error("offline"); } }), form, pic, { order: "picture-first" })).rejects.toThrow("offline");
    expect(log2).toEqual([]);
  });
  it("replace: a link that fails ends the NEW set, keeps the old, and throws a PictureSaveError holding the record", async () => {
    const log: string[] = [];
    const r0 = rec({ picture: E("old") });
    const err = await replacePicture(fake(log, { link: async () => { throw new Error("412"); } }), r0, pic).catch((e) => e);
    expect(err).toBeInstanceOf(PictureSaveError);
    expect(err.record).toBe(r0);
    expect(log).toEqual(["upload", `end:${E("new")}+${E("newt")}`]);
  });
  it("replace: the old files are not ended when the new master is the old one", async () => {
    const log: string[] = [];
    await replacePicture(fake(log), rec({ picture: E("new") }), pic);
    expect(log).toEqual(["upload", `link:${E("new")}`]);
  });
  it("remove: a record with no picture is answered as it is with no call", async () => {
    const log: string[] = [];
    const r0 = rec();
    const r = await removePicture(fake(log), r0);
    expect(r).toEqual({ record: r0, notice: null });
    expect(log).toEqual([]);
  });
  it("remove: files that cannot be ended give the notice; a failed link throws and ends nothing", async () => {
    expect((await removePicture(fake([], { endFiles: async () => [E("old")] }), rec({ picture: E("old") }))).notice).toBe(FILES_NOT_REMOVED);
    const log: string[] = [];
    await expect(removePicture(fake(log, { link: async () => { throw new Error("412"); } }), rec({ picture: E("old") }))).rejects.toThrow("412");
    expect(log).toEqual([]);
  });
  it("delete: a deleteRecord failure is thrown", async () => {
    const deps = fake([], { deleteRecord: async () => { throw new Error("gone wrong"); } });
    await expect(deleteWithPicture(deps, rec({ picture: E("old") }))).rejects.toThrow("gone wrong");
  });
});
