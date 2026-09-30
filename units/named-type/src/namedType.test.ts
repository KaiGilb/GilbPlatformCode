import { describe, expect, it } from "vitest";
import { UNTYPED_FIND, bareTypeNames, isNamedBareType, typeLocalName } from "./namedType";

describe("typeLocalName", () => {
  it("strips t: and a letter prefix, and reads /base/t/ only", () => {
    expect(typeLocalName("t:Note")).toBe("Note");
    expect(typeLocalName("  t:Note  ")).toBe("Note");
    expect(typeLocalName("a:BrotherOf")).toBe("BrotherOf");
    expect(typeLocalName("https://example.test/base/t/Note%20Doc")).toBe("Note Doc");
    expect(typeLocalName("https://example.test/vault/t/Note")).toBe(
      "https://example.test/vault/t/Note",
    );
    expect(typeLocalName("BrotherOf")).toBe("BrotherOf");
  });

  it("throws on a broken percent-encoding in the /base/t/ segment", () => {
    expect(() => typeLocalName("https://example.test/base/t/%")).toThrow(URIError);
  });
});

describe("bareTypeNames", () => {
  it("trims, drops blanks, and keeps the first duplicate", () => {
    expect(bareTypeNames(null)).toEqual([]);
    expect(bareTypeNames(undefined)).toEqual([]);
    expect(bareTypeNames([" Note ", "", "   ", "Note", "Task"])).toEqual(["Note", "Task"]);
    expect(bareTypeNames(["t:Note"])).toEqual(["t:Note"]);
  });
});

describe("isNamedBareType", () => {
  it("matches the bare name and misses a vault path and an empty name", () => {
    expect(isNamedBareType("t:Note", ["Note"])).toBe(true);
    expect(isNamedBareType("https://example.test/base/t/Note", ["Note"])).toBe(true);
    expect(isNamedBareType("https://example.test/vault/t/Note", ["Note"])).toBe(false);
    expect(isNamedBareType("t:", [""])).toBe(false);
    expect(isNamedBareType(null, ["Note"])).toBe(false);
    expect(isNamedBareType("note", ["Note"])).toBe(false);
  });
});

describe("UNTYPED_FIND", () => {
  it("is the sentinel, not an empty list", () => {
    expect(UNTYPED_FIND).toBe("untyped-find");
    expect(bareTypeNames([])).toEqual([]);
  });
});
