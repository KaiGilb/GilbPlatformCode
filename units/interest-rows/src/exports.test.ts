// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["INTEREST_READING_TEXT", "InterestRows"]);
});
it("the reading word", () => {
  expect(unit.INTEREST_READING_TEXT).toBe("…");
});
