// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are the Endpoint line and the function that reads the older text, and both are functions", () => {
    expect(Object.keys(unit).sort()).toEqual(["PlanEndpointBody", "parseEndpointText"]);
    expect(typeof unit.PlanEndpointBody).toBe("function");
    expect(typeof unit.parseEndpointText).toBe("function");
  });
});
