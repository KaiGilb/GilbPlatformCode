// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(["PLAN_SOURCE_DOCUMENTS", "PLAN_SOURCE_PLACEHOLDER", "PlanSource", "PlanSourceHostContext"]);
    expect(unit.PLAN_SOURCE_PLACEHOLDER).toBe("Source");
    expect(unit.PLAN_SOURCE_DOCUMENTS).toBe("Documents");
    expect(typeof unit.PlanSource).toBe("function");
    expect(typeof unit.PlanSourceHostContext.Provider).toBe("object");
  });
});
