// New. Pins the entry point: the two components of the source file, no more.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly AddInformationButton and AddInformationSheet", () => {
  expect(Object.keys(unit).sort()).toEqual(["AddInformationButton", "AddInformationSheet"]);
});
it("both take no props: the card's mode comes from the card-mode provider", () => {
  expect(unit.AddInformationButton.length).toBe(0);
  expect(unit.AddInformationSheet.length).toBe(0);
});
