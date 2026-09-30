import { describe, expect, it } from "vitest";
import { buildFrozenUnitTagPatch, readDocumentUnitTag } from "./frozenTag";

const FROZEN =
  'a:unitTag is frozen at assignment and cannot be renamed in place (served "Alpha", edited "Beta"). ' +
  "Clear the field to release the tag, then set the new one.";

describe("readDocumentUnitTag", () => {
  it("prefers the framed spelling and does not trim it", () => {
    expect(readDocumentUnitTag({ unitTag: "  Keep  ", "a:unitTag": "other" })).toBe("  Keep  ");
  });

  it("falls through a blank or whitespace framed value to the raw spelling", () => {
    expect(readDocumentUnitTag({ unitTag: "   ", "a:unitTag": " raw " })).toBe(" raw ");
    expect(readDocumentUnitTag({ unitTag: "", "a:unitTag": "raw" })).toBe("raw");
  });

  it("ignores a bare tag, a non-string, and missing facts", () => {
    expect(readDocumentUnitTag({ tag: "En1", op: "manual" })).toBeUndefined();
    expect(readDocumentUnitTag({ unitTag: 1, "a:unitTag": null })).toBeUndefined();
    expect(readDocumentUnitTag(null)).toBeUndefined();
    expect(readDocumentUnitTag(undefined)).toBeUndefined();
  });
});

describe("buildFrozenUnitTagPatch", () => {
  it("refuses a rename and quotes the untrimmed original and the trimmed edit", () => {
    expect(() => buildFrozenUnitTagPatch("Alpha", "Beta")).toThrow(FROZEN);
    expect(() => buildFrozenUnitTagPatch(" Alpha ", "  Beta  ")).toThrow(
      /served " Alpha ", edited "Beta"/,
    );
  });

  it("sends nothing when the bytes match", () => {
    expect(buildFrozenUnitTagPatch("Alpha", "Alpha")).toEqual({});
    expect(buildFrozenUnitTagPatch("  ", "  ")).toEqual({});
  });

  it("clears only an exact empty edit, and writes a space", () => {
    expect(buildFrozenUnitTagPatch("Alpha", "")).toEqual({ unitTag: null });
    expect(buildFrozenUnitTagPatch(" Alpha ", "")).toEqual({ unitTag: null });
    expect(buildFrozenUnitTagPatch("Alpha", " ")).toEqual({ unitTag: " " });
  });

  it("writes a trim-equal edit instead of refusing it", () => {
    expect(buildFrozenUnitTagPatch(" Alpha ", "Alpha")).toEqual({ unitTag: "Alpha" });
    expect(buildFrozenUnitTagPatch("Alpha", " Alpha ")).toEqual({ unitTag: " Alpha " });
  });

  it("a whitespace-only original does not freeze a new tag", () => {
    expect(buildFrozenUnitTagPatch("   ", "Beta")).toEqual({ unitTag: "Beta" });
    expect(buildFrozenUnitTagPatch("", "Beta")).toEqual({ unitTag: "Beta" });
  });
});
