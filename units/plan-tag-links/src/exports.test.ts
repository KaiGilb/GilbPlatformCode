// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "PlanFunctionOfValue",
        "PlanPartOf",
        "PlanPartOfSystem",
        "PlanSolutionOf",
        "PlanSolutions",
        "PlanSubFunctions",
        "PlanTagLinksHostContext",
        "PlanValueOfFunction",
      ].sort(),
    );
    for (const name of ["PlanFunctionOfValue", "PlanPartOf", "PlanPartOfSystem", "PlanSolutionOf", "PlanSolutions", "PlanSubFunctions", "PlanValueOfFunction"] as const) {
      expect(typeof unit[name], name).toBe("function");
    }
    expect(typeof unit.PlanTagLinksHostContext.Provider).toBe("object");
  });
});
