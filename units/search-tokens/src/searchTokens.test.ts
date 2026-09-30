import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_TOKENS,
  labelFromSkillUri,
  labelWordPrefixMatchesQuery,
  searchTokens,
  wordPrefixMatch,
} from "./searchTokens";

describe("searchTokens", () => {
  it("keeps the first spelling, drops blanks and duplicates, and stops at 8", () => {
    expect(MAX_SEARCH_TOKENS).toBe(8);
    expect(searchTokens("  Foo   foo\nbar ")).toEqual(["Foo", "bar"]);
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens("1 2 3 4 5 6 7 8 9")).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(searchTokens("a\u00a0b")).toEqual(["a", "b"]);
    const combining = "e\u0301";
    expect(searchTokens(`${combining} é`)).toEqual(["é"]);
  });
});

describe("wordPrefixMatch", () => {
  it("matches the start of a word only, and an empty token is false", () => {
    expect(wordPrefixMatch("Handle Building", "han")).toBe(true);
    expect(wordPrefixMatch("Handle Building", "uild")).toBe(false);
    expect(wordPrefixMatch("Handle Building", "")).toBe(false);
    expect(wordPrefixMatch("Handle Building", "BUILD")).toBe(true);
  });
});

describe("labelWordPrefixMatchesQuery", () => {
  it("requires every kept token, and an empty query is not a match", () => {
    expect(labelWordPrefixMatchesQuery("Handle building materials", "han mat")).toBe(true);
    expect(labelWordPrefixMatchesQuery("Handle building materials", "han roof")).toBe(false);
    expect(labelWordPrefixMatchesQuery("Handle", "")).toBe(false);
    expect(labelWordPrefixMatchesQuery("Handle", "   ")).toBe(false);
    expect(labelWordPrefixMatchesQuery("a b c d e f g h", "1 2 3 4 5 6 7 8 9")).toBe(false);
    expect(labelWordPrefixMatchesQuery("1 2 3 4 5 6 7 8 9", "1 2 3 4 5 6 7 8 no")).toBe(true);
  });
});

describe("labelFromSkillUri", () => {
  it("spaces camel boundaries on the last segment only", () => {
    expect(labelFromSkillUri("https://example.test/base/t/HandleBuildingMaterials")).toBe(
      "handle building materials",
    );
    expect(labelFromSkillUri("https://example.test/base/t/HTMLParser")).toBe("html parser");
    expect(labelFromSkillUri("https://example.test/base/t/URLValue")).toBe("url value");
    expect(labelFromSkillUri("https://example.test/base/t/Foo/")).toBe("");
    expect(labelFromSkillUri("Already spaced")).toBe("already spaced");
  });
});
