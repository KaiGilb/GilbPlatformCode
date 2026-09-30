import { describe, expect, it } from "vitest";
import { isFactStringFaithful } from "./factFaithful";

describe("isFactStringFaithful", () => {
  it("accepts empty, scalars, and an empty list", () => {
    expect(isFactStringFaithful(null)).toBe(true);
    expect(isFactStringFaithful(undefined)).toBe(true);
    expect(isFactStringFaithful("")).toBe(true);
    expect(isFactStringFaithful(0)).toBe(true);
    expect(isFactStringFaithful(false)).toBe(true);
    expect(isFactStringFaithful([])).toBe(true);
    expect(isFactStringFaithful(["a", "b"])).toBe(true);
  });

  it("accepts an edge and rejects an object or a mixed list", () => {
    expect(isFactStringFaithful({ "@id": "" })).toBe(true);
    expect(isFactStringFaithful({})).toBe(false);
    expect(isFactStringFaithful(new Date(0))).toBe(false);
    expect(isFactStringFaithful(["a", { x: 1 }])).toBe(false);
    expect(isFactStringFaithful([{ "@id": "h.example/e/1" }, "a"])).toBe(true);
  });

  it("accepts a function", () => {
    expect(isFactStringFaithful(() => 1)).toBe(true);
  });
});
