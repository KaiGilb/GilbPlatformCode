import { describe, expect, it } from "vitest";
import * as unit from "./index";
import { DescriptionPartsHostContext } from "./host";

describe("what the unit exports", () => {
  it("is the view, the part-reads hook and note, the sentence, and the host context, and nothing else at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(["DescriptionPartsHostContext", "PARTIAL_LEVEL", "PlanDescriptionParts", "PlanFindLimitNote", "usePlanParts"]);
    expect(unit.PlanDescriptionParts).toBeTypeOf("function");
    expect(unit.usePlanParts).toBeTypeOf("function");
    expect(unit.PlanFindLimitNote).toBeTypeOf("function");
    expect(unit.PARTIAL_LEVEL).toBeTypeOf("string");
    expect(unit.DescriptionPartsHostContext).toBe(DescriptionPartsHostContext);
  });

  it("has a context with no host by default", () => {
    expect((DescriptionPartsHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});
