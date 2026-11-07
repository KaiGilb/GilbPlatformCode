import { expect, test } from "vitest";
import { textHits } from "./textFilter";

// Ported from TestFlowerPower screens/search.test.tsx:29-37, with the option on.
test("with foldAccents: ignores case and accents, needs every word", () => {
  const o = { foldAccents: true };
  expect(textHits("CAFE", ["Café rose"], o)).toBe(true);
  expect(textHits("red clo", ["Red clover"], o)).toBe(true);
  expect(textHits("clover red", ["Red clover"], o)).toBe(true);
  expect(textHits("red daisy", ["Oxeye daisy"], o)).toBe(false);
  expect(textHits("  ", ["x"], o)).toBe(true);
});

test("without the option accents still count (today's behaviour)", () => {
  expect(textHits("cafe", ["Café rose"])).toBe(false);
  expect(textHits("café", ["cafe rose"])).toBe(false);
  expect(textHits("cafe", ["Café rose"], {})).toBe(false);
  expect(textHits("cafe", ["Café rose"], { foldAccents: false })).toBe(false);
});

test("only the value true turns the fold on: another truthy value is not true", () => {
  expect(textHits("cafe", ["Café rose"], { foldAccents: 1 as unknown as boolean })).toBe(false);
  expect(textHits("cafe", ["Café rose"], { foldAccents: "yes" as unknown as boolean })).toBe(false);
});

test("the option folds both sides, composed or decomposed", () => {
  const o = { foldAccents: true };
  expect(textHits("café", ["cafe rose"], o)).toBe(true);
  expect(textHits("café", ["Café"], o)).toBe(true);
  expect(textHits("angstrom", ["Ångström"], o)).toBe(true);
  expect(textHits("istanbul", ["İstanbul"], o)).toBe(true);
  expect(textHits("İ", ["istanbul"], o)).toBe(true);
});

test("with the option on, null fields are skipped and the fields are joined by a line break", () => {
  const o = { foldAccents: true };
  expect(textHits("red boat", ["a red", null, "boat"], o)).toBe(true);
  expect(textHits("red boat", [null, undefined], o)).toBe(false);
  expect(textHits("", [], o)).toBe(true);
});

test("the fold quirk: ^ and the backtick are diacritics, so they fold to nothing", () => {
  const o = { foldAccents: true };
  expect(textHits("^", ["x"], o)).toBe(true);
  expect(textHits("`", ["x"], o)).toBe(true);
  expect(textHits("a^b", ["ab"], o)).toBe(true);
  // and without the option they are ordinary characters
  expect(textHits("^", ["x"])).toBe(false);
  expect(textHits("a^b", ["ab"])).toBe(false);
  expect(textHits("a^b", ["a^b"])).toBe(true);
});

// A literal copy of the 0.1.0 function.
function textHits010(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token !== "");
  if (tokens.length === 0) return true;
  const hay = fields
    .filter((field): field is string => typeof field === "string")
    .join("\n")
    .toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

test("without the option the answer is 0.1.0's, for 200 generated pairs (including non-ASCII)", () => {
  const words = ["red", "Red", "boat", "Ångström", "İstanbul", "istanbul", "ß", "SS", "é", "é", "cafe", "Café", "^", "`", "a^b", "ab", "x", "", " ", "naïve", "ﬁ", "fi", "ñ", "ñ", "Ω", "ω", "ǅ", "100%", "a/b", "tab\tsep"];
  let seed = 12345;
  const next = (n: number) => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
  const pick = () => words[next(words.length)]!;
  let trues = 0;
  for (let i = 0; i < 200; i++) {
    const fields = Array.from({ length: next(4) }, () => (next(6) === 0 ? null : Array.from({ length: 1 + next(3) }, pick).join(" ")));
    const fromFields = fields.flatMap((f) => (f ? f.split(" ") : []));
    const queryWords = Array.from({ length: 1 + next(2) }, () => (next(2) === 0 && fromFields.length > 0 ? fromFields[next(fromFields.length)]! : pick()));
    const query = queryWords.join(next(2) ? " " : "  ");
    const got = textHits(query, fields);
    expect(got, JSON.stringify([query, fields])).toBe(textHits010(query, fields));
    if (got) trues++;
  }
  // The generator reaches both answers.
  expect(trues).toBeGreaterThan(20);
  expect(200 - trues).toBeGreaterThan(20);
});
