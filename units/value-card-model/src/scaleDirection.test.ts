/** A new Scale defaults to "Higher is better"; an old Scale with no stored direction stays "lower"; the direction is always written. */
import { describe, expect, it } from "vitest";
import { emptyValueCard, newLevelFromClick, readValueCard, scaleDirectionOf, scaleFacts } from "./planValue";
import type { ValueCardData, ValueLevel } from "./planValueModel";

const lv = (kind: string, value: number): ValueLevel => ({ kind, value, qualifier: { when: "", variables: {}, conditions: [], side: "" }, source: {}, note: "" });
// The Scale is written as the facts of its own record.
const stored = (d: ValueCardData) => scaleFacts(d.scale);

describe("Scale direction default", () => {
  it("a brand-new Value (no Scale) reads as higher, and the first write stores it", () => {
    const d = readValueCard({});
    expect(d.scale.direction).toBe("higher");
    expect(scaleDirectionOf(d)).toBe("higher");
    expect(scaleDirectionOf(emptyValueCard())).toBe("higher");
    expect(stored(d)).toBeNull();
    d.scale.unit = "min";
    expect(stored(d)!["a:scaleDirection"]).toBe("higher");
  });

  it("a Value whose Scale was never filled (older valueScale absent too) is higher", () => {
    expect(readValueCard({ "a:hasScale": null }).scale.direction).toBe("higher");
  });

  it("an old Scale with no direction key reads as lower, and the next write stores lower", () => {
    const d = readValueCard({ "a:hasScale": { "a:unit": "min", "a:description": "minutes" } });
    expect(d.scale.direction).toBe("lower");
    const s = stored(d)!;
    expect(s["a:scaleDirection"]).toBe("lower");
    expect(readValueCard({ "a:hasScale": s }).scale.direction).toBe("lower");
  });

  it("an old valueScale with no direction also reads as lower", () => {
    expect(readValueCard({ valueScale: { "a:unit": "min" } }).scale.direction).toBe("lower");
  });

  it("lower chosen on a new Value is stored, even before anything else is typed", () => {
    const d = readValueCard({});
    d.scale.direction = "lower";
    expect(stored(d)!["a:scaleDirection"]).toBe("lower");
    d.scale.unit = "min";
    expect(stored(d)!["a:scaleDirection"]).toBe("lower");
  });

  it("an explicit stored direction wins", () => {
    expect(readValueCard({ "a:hasScale": { "a:unit": "x", "a:scaleDirection": "higher" } }).scale.direction).toBe("higher");
    expect(readValueCard({ "a:hasScale": { "a:unit": "x", "a:scaleDirection": "target" } }).scale.direction).toBe("target");
  });
});

describe("newLevelFromClick", () => {
  const q = (when: string, variables: Record<string, string | string[]> = {}, side: "" | "low" | "high" = "") => ({ when, variables, conditions: ["c"], side });
  it("copies the choices of the most recent level, never its date; Status gets today", () => {
    const old = { ...lv("Goal", 3), qualifier: q("2026-01-01", { Country: "Norway" }) };
    const recent = { ...lv("Goal", 4), qualifier: q("2027-01-01", { Country: ["Sweden"] }) };
    const g = newLevelFromClick("Goal", [recent, old], "2026-10-27");
    expect(g.qualifier).toEqual({ when: "", variables: { Country: ["Sweden"] }, conditions: ["c"], side: "" });
    expect(newLevelFromClick("Status", [old, recent], "2026-10-27").qualifier.when).toBe("2026-10-27");
  });
  it("with no level it is ALL (no choices)", () => {
    expect(newLevelFromClick("Wish", [], "2026-10-27").qualifier).toEqual({ when: "", variables: {}, conditions: [], side: "" });
  });
});
