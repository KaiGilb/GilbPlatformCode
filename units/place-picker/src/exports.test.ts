// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["PLACE_SEARCH_DEBOUNCE_MS", "PLACE_SEARCH_LIST_CHARS", "PLACE_SEARCH_MIN_CHARS", "PLACE_SEARCH_RESULT_CAP", "PlacePicker", "RUNG_LABEL"]);
});

it("the rung words are the address card's own: 'Region', not the display unit's 'Region/State'", () => {
  expect(unit.RUNG_LABEL).toEqual({ city: "City", region: "Region", country: "Country" });
  expect(Object.isFrozen(unit.RUNG_LABEL)).toBe(true);
});

it("the search constants are GilbApp's", () => {
  expect([unit.PLACE_SEARCH_DEBOUNCE_MS, unit.PLACE_SEARCH_MIN_CHARS, unit.PLACE_SEARCH_LIST_CHARS, unit.PLACE_SEARCH_RESULT_CAP]).toEqual([140, 1, 2, 8]);
});
