import { describe, expect, test } from "vitest";
import { pictureFiles } from "./index";

const file = (name: string, type: string) => new File(["x"], name, { type });

describe("pictureFiles", () => {
  test("keeps image types, in order", () => {
    const a = file("a.jpg", "image/jpeg");
    const b = file("b.png", "image/png");
    const c = file("c.heic", "image/heic");
    expect(pictureFiles([a, b, c])).toEqual([a, b, c]);
  });
  test("drops text/plain and other non-image types, even with a picture name", () => {
    expect(pictureFiles([file("a.txt", "text/plain"), file("b.jpg", "application/pdf")])).toEqual([]);
  });
  test("an empty type with a HEIC name is kept", () => {
    const f = file("IMG_1.HEIC", "");
    expect(pictureFiles([f])).toEqual([f]);
  });
  test("an empty type with notes.txt is dropped", () => {
    expect(pictureFiles([file("notes.txt", "")])).toEqual([]);
  });
  test.each([".heic", ".heif", ".avif", ".webp", ".jpg", ".jpeg", ".png", ".gif"])("an empty type with %s is kept, in capitals too", (ext) => {
    const lower = file("pic" + ext, "");
    const upper = file("PIC" + ext.toUpperCase(), "");
    expect(pictureFiles([lower, upper])).toEqual([lower, upper]);
  });
  test("a name that only contains an extension is not a picture", () => {
    expect(pictureFiles([file("jpg", ""), file("a.png.txt", ""), file("a.jpgx", "")])).toEqual([]);
  });
  test("null and undefined give an empty list", () => {
    expect(pictureFiles(null)).toEqual([]);
    expect(pictureFiles(undefined)).toEqual([]);
  });
  test("order is kept among mixed files", () => {
    const a = file("a.png", "image/png");
    const t = file("t.txt", "text/plain");
    const b = file("b.JPG", "");
    expect(pictureFiles([a, t, b])).toEqual([a, b]);
  });
});
