import { describe, expect, it } from "vitest";
import { stringsFromOneOrMany } from "./stringList";

describe("stringsFromOneOrMany", () => {
  it("wraps one string and drops a blank", () => {
    expect(stringsFromOneOrMany("https://example.test/base/e/a")).toEqual(["https://example.test/base/e/a"]);
    expect(stringsFromOneOrMany("  ")).toEqual([]);
    expect(stringsFromOneOrMany("")).toEqual([]);
  });

  it("keeps order, drops non-strings and blanks, and does not trim a kept value", () => {
    expect(stringsFromOneOrMany([" a ", "", "  ", 1, null, "b"])).toEqual([" a ", "b"]);
  });

  it("is an empty list for null, a number, and an object", () => {
    expect(stringsFromOneOrMany(null)).toEqual([]);
    expect(stringsFromOneOrMany(undefined)).toEqual([]);
    expect(stringsFromOneOrMany(3)).toEqual([]);
    expect(stringsFromOneOrMany({ "@id": "x" })).toEqual([]);
  });
});
