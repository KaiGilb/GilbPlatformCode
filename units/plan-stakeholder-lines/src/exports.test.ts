import { describe, expect, it } from "vitest";
import * as unit from "./index";
import { StakeholderLinesHostContext } from "./host";

describe("what the unit exports", () => {
  it("is the two components, the host context and `vaultNamespaceOfEntityUri`, and nothing else at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(["PlanAuthority", "PlanStakeholders", "StakeholderLinesHostContext", "vaultNamespaceOfEntityUri"]);
    expect(unit.PlanStakeholders).toBeTypeOf("function");
    expect(unit.PlanAuthority).toBeTypeOf("function");
    expect(unit.StakeholderLinesHostContext).toBe(StakeholderLinesHostContext);
    expect(unit.vaultNamespaceOfEntityUri("https://h.example.test/vault/e/abc")).toBe("https://h.example.test/vault");
  });

  it("has a context with no host by default", () => {
    expect((StakeholderLinesHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});
