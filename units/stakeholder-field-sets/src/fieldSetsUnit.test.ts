import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is exactly the three functions of fieldSets.ts", () => {
    expect(Object.keys(unit).sort()).toEqual(["deriveFieldSets", "readPartyName", "resolveFieldSets"]);
    expect(typeof unit.deriveFieldSets).toBe("function");
    expect(typeof unit.resolveFieldSets).toBe("function");
    expect(typeof unit.readPartyName).toBe("function");
  });
});
