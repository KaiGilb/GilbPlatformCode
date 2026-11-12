// checkPictureFile and preparePicture. jsdom has no canvas, so the shrinker is the `makeSet` seam (run-7's pictures.test.ts, ported).
import { describe, expect, it, vi } from "vitest";
import { checkPictureFile, preparePicture } from "./prepare";

const MB = 1024 * 1024;
const file = (name: string, type: string, size = 1): File => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("checkPictureFile", () => {
  it("a non-image is the notPicture sentence", () => {
    expect(checkPictureFile(file("a.txt", "text/plain"))).toBe("That file is not a picture. Choose a JPEG or PNG.");
  });
  it("exactly 25 MB passes, one byte over fails with 25 in the sentence", () => {
    expect(checkPictureFile(file("a.jpg", "image/jpeg", 25 * MB))).toBeNull();
    expect(checkPictureFile(file("a.jpg", "image/jpeg", 25 * MB + 1))).toBe("That picture is larger than 25 MB. Choose a smaller one.");
  });
  it("maxBytes and words are the caller's", () => {
    const words = { notPicture: "Nope.", tooBig: (mb: number) => `Over ${mb}.` };
    expect(checkPictureFile(file("a.txt", "text/plain"), { words })).toBe("Nope.");
    expect(checkPictureFile(file("a.jpg", "image/jpeg", 3 * MB), { maxBytes: 2 * MB, words })).toBe("Over 2.");
    expect(checkPictureFile(file("a.jpg", "image/jpeg", 2 * MB), { maxBytes: 2 * MB, words })).toBeNull();
  });
  it("a HEIC file with an empty type is a picture (picture-pick's rule)", () => {
    expect(checkPictureFile(file("IMG_1.HEIC", ""))).toBeNull();
  });
});

describe("preparePicture", () => {
  const thumb = new Blob(["t"]);
  const screen = new Blob(["sss"]);
  const makeSet = vi.fn(async (_f: Blob, _o?: unknown) => ({ thumb, screen, full: new Blob(["F"]), width: 1, height: 1, type: "image/jpeg" as const }));

  it("keeps only the screen copy and the thumbnail, asks for type auto and no full copy, and gives a preview URL of the screen copy", async () => {
    const url = vi.fn((_b: Blob) => "blob:preview");
    URL.createObjectURL = url;
    const src = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const out = await preparePicture(src, { makeSet });
    expect(makeSet).toHaveBeenCalledWith(src, { type: "auto", sizes: { full: false } });
    expect(out).toEqual({ thumb, screen, previewUrl: "blob:preview" });
    expect(url).toHaveBeenCalledWith(screen);
  });
  it("screenEdge and thumbEdge are passed to the shrinker only when given", async () => {
    makeSet.mockClear();
    URL.createObjectURL = vi.fn((_b: Blob) => "blob:p");
    await preparePicture(new File(["x"], "a.jpg", { type: "image/jpeg" }), { makeSet, screenEdge: 1200, thumbEdge: 200 });
    expect(makeSet.mock.calls[0]![1]).toEqual({ type: "auto", sizes: { full: false, screen: 1200, thumb: 200 } });
  });
  it("a picture that cannot be decoded throws what the shrinker threw", async () => {
    const boom = new Error("unreadable");
    await expect(preparePicture(new File(["x"], "a.jpg"), { makeSet: async () => { throw boom; } })).rejects.toBe(boom);
  });
});
