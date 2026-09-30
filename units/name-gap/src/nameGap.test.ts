import { describe, expect, it } from "vitest";
import { needsNameRecovery } from "./nameGap";

describe("needsNameRecovery", () => {
  it("is true when either name is missing or blank", () => {
    expect(needsNameRecovery({ given: "Ada", family: "Lovelace" })).toBe(false);
    expect(needsNameRecovery({ given: "Ada", family: "" })).toBe(true);
    expect(needsNameRecovery({ given: "Ada", family: "   " })).toBe(true);
    expect(needsNameRecovery({ given: null, family: "Lovelace" })).toBe(true);
    expect(needsNameRecovery({})).toBe(true);
    expect(needsNameRecovery({ given: "  Ada  ", family: "Lovelace" })).toBe(false);
    expect(needsNameRecovery({ given: 1, family: "Lovelace" })).toBe(true);
  });
});
