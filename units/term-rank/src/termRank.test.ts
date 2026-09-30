import { expect, test } from "vitest";
import { compareByRank, rankOf, wordStartMatcher } from "./termRank";

test("exact beats prefix, prefix beats a word start, a word start beats a buried match", () => {
  const q = "rule";
  const word = wordStartMatcher(q);
  expect(rankOf("Rule", "other", q, word)).toBe(0);
  expect(rankOf("Rule book", "other", q, word)).toBe(1);
  expect(rankOf("Specification Rule", "other", q, word)).toBe(2);
  expect(rankOf("Overruled", "other", q, word)).toBe(3);
});

test("a query with punctuation does not throw", () => {
  const q = "c++";
  expect(() => wordStartMatcher(q)).not.toThrow();
  expect(rankOf("C++", "c++", q, wordStartMatcher(q))).toBe(0);
});

test("sort puts the named term first and does not reorder equals", () => {
  const rows = [
    { label: "Overruled", name: "a" },
    { label: "Specification Rule", name: "b" },
    { label: "Rule", name: "c" },
  ];
  const sorted = [...rows].sort((a, b) => compareByRank(a, b, "rule"));
  expect(sorted.map((row) => row.name)).toEqual(["c", "b", "a"]);
});
