// @vitest-environment node
// New. Pins the entry point: the export list and the arities, so an export added or dropped is a decision and not an accident.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these twelve functions (the types are erased)", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "addedByCardOf",
    "cacheRowsOf",
    "createdInVaultKey",
    "createdInVaultOf",
    "findKnownRecordInCache",
    "rememberAddedByCard",
    "rememberCreatedIn",
    "useCachedRecord",
    "useKnownRecordDoor",
    "useKnownRecordInCache",
    "useRecord",
    "useRecordOnDemand",
  ]);
});
it("arities", () => {
  expect(unit.useRecord.length).toBe(2);
  expect(unit.useRecordOnDemand.length).toBe(2);
  expect(unit.useCachedRecord.length).toBe(2);
  expect(unit.useKnownRecordDoor.length).toBe(1);
  expect(unit.useKnownRecordInCache.length).toBe(1);
  expect(unit.findKnownRecordInCache.length).toBe(2);
  expect(unit.createdInVaultOf.length).toBe(2);
  expect(unit.createdInVaultKey.length).toBe(1);
  expect(unit.rememberCreatedIn.length).toBe(3);
  expect(unit.rememberAddedByCard.length).toBe(3);
  expect(unit.addedByCardOf.length).toBe(2);
  expect(unit.cacheRowsOf.length).toBe(1);
});
it("owns no fresh-create state: nothing named *FreshlyCreated is exported (that window is in plan-record-hooks)", () => {
  expect(Object.keys(unit).filter((k) => /reshlyCreated/.test(k))).toEqual([]);
});
