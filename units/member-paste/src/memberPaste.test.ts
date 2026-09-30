import { describe, expect, it } from "vitest";
import { parseMemberInputs } from "./memberPaste";

describe("parseMemberInputs", () => {
  it("splits on comma without a space, and on semicolon and whitespace", () => {
    expect(parseMemberInputs("a,b; c\nd")).toEqual(["a", "b", "c", "d"]);
    expect(parseMemberInputs("  a,, ; b  ")).toEqual(["a", "b"]);
    expect(parseMemberInputs("")).toEqual([]);
  });

  it("keeps the first spelling and does not treat other punctuation as a split", () => {
    expect(parseMemberInputs("Ada ada ADA")).toEqual(["Ada"]);
    expect(parseMemberInputs("one.two")).toEqual(["one.two"]);
  });
});
