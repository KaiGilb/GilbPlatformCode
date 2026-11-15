// recordPictureListApi against the fake platform: the four flows an app's list runs (add with a picture, replace, remove, delete).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPictureListApi, vaultPictureFlowDeps } from "./vault";
import { FACT, bytes, makeWorld, prepared, type Boat, type BoatForm, type World } from "../test/world";
import type { PictureChange } from "./index";

interface Item extends Boat { previewUrl?: string }
type Draft = BoatForm & { change?: PictureChange };

let w: World;
let notices: string[];
const realRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
  w = makeWorld();
  notices = [];
});
afterEach(() => {
  URL.revokeObjectURL = realRevoke;
  w.done();
});

const api = () =>
  recordPictureListApi<Item, BoatForm, Draft>({
    deps: async (fresh) =>
      vaultPictureFlowDeps<Item, BoatForm>({
        vaultId: w.vault.id, typeIri: "t:Sailboat", fact: FACT, pictures: w.pics,
        ...(fresh ? { copies: await w.pics.loadCopies() } : {}),
        toFacts: (f) => ({ name: f.name }),
        fromRecord: (made, f, picture) => ({ ...made, name: f.name, picture }),
      }),
    patchOf: (from, to): Record<string, string> => (to.name !== from.name ? { name: to.name } : {}),
    afterPatch: (item, fields, etag) => ({ ...item, ...fields, etag }),
    onNotice: (l) => notices.push(l),
    keepPreview: (u) => u,
  });
const fileId = (url: string) => url.split("/").pop()!;
const item = async (name: string, pic?: string): Promise<Item> => w.boat(name, pic);

describe("recordPictureListApi", () => {
  it("create with a picture: record, upload, link; the item carries the stored picture and the local preview", async () => {
    const made = await api().create({ name: "Heron", change: { kind: "set", prepared: prepared() } });
    expect(made.picture).not.toBeNull();
    expect(made.previewUrl).toBe("blob:test");
    expect(w.fake.state.records.get(made.id)!.facts.name).toBe("Heron");
  });
  it("create without a picture only creates", async () => {
    const made = await api().create({ name: "Egret" });
    expect(made.picture).toBeNull();
    expect(w.fake.calls.count("PUT /lws/vault/:vault/files")).toBe(0);
  });
  it("create whose picture upload fails keeps the saved record and says so", async () => {
    w.fake.failNext("PUT /lws/vault/:vault/files", { status: 500, times: 4 });
    const made = await api().create({ name: "Tern", change: { kind: "set", prepared: prepared() } });
    expect(made.name).toBe("Tern");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/saved, but its picture was not/);
  });
  it("update: the field PATCH carries If-Match, then the replace links from the NEW tag (no 412), and the old files end", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await item("Heron", w.fileUrl(old.master.id));
    const out = await api().update(boat, { name: "Heron II", change: { kind: "set", prepared: prepared(3) } });
    expect(out.name).toBe("Heron II");
    expect(out.picture).not.toBe(boat.picture);
    const patches = w.recordPatches(boat);
    expect(patches).toHaveLength(2);
    expect(patches[0]!.headers["if-match"]).toBe(boat.etag);
    expect(patches[1]!.headers["if-match"]).not.toBe(boat.etag);
    expect(w.ended(old.master.id)).toBe(true);
    expect(notices).toEqual([]);
  });
  it("update with no field change sends no field PATCH, only the picture link", async () => {
    const boat = await item("Heron");
    const out = await api().update(boat, { name: "Heron", change: { kind: "set", prepared: prepared() } });
    expect(w.recordPatches(boat)).toHaveLength(1);
    expect(out.picture).not.toBeNull();
  });
  it("update with no change at all answers the item", async () => {
    const boat = await item("Heron");
    w.fake.calls.clear();
    expect(await api().update(boat, { name: "Heron" })).toBe(boat);
    expect(w.fake.calls.count()).toBe(0);
  });
  it("remove picture: link null, files ended, no local preview left", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = { ...(await item("Heron", w.fileUrl(old.master.id))), previewUrl: "blob:old" };
    const out = await api().update(boat, { name: "Heron", change: { kind: "remove" } });
    expect(out.picture).toBeNull();
    expect("previewUrl" in out).toBe(false);
    expect(w.ended(old.master.id)).toBe(true);
  });
  it("a failed picture step on update is a notice and the record as the field PATCH left it, and the preview is revoked", async () => {
    const revoke = vi.mocked(URL.revokeObjectURL);
    try {
      const boat = await item("Heron");
      w.fake.failNext("PUT /lws/vault/:vault/files", { status: 500, times: 4 });
      const out = await api().update(boat, { name: "Heron II", change: { kind: "set", prepared: prepared() } });
      expect(out.name).toBe("Heron II");
      expect(out.picture).toBeNull();
      expect(notices[0]).toMatch(/^The picture was not changed\./);
      expect(revoke).toHaveBeenCalledWith("blob:test");
    } finally {
      revoke.mockClear();
    }
  });
  it("delete: the record goes with If-Match first, then its picture files", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await item("Heron", w.fileUrl(old.master.id));
    w.fake.calls.clear();
    await api().remove(boat);
    const seq = w.fake.calls.all.map((c) => `${c.method} ${c.path}`);
    expect(w.fake.calls.of("DELETE /lws/r/:id")[0]!.headers["if-match"]).toBe(boat.etag);
    expect(seq.findIndex((x) => x.startsWith("DELETE /lws/r/"))).toBeLessThan(seq.findIndex((x) => x.startsWith("DELETE /files/")));
    expect(w.ended(fileId(boat.picture!))).toBe(true);
  });
  it("delete of a record that changed meanwhile: the 412 is thrown and the picture is kept", async () => {
    const old = w.fake.seedPicture(w.vault, { name: "old", master: bytes(50, 5), thumb: bytes(9, 6) });
    const boat = await item("Heron", w.fileUrl(old.master.id));
    w.fake.bump(boat.id);
    await expect(api().remove(boat)).rejects.toMatchObject({ name: "RecordConflictError" });
    expect(w.ended(old.master.id)).toBe(false);
    expect(w.fake.state.records.get(boat.id)!.endedSeq).toBeNull();
  });
});
