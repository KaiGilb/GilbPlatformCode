// New. Pins the entry point so an export added or dropped is a decision. `immediateParent` and `searchPlacesInCountry` of GilbApp are not here.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "GeoRowTooLargeError",
    "GeoUnavailableError",
    "MAX_MEMBER_OF_HOPS",
    "MAX_RESTRICTED_CANDIDATES",
    "RUNG_GRAIN",
    "RUNG_SEARCH_GRAINS",
    "__resetGeoCache",
    "__resetGeoGrainCache",
    "__resetGeoMemoryOnly",
    "getPlace",
    "peekPlace",
    "rankHitsForRung",
    "resolveAncestry",
    "resolveGeoGrains",
    "searchPlaceIds",
    "searchPlaces",
    "searchPlacesInCountryDetailed",
  ]);
});
it("the bounds of GilbApp", () => {
  expect(unit.MAX_MEMBER_OF_HOPS).toBe(5);
  expect(unit.MAX_RESTRICTED_CANDIDATES).toBe(24);
  expect(unit.RUNG_GRAIN).toEqual({ city: "settlement", region: "administrativeArea", country: "country" });
  expect(unit.RUNG_SEARCH_GRAINS).toEqual({ city: ["settlement", "administrativeArea"], region: ["administrativeArea"], country: ["country"] });
});
it("it does not hand out the catalogue's origin tests: those are `geo-origin`'s", () => {
  expect("isGeoEntityId" in unit).toBe(false);
  expect("GEO_ORIGIN" in unit).toBe(false);
  expect("immediateParent" in unit).toBe(false);
  expect("searchPlacesInCountry" in unit).toBe(false);
});
