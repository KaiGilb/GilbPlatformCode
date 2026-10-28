// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "PlanTagPicker",
        "PlanTagPickerHostContext",
        "SEARCH_ERROR",
        "SEARCH_INCOMPLETE_CREATE",
        "TagLink",
        "chosenRow",
        "httpStatus",
        "noticeFor",
        "planSearchKey",
        "rowOnHit",
        "tagShaped",
        "usePlanPickerFind",
      ].sort(),
    );
    expect(unit.SEARCH_ERROR).toBe("Could not search — try again");
    expect(unit.SEARCH_INCOMPLETE_CREATE).toBe("Not every record could be searched, so Create is not offered. Try again.");
    expect(typeof unit.PlanTagPickerHostContext.Provider).toBe("object");
    for (const name of ["PlanTagPicker", "TagLink", "chosenRow", "httpStatus", "noticeFor", "planSearchKey", "rowOnHit", "tagShaped", "usePlanPickerFind"] as const) {
      expect(typeof unit[name], name).toBe("function");
    }
  });
});
