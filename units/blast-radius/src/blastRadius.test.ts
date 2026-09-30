import { describe, expect, it } from "vitest";
import { blastRadiusFromIndex } from "./blastRadius";
import type { BlastIndex } from "./blastRadius";

function index(partial: Partial<BlastIndex> = {}): BlastIndex {
  return {
    terms: partial.terms ?? {},
    children: partial.children ?? {},
    measures: partial.measures ?? {},
    valuesByFunction: partial.valuesByFunction ?? {},
    typesByFunction: partial.typesByFunction ?? {},
    capableOfByFunction: partial.capableOfByFunction ?? {},
  };
}

describe("blastRadiusFromIndex", () => {
  it("uses a different note for a missing index than for an empty one", () => {
    const missing = blastRadiusFromIndex("Focus", null);
    expect(missing.total).toBe(0);
    expect(missing.note).toBe("Hierarchy index unavailable \u2014 blast radius incomplete.");
    const empty = blastRadiusFromIndex("Focus", index());
    expect(empty.note).toBe(
      "No reverse dependents in the hierarchy index (live edges may still exist).",
    );
    expect(empty.note).not.toBe("No reverse dependents in the hierarchy index.");
  });

  it("keeps one value, caps capableOf at 80, and does not pluralise", () => {
    const capable = Array.from({ length: 81 }, (_, i) => `T${i}`);
    const result = blastRadiusFromIndex(
      "Cook",
      index({
        terms: {
          Cook: { k: "f", l: "" },
          Child: { k: "t", l: "The child" },
          Heat: { k: "v", l: "" },
          HeatAgain: { k: "v" },
        },
        children: { Cook: ["Child"] },
        measures: { Heat: "Cook", Other: "Bake" },
        valuesByFunction: { Cook: ["Heat", "HeatAgain"] },
        typesByFunction: { Cook: ["Oven"] },
        capableOfByFunction: { Cook: capable },
      }),
    );
    expect(result.focusName).toBe("Cook");
    expect(result.isAChildren).toEqual([
      { name: "Child", label: "The child", kind: "type", role: "is-a child" },
    ]);
    expect(result.valuesMeasuring.map((hit) => hit.name)).toEqual(["Heat", "HeatAgain"]);
    expect(result.valuesMeasuring[0]?.label).toBe("Heat");
    expect(result.typesProviding).toEqual([
      { name: "Oven", label: "Oven", kind: "type", role: "providesFunction" },
    ]);
    expect(result.typesCapable).toHaveLength(80);
    expect(result.typesCapable[0]?.role).toBe("capableOf");
    expect(result.total).toBe(1 + 2 + 1 + 80);
    expect(result.note).toBe(
      "1 is-a children \u00b7 2 values measure it \u00b7 1 types provide it \u00b7 80 types capableOf (capped display)",
    );
  });

  it("skips measuring values only when a non-function hint is passed", () => {
    const body = index({
      terms: { Cook: { k: "t" } },
      measures: { Heat: "Cook" },
      capableOfByFunction: { Cook: ["Person"] },
    });
    expect(blastRadiusFromIndex("Cook", body, "type").valuesMeasuring).toEqual([]);
    expect(blastRadiusFromIndex("Cook", body).valuesMeasuring.map((hit) => hit.name)).toEqual(["Heat"]);
    const few = blastRadiusFromIndex("Cook", body, "function");
    expect(few.typesCapable).toHaveLength(1);
    expect(few.note).toContain("capped display");
  });

  it("does not trim the focus name", () => {
    const result = blastRadiusFromIndex(" Cook", index({ children: { Cook: ["Child"] } }));
    expect(result.isAChildren).toEqual([]);
    expect(result.focusName).toBe(" Cook");
  });
});
