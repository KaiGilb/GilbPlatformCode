import { describe, expect, it } from "vitest";
import { absoluteIdFromCompact, memberAddress, vaultBaseFromRelationId } from "./compactId";

const DOC = "https://example.test/base/r/rel1";

describe("vaultBaseFromRelationId", () => {
  it("takes the base from an /e or /r document id and keeps the trailing slash", () => {
    expect(vaultBaseFromRelationId(DOC)).toBe("https://example.test/base/");
    expect(vaultBaseFromRelationId("http://example.test/base/e/one")).toBe("http://example.test/base/");
  });

  it("rejects vault, a query, a trailing slash, and a non-string", () => {
    expect(vaultBaseFromRelationId("https://example.test/vault/e/one")).toBeNull();
    expect(vaultBaseFromRelationId("https://example.test/base/e/one?x=1")).toBeNull();
    expect(vaultBaseFromRelationId("https://example.test/base/e/one/")).toBeNull();
    expect(vaultBaseFromRelationId(null)).toBeNull();
  });
});

describe("absoluteIdFromCompact", () => {
  it("expands base: with the document base and leaves http and urn alone", () => {
    const base = vaultBaseFromRelationId(DOC);
    expect(absoluteIdFromCompact("base:e/petter", base)).toBe("https://example.test/base/e/petter");
    expect(absoluteIdFromCompact({ "@id": "base:e/petter" }, base)).toBe("https://example.test/base/e/petter");
    expect(absoluteIdFromCompact("https://example.test/base/e/a", base)).toBe("https://example.test/base/e/a");
    expect(absoluteIdFromCompact("urn:example:a", null)).toBe("urn:example:a");
  });

  it("returns null for a short form when no base was passed, rather than the short form", () => {
    expect(absoluteIdFromCompact("base:e/petter", null)).toBeNull();
    expect(absoluteIdFromCompact("not-an-address", "https://example.test/base/")).toBeNull();
  });

  it("treats a string that merely starts with http as already absolute", () => {
    expect(absoluteIdFromCompact("httpfoo", null)).toBe("httpfoo");
  });

  it("does not unwrap a list; memberAddress does, and takes the first only", () => {
    const base = vaultBaseFromRelationId(DOC);
    expect(absoluteIdFromCompact(["base:e/a"], base)).toBeNull();
    expect(memberAddress(["base:e/a", "base:e/b"], base)).toBe("https://example.test/base/e/a");
    expect(memberAddress([], base)).toBeNull();
  });
});
