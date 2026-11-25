// Spec: Solution TableView.SameRecords, Read.Columns (a `multi` field of a record is read as a list); Agent.Coder.GilbStack item 13.
// `readList(record, term)` reads the term's own `a:cardinality` and hands back a list for a `multi` term, whether the server sent no
// value, one bare value or an array. Ported by test block from gilb-stakeholders `test/lists.test.ts` at 0a261488 (the `readList`
// blocks, lines 15-105; the `createListReader` blocks are left out: that function is not taken).
//
// Every expected value is a LITERAL. The same record is read under a `multi` term and a `single` term, so a helper that ignored the
// term's cardinality gives a different answer in one of the two.
import { describe, it, expect } from "vitest";
import { readList } from "./lists";
import { VocabularyUnavailableError, type TermDoc } from "./terms";
import { a, CONTEXT } from "../test/support";

const term = (slug: string, cardinality: string | undefined, binding = `a:${slug}`): TermDoc => ({
  "@context": CONTEXT,
  "@id": a(slug),
  "a:predicateAttribute": binding,
  ...(cardinality === undefined ? {} : { "a:cardinality": cardinality }),
});

const MULTI = term("handsOffTo", "multi");
const SINGLE = term("visibilityTier", "single", "a:visibilityTier");

describe("readList — a multi term always yields an array", () => {
  it("value absent -> []", () => {
    expect(readList({ "@id": "r1" }, MULTI)).toEqual([]);
  });
  it("one bare value -> a one-element list (the fishing-app case)", () => {
    expect(readList({ "a:handsOffTo": "x" }, MULTI)).toEqual(["x"]);
    expect(readList({ "a:handsOffTo": { "@id": "x" } }, MULTI)).toEqual([{ "@id": "x" }]);
  });
  it("an array -> the same elements, in order", () => {
    expect(readList({ "a:handsOffTo": ["x", "y", "z"] }, MULTI)).toEqual(["x", "y", "z"]);
  });
  it("a one-element array -> a one-element list", () => {
    expect(readList({ "a:handsOffTo": ["x"] }, MULTI)).toEqual(["x"]);
  });
  it("null and undefined count as absent", () => {
    expect(readList({ "a:handsOffTo": null }, MULTI)).toEqual([]);
    expect(readList({ "a:handsOffTo": undefined }, MULTI)).toEqual([]);
  });
  it("falsy but real values are kept (0, false, empty string)", () => {
    expect(readList({ "a:handsOffTo": 0 }, MULTI)).toEqual([0]);
    expect(readList({ "a:handsOffTo": [false, ""] }, MULTI)).toEqual([false, ""]);
  });
  it("reads every spelling of the term, prefixed and bare, in binding order", () => {
    const m = term("handsOffTo", "multi", "a:handsOffTo|a:legacyHandsOff");
    expect(readList({ handsOffTo: "p", "a:legacyHandsOff": ["q", "r"] }, m)).toEqual(["p", "q", "r"]);
  });
  it("ignores keys that are not the term's spelling", () => {
    expect(readList({ "a:other": "no", "a:handsOffTo": "yes" }, MULTI)).toEqual(["yes"]);
  });
});

describe("readList — a single term returns the value unchanged", () => {
  it("bare value -> the bare value, not wrapped", () => {
    expect(readList({ "a:visibilityTier": "private" }, SINGLE)).toBe("private");
  });
  it("absent -> undefined, not []", () => {
    expect(readList({}, SINGLE)).toBeUndefined();
    expect(readList({ "a:visibilityTier": null }, SINGLE)).toBeUndefined();
  });
  it("an array stored under a single term is passed through as the server sent it", () => {
    const stored = ["a", "b"];
    expect(readList({ "a:visibilityTier": stored }, SINGLE)).toBe(stored);
  });
  it("the same record reads differently under the two cardinalities", () => {
    const rec = { "a:handsOffTo": "x", "a:visibilityTier": "x" };
    expect(readList(rec, MULTI)).toEqual(["x"]);
    expect(readList(rec, SINGLE)).toBe("x");
  });
});

describe("readList — no mutation, no aliasing", () => {
  it("leaves the record deeply equal to a frozen copy and returns a new array", () => {
    const stored = ["x", { "@id": "y" }];
    const rec = Object.freeze({ "a:handsOffTo": Object.freeze(stored) });
    const before = JSON.stringify(rec);
    const out = readList(rec, MULTI) as unknown[];
    expect(JSON.stringify(rec)).toBe(before);
    expect(out).toEqual(stored);
    expect(out).not.toBe(stored);
    out.push("z");
    expect(stored).toHaveLength(2);
  });
});

describe("readList — unknown or unreadable term is refused, never read as empty", () => {
  it("no a:cardinality on the term -> VocabularyUnavailableError", () => {
    expect(() => readList({ "a:x": "v" }, term("x", undefined))).toThrow(VocabularyUnavailableError);
  });
  it("an unrecognised cardinality token -> VocabularyUnavailableError naming it", () => {
    expect(() => readList({}, term("x", "many"))).toThrow(/many/);
  });
  it("no a:predicateAttribute -> VocabularyUnavailableError", () => {
    expect(() => readList({}, { "@id": a("x"), "a:cardinality": "multi" })).toThrow(VocabularyUnavailableError);
  });
  it("a missing term document -> VocabularyUnavailableError", () => {
    expect(() => readList({}, undefined as unknown as TermDoc)).toThrow(VocabularyUnavailableError);
  });
  it("accepts the bare-framed cardinality key", () => {
    expect(readList({ "a:x": "v" }, { "@id": a("x"), predicateAttribute: "a:x", cardinality: "multi" })).toEqual(["v"]);
  });
});
