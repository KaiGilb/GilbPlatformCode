import { describe, expect, it } from "vitest";
import {
  conditionUnitTag,
  conditionUnitTagCarrier,
  invertConditionTagCarriers,
} from "./conditionTag";

describe("conditionUnitTag", () => {
  it("returns the framed text with its spaces, and skips a blank framed value", () => {
    expect(conditionUnitTag({ unitTag: "  Keep  " })).toBe("  Keep  ");
    expect(conditionUnitTag({ unitTag: "   ", "a:unitTag": " Raw " })).toBe(" Raw ");
    expect(conditionUnitTag({ unitTag: "", "a:unitTag": "Raw" })).toBe("Raw");
  });

  it("reads a bare tag only when op is exactly manual", () => {
    expect(conditionUnitTag({ op: "manual", tag: "  Legacy  " })).toBe("  Legacy  ");
    expect(conditionUnitTag({ op: "Manual", tag: "Legacy" })).toBeUndefined();
    expect(conditionUnitTag({ tag: "Legacy" })).toBeUndefined();
    expect(conditionUnitTag({ op: "manual", tag: "   " })).toBeUndefined();
    expect(conditionUnitTag({ op: "manual", tag: 4 })).toBeUndefined();
  });

  it("does not read ruleId", () => {
    expect(conditionUnitTag({ ruleId: "No", "a:ruleId": "No" })).toBeUndefined();
  });
});

describe("conditionUnitTagCarrier", () => {
  it("never treats a bare tag as assigned", () => {
    expect(conditionUnitTagCarrier({ op: "manual", tag: "Legacy" })).toBeUndefined();
    expect(conditionUnitTagCarrier({ unitTag: " Assigned " })).toBe(" Assigned ");
  });
});

describe("invertConditionTagCarriers", () => {
  it("moves framed keys onto the stored names and leaves the input alone", () => {
    const input = { unitTag: "A", tagScope: "KaiZen", tag: "bare", other: 1 };
    const out = invertConditionTagCarriers(input);
    expect(out).toEqual({ "a:unitTag": "A", "a:tagScope": "KaiZen", tag: "bare", other: 1 });
    expect(out).not.toBe(input);
    expect(input).toEqual({ unitTag: "A", tagScope: "KaiZen", tag: "bare", other: 1 });
  });

  it("lets the framed value replace a stored value that was also present", () => {
    expect(invertConditionTagCarriers({ unitTag: "New", "a:unitTag": "Old" })).toEqual({
      "a:unitTag": "New",
    });
  });
});
