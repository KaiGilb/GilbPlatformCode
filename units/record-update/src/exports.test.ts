// @vitest-environment node
// New. Pins the entry point: the export list and the arities, so an export added or dropped is a decision and not an accident.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these (the types are erased)", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "CARRIER_ONLY_SLUGS",
    "CARRIER_PRESERVE_SLUGS",
    "CarrierRenameRefusedError",
    "OWN_SAVE_WAIT_MS",
    "RECORD_UPDATE_KEY",
    "TAG_CARRIER_SLUGS",
    "TAG_QUALIFIER_SLUGS",
    "factsAfterPatch",
    "latestCachedRecord",
    "rebaseOnStored",
    "recordSavesSettled",
    "useUpdateRecord",
  ]);
});
it("arities", () => {
  expect(unit.useUpdateRecord.length).toBe(1);
  expect(unit.factsAfterPatch.length).toBe(2);
  expect(unit.latestCachedRecord.length).toBe(3);
  expect(unit.rebaseOnStored.length).toBe(3);
  // The wait has a default, so its declared arity counts the two before it.
  expect(unit.recordSavesSettled.length).toBe(2);
});
it("private helpers stay private: the sweep's rule and the cache's facts are not exported", () => {
  const names = Object.keys(unit);
  expect(names).not.toContain("sweepMayRetract");
  expect(names).not.toContain("savedFacts");
});
it("owns no fresh-create state and no record read (those are plan-record-hooks and record-detail-reads)", () => {
  expect(Object.keys(unit).filter((k) => /reshlyCreated|^useRecord$|findKnownRecordInCache/.test(k))).toEqual([]);
});
