import { describe, expect, it } from "vitest";
import { ALL_VALUE, eq, packQualifierValues, qualifierValues } from "./index";

describe("eq", () => {
  it("compares trimmed and case-folded", () => {
    expect(eq(" a ", "A")).toBe(true);
    expect(eq("a", "b")).toBe(false);
    expect(eq("", "  ")).toBe(true);
  });
  it("does not fold inner spaces", () => {
    expect(eq("a b", "a  b")).toBe(false);
  });
});

describe("ALL_VALUE", () => {
  it("is the string ALL", () => {
    expect(ALL_VALUE).toBe("ALL");
  });
});

describe("qualifierValues", () => {
  it.each([[undefined], [null], [""], ["  "]])("%j -> []", (v) => {
    expect(qualifierValues(v as string | undefined | null)).toEqual([]);
  });
  it("trims one string", () => {
    expect(qualifierValues(" x ")).toEqual(["x"]);
  });
  it("trims an array and drops empty items", () => {
    expect(qualifierValues([" a ", "", " b"])).toEqual(["a", "b"]);
  });
  it("does not dedupe an array", () => {
    expect(qualifierValues(["a", "a"])).toEqual(["a", "a"]);
  });
  it("does not split a string on commas", () => {
    expect(qualifierValues("a, b")).toEqual(["a, b"]);
  });
  it("an empty array is []", () => {
    expect(qualifierValues([])).toEqual([]);
  });
});

describe("packQualifierValues", () => {
  it("none is an empty string", () => {
    expect(packQualifierValues([])).toBe("");
    expect(packQualifierValues(["  "])).toBe("");
    expect(packQualifierValues(["", " "])).toBe("");
  });
  it("one is a string", () => {
    expect(packQualifierValues(["x"])).toBe("x");
    expect(packQualifierValues([" x "])).toBe("x");
  });
  it("two or more are an array, trimmed, de-duplicated without regard to case (the first spelling stays)", () => {
    expect(packQualifierValues(["x", "X", " y "])).toEqual(["x", "y"]);
    expect(packQualifierValues(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
  it("a repeat of one value packs to a string", () => {
    expect(packQualifierValues(["x", "X"])).toBe("x");
  });
  it("ALL alone is ALL", () => {
    expect(packQualifierValues(["ALL"])).toBe("ALL");
  });
  it("ALL alone in any case packs to the exact string ALL", () => {
    expect(packQualifierValues(["all"])).toBe("ALL");
    expect(packQualifierValues([" All "])).toBe("ALL");
    expect(packQualifierValues(["all", "ALL"])).toBe("ALL");
  });
  it("ALL is dropped when other values exist", () => {
    expect(packQualifierValues(["all", "x"])).toBe("x");
    expect(packQualifierValues(["ALL", "x", "y"])).toEqual(["x", "y"]);
  });
  it("round-trips through qualifierValues", () => {
    expect(packQualifierValues(qualifierValues("x"))).toBe("x");
    expect(packQualifierValues(qualifierValues(["a", "b"]))).toEqual(["a", "b"]);
    expect(packQualifierValues(qualifierValues(undefined))).toBe("");
  });
});
