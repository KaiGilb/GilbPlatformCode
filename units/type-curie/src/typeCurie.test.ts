import { describe, expect, it } from "vitest";
import { typeCurieFromJsonLd, typeLocalName } from "./typeCurie";

describe("typeCurieFromJsonLd", () => {
  it("keeps a CURIE, compacts a /base/t address, and takes only the first list entry", () => {
    expect(typeCurieFromJsonLd("t:BrotherOf")).toBe("t:BrotherOf");
    expect(typeCurieFromJsonLd("https://example.test/base/t/BrotherOf")).toBe("t:BrotherOf");
    expect(typeCurieFromJsonLd(["t:BrotherOf", "t:Relation"])).toBe("t:BrotherOf");
    expect(typeCurieFromJsonLd({ "@id": "https://example.test/base/t/SisterOf" })).toBe("t:SisterOf");
    expect(typeCurieFromJsonLd(undefined)).toBeNull();
  });

  it("does not add t: to a bare word, and does not compact a /vault/t address", () => {
    expect(typeCurieFromJsonLd("BrotherOf")).toBe("BrotherOf");
    expect(typeCurieFromJsonLd("https://example.test/vault/t/BrotherOf")).toBe(
      "https://example.test/vault/t/BrotherOf",
    );
  });

  it("returns null for blank and for an empty id", () => {
    expect(typeCurieFromJsonLd("  ")).toBeNull();
    expect(typeCurieFromJsonLd({ "@id": "" })).toBeNull();
    expect(typeCurieFromJsonLd([])).toBeNull();
  });
});

describe("typeLocalName", () => {
  it("strips t: and a letter prefix, and decodes a /base/t segment", () => {
    expect(typeLocalName("t:Note")).toBe("Note");
    expect(typeLocalName("base:Note")).toBe("Note");
    expect(typeLocalName("https://example.test/base/t/a%20b")).toBe("a b");
  });

  it("returns the trimmed original when the shape is not recognised", () => {
    expect(typeLocalName("  Note  ")).toBe("Note");
    expect(typeLocalName("https://example.test/vault/t/Note")).toBe("https://example.test/vault/t/Note");
  });
});
