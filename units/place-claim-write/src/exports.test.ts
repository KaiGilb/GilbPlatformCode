// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: vi.fn(), typeSpelling: vi.fn(), attributeLabel: vi.fn() }));
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "DIRECT_READER",
    "GRANT_PLANE_ATTRIBUTES",
    "GeoWriteRefusedError",
    "OLDER_SHAPE_MESSAGE",
    "PlaceClaimPartialError",
    "PlaceClaimRefusal",
    "PlaceFieldClaimError",
    "REMOVE_NOT_WHOLE_MESSAGE",
    "assertNoGrantPlane",
    "compositeEntityUri",
    "createPlaceClaim",
    "createPlaceFieldClaim",
    "fieldSpecs",
    "placeClaimFacts",
    "placeClaimLabelPatch",
    "placeFieldClaimFacts",
    "planFieldWrites",
    "removePlaceClaim",
    "removePlaceFieldClaim",
    "slotsForFields",
    "updatePlaceClaim",
    "updatePlaceFieldClaim",
  ]);
});
