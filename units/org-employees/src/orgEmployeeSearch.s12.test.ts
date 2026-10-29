// Cycle214 s12 iteration 4 (Kai 2026-10-16: "what happens if an org has 1000 employees, does it turn into a search? We can not have a list of hundreds").
// The pure part of the employees search: the filter over the people ALREADY LOADED, and the plain sentence that says what was searched.
import { describe, expect, it } from "vitest";
import { filterEmployeesByName, foldName, groupCountText, noMatchSentence, searchScopeSentence, stillLoadingSentence, INLINE_EMPLOYEES, SEARCH_DEBOUNCE_MS } from "./orgEmployeeSearch";

const p = (id: string, name: string | null) => ({ person: `https://v/e/${id}`, id, name, titles: [], photoRef: null });

describe("the constants", () => {
  it("the short list is the first 10, and typing waits before it filters", () => {
    expect(INLINE_EMPLOYEES).toBe(10);
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(150);
  });
});

describe("foldName", () => {
  it("ignores case, accents, Norwegian o-slash and ae, and repeated spaces", () => {
    expect(foldName("  Bjørn   ÅSE ")).toBe("bjorn ase");
    expect(foldName("Æsir")).toBe("aesir");
  });
});

describe("filterEmployeesByName", () => {
  const all = [p("1", "Ann Berg"), p("2", "Bjørn Dahl"), p("3", "Cleo Bergström"), p("4", null)];
  it("an empty or blank query is everyone, in the same order", () => {
    expect(filterEmployeesByName(all, "")).toEqual(all);
    expect(filterEmployeesByName(all, "   ")).toEqual(all);
  });
  it("matches every word of the query anywhere in the name", () => {
    expect(filterEmployeesByName(all, "berg").map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterEmployeesByName(all, "ann berg").map((x) => x.id)).toEqual(["1"]);
    expect(filterEmployeesByName(all, "berg ann").map((x) => x.id)).toEqual(["1"]);
    expect(filterEmployeesByName(all, "bjorn").map((x) => x.id)).toEqual(["2"]);
  });
  it("a person with no name never matches a typed query", () => {
    expect(filterEmployeesByName(all, "no").map((x) => x.id)).not.toContain("4");
    expect(filterEmployeesByName(all, "(no name)")).toEqual([]);
  });
  it("only ever returns people it was given (it cannot add one)", () => {
    expect(filterEmployeesByName([], "ann")).toEqual([]);
    for (const hit of filterEmployeesByName(all, "e")) expect(all).toContain(hit);
  });
});

describe("searchScopeSentence: never claims to have searched everyone when it searched what is loaded", () => {
  it("more to load: says loaded, says not everyone, and how to load more", () => {
    const s = searchScopeSentence({ loaded: 10, hasMore: true, where: "card" });
    expect(s).toBe("Searching the 10 people loaded, not everyone. Show all to load more.");
    expect(searchScopeSentence({ loaded: 50, hasMore: true, where: "list" })).toBe("Searching the 50 people loaded, not everyone. Show more loads the next 50.");
  });
  it("one person loaded reads as one", () => {
    expect(searchScopeSentence({ loaded: 1, hasMore: true, where: "card" })).toMatch(/^Searching the 1 person loaded, not everyone\./);
  });
  it("everything loaded: says so", () => {
    expect(searchScopeSentence({ loaded: 12, hasMore: false, where: "list" })).toBe("Searching all 12 people.");
    expect(searchScopeSentence({ loaded: 1, hasMore: false, where: "card" })).toBe("Searching the 1 person here.");
  });
  it("never says 'all' or 'everyone' as a claim while more can be loaded", () => {
    for (const where of ["card", "list"] as const) {
      const s = searchScopeSentence({ loaded: 30, hasMore: true, where });
      expect(s).not.toMatch(/searching all/i);
      expect(s).toMatch(/not everyone/);
    }
  });
});

describe("noMatchSentence: says what was searched, never that no such person exists while more can load", () => {
  it("more to load", () => {
    expect(noMatchSentence({ loaded: 10, hasMore: true, where: "card" })).toBe("No one among the 10 people loaded matches. Show all to load more.");
    expect(noMatchSentence({ loaded: 60, hasMore: true, where: "list" })).toBe("No one among the 60 people loaded matches. Show more loads the next 50.");
  });
  it("all loaded", () => {
    expect(noMatchSentence({ loaded: 75, hasMore: false, where: "list" })).toBe("No one among all 75 people matches.");
  });
  it("carries no word about people left out", () => {
    for (const hasMore of [true, false]) expect(noMatchSentence({ loaded: 3, hasMore, where: "card" })).not.toMatch(/hidden|private|may not|restricted|not listed|left out/i);
  });
});

describe("typed accents are folded as the names are (Agent.Tester s17 V6)", () => {
  const names = [p("1", "Bjørg Dahl"), p("2", "Åse Lie"), p("3", "Æsa Berg"), p("4", "José Moen"), p("5", "Plain Name")];
  it("an accented or capital query finds the name with or without the accent", () => {
    expect(filterEmployeesByName(names, "ø").map((x) => x.id)).toContain("1");
    expect(filterEmployeesByName(names, "BJØRG").map((x) => x.id)).toEqual(["1"]);
    expect(filterEmployeesByName(names, "bjorg").map((x) => x.id)).toEqual(["1"]);
    expect(filterEmployeesByName(names, "ÅSE").map((x) => x.id)).toEqual(["2"]);
    expect(filterEmployeesByName(names, "å").map((x) => x.id)).toContain("2");
    expect(filterEmployeesByName(names, "Æ").map((x) => x.id)).toEqual(["3"]);
    expect(filterEmployeesByName(names, "josé").map((x) => x.id)).toEqual(["4"]);
    expect(filterEmployeesByName(names, "jose").map((x) => x.id)).toEqual(["4"]);
  });
});

describe("groupCountText: one count over the rows drawn (Agent.Tester s17 F1)", () => {
  it("more to read: shown of the platform's records (people) or of the units", () => {
    expect(groupCountText({ shown: 10, loaded: 10, hasMore: true, total: 220, noun: "people" })).toBe("10 people shown of 220 records");
    expect(groupCountText({ shown: 1, loaded: 1, hasMore: true, total: 5, noun: "people" })).toBe("1 person shown of 5 records");
    expect(groupCountText({ shown: 10, loaded: 10, hasMore: true, total: 200, noun: "units" })).toBe("10 units shown of 200");
  });
  it("the total is never below what is loaded", () => {
    expect(groupCountText({ shown: 10, loaded: 20, hasMore: true, total: 3, noun: "people" })).toBe("10 people shown of 20 records");
  });
  it("all read: the number of rows, or 'N of M shown' when the card draws only its ten", () => {
    expect(groupCountText({ shown: 12, loaded: 12, hasMore: false, total: 12, noun: "people" })).toBe("12 people");
    expect(groupCountText({ shown: 1, loaded: 1, hasMore: false, total: 1, noun: "units" })).toBe("1 unit");
    expect(groupCountText({ shown: 10, loaded: 12, hasMore: false, total: 12, noun: "people" })).toBe("10 of 12 people shown");
    expect(groupCountText({ shown: 10, loaded: 12, hasMore: false, total: 12, noun: "units" })).toBe("10 of 12 units shown");
  });
});

describe("stillLoadingSentence", () => {
  it("says it is reading, and claims nothing about who exists", () => {
    expect(stillLoadingSentence({ loaded: 10 })).toBe("Still reading the next 50. No one among the 10 people loaded matches yet.");
    expect(stillLoadingSentence({ loaded: 60, noun: "units" })).toBe("Still reading the next 50. No one among the 60 units loaded matches yet.");
    expect(stillLoadingSentence({ loaded: 10 })).not.toMatch(/no such|nobody is|does not exist/i);
  });
});
