// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "MAX_CONTAINER_HOPS",
    "MAX_FRESH_PARENT_READS",
    "PARENT_ROW_CEILING_BYTES",
    "PlaceHitMeta",
    "describePlaceHits",
    "placeHitLine",
    "usePlaceHitDetails",
  ]);
});
it("the bounds of GilbApp", () => {
  expect(unit.MAX_CONTAINER_HOPS).toBe(2);
  expect(unit.MAX_FRESH_PARENT_READS).toBe(3);
  expect(unit.PARENT_ROW_CEILING_BYTES).toBe(4 * 1024 * 1024);
});
