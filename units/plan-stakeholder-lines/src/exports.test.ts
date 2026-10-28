import { describe, expect, it } from "vitest";
import * as unit from "./index";
import { StakeholderLinesHostContext } from "./host";

describe("what the unit exports", () => {
  it("is the two components and the host context, and nothing else at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(["PlanAuthority", "PlanStakeholders", "StakeholderLinesHostContext"]);
    expect(unit.PlanStakeholders).toBeTypeOf("function");
    expect(unit.PlanAuthority).toBeTypeOf("function");
    expect(unit.StakeholderLinesHostContext).toBe(StakeholderLinesHostContext);
  });

  it("has a context with no host by default", () => {
    expect((StakeholderLinesHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});
