// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["ENTITY_ADDRESS", "FLAG_SHORT_LIST_MAX", "countryNameFromCode", "flagChoices", "flagDataUrl", "flagFileId", "viewerFlagCountry"]);
});
it("arities", () => {
  expect(unit.flagFileId.length).toBe(1);
  expect(unit.flagChoices.length).toBe(1);
  expect(unit.viewerFlagCountry.length).toBe(1);
});
