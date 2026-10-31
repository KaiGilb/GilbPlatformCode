// New. Pins the entry point so an export added or dropped is a decision. The write side of GilbApp's files is not here.
import { expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: vi.fn(), typeSpelling: vi.fn(), attributeLabel: vi.fn() }));
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "EMPTY_ADDRESS_MESSAGE",
    "PLACE_CLAIMS_STALE_MS",
    "PLACE_CLAIM_BOUND_RUNGS",
    "PLACE_FIELD_SLOTS",
    "PLACE_TEXT_SLOTS",
    "PlaceClaimError",
    "PlaceClaimsIncompleteError",
    "SHARED_ADDRESS_MESSAGE",
    "SharedAddressError",
    "addressIdOfEdge",
    "claimFieldText",
    "claimSubjectsOf",
    "claimsAbout",
    "fieldsByComposite",
    "isPartOfAddress",
    "listFieldClaimsDetailing",
    "listMyPlaceFieldClaims",
    "listPlaceClaimsInVault",
    "placeClaimHasContent",
    "placeClaimHeading",
    "placeClaimsKey",
    "placeFieldValuesOf",
    "readPlaceClaimsInVault",
    "subjectsBelongToAddress",
    "termOfTextSlot",
    "textSlotOfTerm",
    "toPlaceFieldClaim",
  ]);
});
it("no write function is exported", () => {
  for (const k of Object.keys(unit)) expect(k).not.toMatch(/^(create|update|remove|delete|patch|plan)|Facts$/);
});
