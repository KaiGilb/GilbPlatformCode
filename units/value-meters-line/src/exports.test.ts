// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are the Meters line, and it is a component", () => {
    expect(Object.keys(unit)).toEqual(["PlanValueMetersBody"]);
    expect(typeof unit.PlanValueMetersBody).toBe("function");
  });
});
