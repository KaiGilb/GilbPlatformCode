import { expect, test } from "vitest";
import { textHits } from "./textFilter";

test("every word must appear, and a blank query keeps the row", () => {
  expect(textHits("", ["anything"])).toBe(true);
  expect(textHits("  ", [null])).toBe(true);
  expect(textHits("red boat", ["a red boat", null])).toBe(true);
  expect(textHits("red sail", ["a red boat"])).toBe(false);
});
