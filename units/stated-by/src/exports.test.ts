// @vitest-environment node
// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["comparableIri", "isStatedBy", "sameIri"]);
});
it("arities", () => {
  expect(unit.comparableIri.length).toBe(2);
  expect(unit.sameIri.length).toBe(3);
  expect(unit.isStatedBy.length).toBe(3);
});
