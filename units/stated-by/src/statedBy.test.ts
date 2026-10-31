// @vitest-environment node
// Ported from the app's sourceIsAdder.sb1a.test.ts ("SB1a-2 isStatedBy compares the FULL card address", 4 cases) and
// sourceIsAdder.sb1d.test.tsx ("isStatedBy: byte-equal, nothing else", 3 cases, one of them over 7 spellings), plus new cases for
// sameIri / comparableIri, which the source tests only touch once.
import { describe, expect, it } from "vitest";
import { comparableIri, isStatedBy, sameIri } from "./statedBy";

const CARD = "https://adder.example.test/base/e/vsc-same-tail";
const CLAIM = "https://adder.example.test/base/e/claim1";

describe("isStatedBy compares the FULL card address, not the id tail", () => {
  it("two cards with the same id tail in different vaults are NOT the same stater", () => {
    expect(isStatedBy(["https://other.example.test/base/e/vsc-same-tail"], CARD)).toBe(false);
    expect(isStatedBy(["https://adder.example.test/base/e/vsc-other-tail"], CARD)).toBe(false);
    expect(sameIri("https://a.example.test/base/e/x1", "https://b.example.test/base/e/x1")).toBe(false);
  });
  it("the exact card is the stater; its other spellings (blanks, host case, trailing slash, /vault/e/) are NOT", () => {
    expect(isStatedBy([CARD], CARD)).toBe(true);
    expect(isStatedBy([`  ${CARD}  `], CARD)).toBe(false);
    expect(isStatedBy(["https://ADDER.example.test/base/e/vsc-same-tail/"], CARD)).toBe(false);
    expect(isStatedBy(["https://adder.example.test/vault/e/vsc-same-tail"], CARD)).toBe(false);
  });
  it("a compact base: form is not the stater, with or without the claim's own address", () => {
    expect(isStatedBy(["base:e/vsc-same-tail"], CARD, CLAIM)).toBe(false);
    expect(isStatedBy(["base:e/vsc-same-tail"], CARD)).toBe(false);
  });
  it("one stater only: none, or two, is nobody's; no card known is nobody's", () => {
    expect(isStatedBy([], CARD)).toBe(false);
    expect(isStatedBy([CARD, "https://other.example.test/base/e/x"], CARD)).toBe(false);
    expect(isStatedBy([CARD], null)).toBe(false);
    expect(isStatedBy([CARD], undefined)).toBe(false);
    expect(isStatedBy([CARD], "")).toBe(false);
  });
  it("an empty stated value is not matched by an empty card", () => {
    expect(isStatedBy([""], "")).toBe(false);
    expect(isStatedBy([""], null)).toBe(false);
  });
});

describe("isStatedBy: byte-equal, nothing else", () => {
  const spellings: Array<[string, string]> = [
    ["trailing slash", `${CARD}/`],
    ["fragment", `${CARD}#me`],
    ["query", `${CARD}?x=1`],
    ["/vault/e/ for /base/e/", CARD.replace("/base/e/", "/vault/e/")],
    ["http://", CARD.replace("https://", "http://")],
    ["upper-case host", CARD.replace(/^(https?:\/\/)([^/]+)/, (_m, a: string, h: string) => a + h.toUpperCase())],
    ["surrounding blanks", ` ${CARD} `],
  ];
  it("the exact canonical form is own", () => {
    expect(isStatedBy([CARD], CARD)).toBe(true);
  });
  it.each(spellings)("%s is NOT own", (_n, v) => {
    expect(isStatedBy([v], CARD)).toBe(false);
    expect(isStatedBy([v], CARD, CLAIM)).toBe(false);
  });
  it("the claim's address argument is unused: the same answer with and without it", () => {
    expect(isStatedBy([CARD], CARD, CLAIM)).toBe(true);
    expect(isStatedBy([CARD], CARD, "https://elsewhere.example.test/base/e/c")).toBe(true);
    expect(isStatedBy([CARD], CARD, null)).toBe(true);
  });
});

describe("sameIri and comparableIri (the lenient comparison, for a claim subject, not a source)", () => {
  it("the same address in other spellings is the same", () => {
    expect(sameIri(CARD, `${CARD}/`)).toBe(true);
    expect(sameIri(CARD, CARD.replace("/base/e/", "/vault/e/"))).toBe(true);
    expect(sameIri(CARD, "https://ADDER.example.test/base/e/vsc-same-tail?x=1")).toBe(true);
    expect(sameIri(`  ${CARD} `, CARD)).toBe(true);
  });
  it("a compact base: form is expanded against the claim's own address, and only when that is given", () => {
    expect(sameIri("base:e/vsc-same-tail", CARD, CLAIM)).toBe(true);
    expect(sameIri("base:e/vsc-same-tail", CARD)).toBe(false);
    expect(comparableIri("base:e/vsc-same-tail", CLAIM)).toBe(CARD);
    expect(comparableIri("base:e/x", "not-a-claim-address")).toBe("base://e/x");
  });
  it("a value that is not an address is trimmed too", () => {
    expect(sameIri("  x1 ", "x1")).toBe(true);
    expect(comparableIri("  x1 ")).toBe("x1");
  });
  it("different people are different, and a blank or missing side is never the same", () => {
    expect(sameIri(CARD, "https://adder.example.test/base/e/other")).toBe(false);
    expect(sameIri("", "")).toBe(false);
    expect(sameIri("  ", CARD)).toBe(false);
    expect(sameIri(null, CARD)).toBe(false);
    expect(sameIri(CARD, undefined)).toBe(false);
  });
  it("comparableIri folds host case, trailing slash, query and /vault/e/ to the /base/e/ form", () => {
    expect(comparableIri("https://ADDER.example.test/vault/e/abc/?q=1")).toBe("https://adder.example.test/base/e/abc");
  });
});
