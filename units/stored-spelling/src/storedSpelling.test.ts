import { describe, expect, it } from "vitest";
import { namesNoStoredFact, parseVaultContext, storedSpellingFor } from "./storedSpelling";

describe("parseVaultContext", () => {
  it("reads terms and skips prefixes, keywords, and a URL context", () => {
    const terms = parseVaultContext({
      "@context": {
        "@vocab": "https://h.example/base/a/",
        a: "https://h.example/base/a/",
        shows: { "@id": "a:viewShows" },
        child: { "@id": "a:child", "@container": "@set" },
        listed: { "@id": "a:listed", "@container": "@list" },
        blank: { "@id": "" },
      },
    });
    expect(terms.get("shows")).toEqual({ id: "a:viewShows", assembled: false });
    expect(terms.get("child")).toEqual({ id: "a:child", assembled: true });
    expect(terms.get("listed")).toEqual({ id: "a:listed", assembled: false });
    expect(terms.has("a")).toBe(false);
    expect(terms.has("@vocab")).toBe(false);
    expect(terms.has("blank")).toBe(false);
    expect(parseVaultContext("https://h.example/context").size).toBe(0);
    expect(parseVaultContext(null).size).toBe(0);
    expect(parseVaultContext([]).size).toBe(0);
  });

  it("uses the document itself when @context is absent", () => {
    const terms = parseVaultContext({ label: { "@id": "a:label" } });
    expect(terms.get("label")).toEqual({ id: "a:label", assembled: false });
  });
});

describe("namesNoStoredFact", () => {
  it("is true only for an assembled term", () => {
    const ctx = parseVaultContext({
      child: { "@id": "a:child", "@container": "@set" },
      label: { "@id": "a:label" },
    });
    expect(namesNoStoredFact("child", ctx)).toBe(true);
    expect(namesNoStoredFact("label", ctx)).toBe(false);
    expect(namesNoStoredFact("missing", ctx)).toBe(false);
    expect(namesNoStoredFact(" child", ctx)).toBe(false);
  });
});

describe("storedSpellingFor", () => {
  const empty = parseVaultContext({});

  it("keeps addresses and any key that already has a colon", () => {
    expect(storedSpellingFor("https://h.example/a/name", empty, "unknown", true)).toBe(
      "https://h.example/a/name",
    );
    expect(storedSpellingFor("HTTP://h.example/a/name", empty, "unknown", true)).toBe(
      "HTTP://h.example/a/name",
    );
    expect(storedSpellingFor("a:label", empty, "unknown", true)).toBe("a:label");
    expect(storedSpellingFor("owl:sameAs", empty, "unknown", true)).toBe("owl:sameAs");
  });

  it("inverts a rename, keeps an assembled key, and prefixes a slug", () => {
    const ctx = parseVaultContext({
      shows: { "@id": "a:viewShows" },
      child: { "@id": "a:child", "@container": "@set" },
    });
    expect(storedSpellingFor("shows", ctx, "prefixed", true)).toBe("a:viewShows");
    expect(storedSpellingFor("child", ctx, "prefixed", true)).toBe("child");
    expect(storedSpellingFor("name", empty, "unknown", true)).toBe("a:name");
    expect(storedSpellingFor("name", empty, "bare", true)).toBe("name");
    expect(storedSpellingFor("name", empty, "bare", false)).toBe("a:name");
    expect(storedSpellingFor("1abc", empty, "unknown", true)).toBe("1abc");
    expect(storedSpellingFor("", empty, "unknown", true)).toBe("");
    expect(storedSpellingFor("httpfoo", empty, "unknown", false)).toBe("a:httpfoo");
  });
});
