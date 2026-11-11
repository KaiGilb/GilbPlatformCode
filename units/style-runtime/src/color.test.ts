import { describe, expect, it } from "vitest";
import { contrastRatio, ensureContrast, meetsAA, parseColor, toHex } from "./color";

describe("color", () => {
  it("contrast ratios", () => {
    expect(Math.abs(contrastRatio("#000", "#fff") - 21)).toBeLessThan(0.01);
    expect(Math.abs(contrastRatio("#777", "#fff") - 4.48)).toBeLessThan(0.01);
  });
  it("parse and hex round trip", () => {
    const o = parseColor("#336699");
    expect(o).not.toBeNull();
    expect(toHex(o!)).toBe("#336699");
    expect(parseColor("nope")).toBeNull();
  });
  it("meetsAA", () => {
    expect(meetsAA("#777", "#fff")).toBe(false);
    expect(meetsAA("#777", "#fff", { large: true })).toBe(true);
  });
  it("ensureContrast reaches the target in both directions", () => {
    for (const [fg, bg, t] of [["#888888", "#ffffff", 4.5], ["#777777", "#101010", 7], ["#ffee00", "#ffffff", 3], ["#112233", "#151719", 4.5]] as const) {
      const out = ensureContrast(fg, bg, t);
      expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(t);
    }
  });
  it("leaves an already passing colour alone", () => {
    expect(ensureContrast("#000000", "#ffffff", 4.5)).toBe("#000000");
  });
});
