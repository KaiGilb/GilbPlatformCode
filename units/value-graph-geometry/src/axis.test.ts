import { describe, expect, it } from "vitest";
import { buildAxis } from "./geometry";

describe("the axis stays at or above 0 without numeric levels", () => {
  it("empty axis starts at 0", () => {
    expect(buildAxis([], "higher", 0, 100).min).toBe(0);
    expect(buildAxis([], "lower", 0, 100).min).toBe(0);
  });
  it("ignores NaN and Infinity", () => {
    const a = buildAxis([NaN, Infinity], "higher", 0, 100);
    expect(a.min).toBe(0);
    expect(Number.isFinite(a.max)).toBe(true);
  });
});
