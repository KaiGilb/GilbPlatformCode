import { describe, expect, test } from "vitest";
import { sameValue } from "./sameValue";

describe("sameValue", () => {
  test("objects are equal in any key order", () => {
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
  });
  test("arrays are compared by position", () => {
    expect(sameValue([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameValue([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
    expect(sameValue([], {})).toBe(false);
  });
  test("nested values are compared by value", () => {
    expect(sameValue({ a: [{ x: 1, y: 2 }] }, { a: [{ y: 2, x: 1 }] })).toBe(true);
    expect(sameValue({ a: [{ x: 1 }] }, { a: [{ x: 2 }] })).toBe(false);
  });
  test("null and undefined differ", () => {
    expect(sameValue(null, undefined)).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue({ a: null }, { a: undefined })).toBe(false);
  });
  test("a number and a string differ", () => {
    expect(sameValue(1, "1")).toBe(false);
    expect(sameValue("1", "1")).toBe(true);
    expect(sameValue(NaN, NaN)).toBe(true);
  });
});
