import { describe, expect, it } from "vitest";
import { narrowTotal } from "./narrowTotal";

describe("narrowTotal", () => {
  it("returns kept when the server sent no number, and does not subtract twice", () => {
    expect(narrowTotal(undefined, 3, 1)).toBe(1);
    expect(narrowTotal(undefined, 20, 5)).toBe(5);
  });

  it("subtracts only the rows this page dropped, and does not go below zero", () => {
    expect(narrowTotal(100, 20, 15)).toBe(95);
    expect(narrowTotal(3, 3, 1)).toBe(1);
    expect(narrowTotal(0, 1, 0)).toBe(0);
    expect(narrowTotal(42, 20, 20)).toBe(42);
    expect(narrowTotal(1, 0, 5)).toBe(6);
  });

  it("does not treat NaN as a missing total", () => {
    expect(Number.isNaN(narrowTotal(Number.NaN, 3, 1))).toBe(true);
  });
});
