// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(["PlanImpacts", "PlanImpactsHostContext"]);
    expect(typeof unit.PlanImpacts).toBe("function");
    expect(typeof unit.PlanImpactsHostContext.Provider).toBe("object");
  });
});
