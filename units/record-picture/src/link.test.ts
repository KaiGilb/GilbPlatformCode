import { describe, expect, it, vi } from "vitest";
import { linkPicture, pictureLinkPatch, pictureOfFacts, PictureLinkNotKeptError, type LinkCalls, type RecordRef } from "./index";

const rec: RecordRef = { id: "r1", entity: "https://h.example.test/base/e/r1", etag: '"1"' };
const BASE = "https://h.example.test/base/e/f1";
const VAULT = "https://h.example.test/vault/e/f1";

describe("pictureLinkPatch", () => {
  it("writes the {@id} form under the given fact, or null to clear", () => {
    expect(pictureLinkPatch("image", BASE)).toEqual({ image: { "@id": BASE } });
    expect(pictureLinkPatch("photo", null)).toEqual({ photo: null });
  });
});

describe("pictureOfFacts", () => {
  it("reads a plain string, {@id}, and the first readable item of a list", () => {
    expect(pictureOfFacts({ image: BASE }, "image")).toBe(BASE);
    expect(pictureOfFacts({ image: { "@id": BASE } }, "image")).toBe(BASE);
    expect(pictureOfFacts({ image: [{ "@id": BASE }, VAULT] }, "image")).toBe(BASE);
    expect(pictureOfFacts({ image: ["", 3, { "@id": VAULT }] }, "image")).toBe(VAULT);
  });
  it("reads the a: spelling, and the bare key wins when both are there", () => {
    expect(pictureOfFacts({ "a:image": BASE }, "image")).toBe(BASE);
    expect(pictureOfFacts({ "a:image": { "@id": BASE } }, "image")).toBe(BASE);
    expect(pictureOfFacts({ "a:image": VAULT, image: BASE }, "image")).toBe(BASE);
  });
  it("answers null for empty, non-string, missing and no facts", () => {
    expect(pictureOfFacts({ image: "" }, "image")).toBeNull();
    expect(pictureOfFacts({ image: 5 }, "image")).toBeNull();
    expect(pictureOfFacts({ image: { "@id": "" } }, "image")).toBeNull();
    expect(pictureOfFacts({ image: [] }, "image")).toBeNull();
    expect(pictureOfFacts({ other: BASE }, "image")).toBeNull();
    expect(pictureOfFacts(undefined, "image")).toBeNull();
  });
  it("the fact name is only what the caller gives", () => {
    expect(pictureOfFacts({ image: BASE }, "photo")).toBeNull();
    expect(pictureOfFacts({ "a:photo": BASE }, "photo")).toBe(BASE);
  });
});

function calls(served: Record<string, unknown> | null, etag: string | null = '"2"') {
  const patch = vi.fn(async (..._a: unknown[]) => ({ etag: '"p"' }));
  const read = vi.fn(async () => (served === null ? null : ({ id: "r1", facts: {}, served: { facts: served, context: null, etag }, etag } as never)));
  return { patch, read, o: { patch, read } as unknown as LinkCalls };
}

describe("linkPicture read-back", () => {
  it("sends the patch with If-Match, and answers the etag and picture as read back", async () => {
    const c = calls({ image: { "@id": BASE } });
    expect(await linkPicture(rec, "image", BASE, c.o)).toEqual({ etag: '"2"', picture: BASE });
    expect(c.patch).toHaveBeenCalledWith("r1", { image: { "@id": BASE } }, rec.entity, undefined, { ifMatch: '"1"' });
  });
  it("a /base/e/ and a /vault/e/ spelling of one file are the same link", async () => {
    expect((await linkPicture(rec, "image", BASE, calls({ "a:image": { "@id": VAULT } }).o)).picture).toBe(VAULT);
    expect((await linkPicture(rec, "image", VAULT, calls({ image: BASE }).o)).picture).toBe(BASE);
  });
  it("a read-back that holds another picture, none, or no record is a PictureLinkNotKeptError carrying the record", async () => {
    for (const served of [{ image: "https://h.example.test/vault/e/other" }, {}, null]) {
      const err = await linkPicture(rec, "image", BASE, calls(served).o).catch((e) => e);
      expect(err).toBeInstanceOf(PictureLinkNotKeptError);
      expect(err.record).toBe(rec);
      expect(err.message).toMatch(/did not keep the picture link/);
    }
  });
  it("clearing: a read-back with the fact gone is kept; one that still holds it is not", async () => {
    expect(await linkPicture(rec, "image", null, calls({ name: "x" }).o)).toEqual({ etag: '"2"', picture: null });
    await expect(linkPicture(rec, "image", null, calls({ "a:image": BASE }).o)).rejects.toBeInstanceOf(PictureLinkNotKeptError);
  });
  it("a null etag sends no precondition value", async () => {
    const c = calls({ image: BASE });
    await linkPicture({ ...rec, etag: null }, "image", BASE, c.o);
    expect(c.patch.mock.calls[0]![4]).toEqual({ ifMatch: null });
  });
  it("an error from the patch is thrown as it is, with no read", async () => {
    const c = calls({});
    const boom = new Error("412-like");
    c.patch.mockRejectedValueOnce(boom);
    expect(await linkPicture(rec, "image", BASE, c.o).catch((e) => e)).toBe(boom);
    expect(c.read).not.toHaveBeenCalled();
  });
});
