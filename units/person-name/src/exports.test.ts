// New. Pins the entry point: the four functions of the kept range, and no `joinPersonName` (it stays in `plan-self-source`).
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly splitPersonName, personCardOrder, personSectionOrder and personCardFields", () => {
  expect(Object.keys(unit).sort()).toEqual(["personCardFields", "personCardOrder", "personSectionOrder", "splitPersonName"]);
});
it("the optional fifth and third parameters are kept (arity)", () => {
  expect(unit.splitPersonName.length).toBe(1);
  expect(unit.personCardOrder.length).toBe(5);
  expect(unit.personSectionOrder.length).toBe(3);
  expect(unit.personCardFields.length).toBe(3);
});
