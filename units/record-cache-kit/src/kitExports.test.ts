import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is exactly the symbols the Plan card's cache users reach", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "PLAN_FIND_CAP",
        "PLAN_FIND_PAGE",
        "RECORDS_QUERY_HEAD",
        "RECORD_QUERY_HEAD",
        "STAKEHOLDER_SEARCH_AUTHORITY_KEY",
        "applyPatch",
        "applyPinsAndDrops",
        "dropPlanFind",
        "emptyPage",
        "ensureEtag",
        "ensureEtagUnchanged",
        "flattenRecordPages",
        "invalidatePlanFind",
        "invalidatePlanSearch",
        "isTempId",
        "liveRow",
        "loadPlanFind",
        "pageAttributeIds",
        "patchPlanFindRows",
        "planFindKey",
        "planFindRows",
        "planFindVaultKey",
        "planRecordKey",
        "planSearchKey",
        "prependPlanFind",
        "putRecordInCaches",
        "readCached",
        "reconcileAfterConflict",
        "recordsKey",
        "refreshRecordInCaches",
        "searchPlanRecords",
        "searchVaults",
        "setList",
        "setRecordReads",
        "storePlanRow",
        "upsert",
        "usePlanFind",
      ].sort(),
    );
  });
  it("the five cache helpers made public for the hooks batch are functions", () => {
    for (const name of ["flattenRecordPages", "emptyPage", "setList", "upsert", "setRecordReads"] as const) expect(typeof unit[name]).toBe("function");
  });
});
