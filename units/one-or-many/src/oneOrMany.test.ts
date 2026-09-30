import { describe, expect, it } from "vitest";
import { asOneOrMany } from "./oneOrMany";

describe("asOneOrMany", () => {
  it("turns null and undefined into an empty list", () => {
    expect(asOneOrMany(null)).toEqual([]);
    expect(asOneOrMany(undefined)).toEqual([]);
  });

  it("wraps one object and returns an array unchanged, same reference", () => {
    const one = { text: "only" };
    expect(asOneOrMany(one)).toEqual([one]);
    const many = [one, { text: "two" }];
    expect(asOneOrMany(many)).toBe(many);
  });

  it("does not flatten, and wraps a string because a string is not a list", () => {
    expect(asOneOrMany([["inner"]])).toEqual([["inner"]]);
    expect(asOneOrMany("hello")).toEqual(["hello"]);
  });
});
