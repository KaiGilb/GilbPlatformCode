import { describe, expect, it } from "vitest";
import { checkedStandards } from "./citedStandard";

describe("checkedStandards", () => {
  it("reads one string and a list, and does not trim the kept text", () => {
    expect(checkedStandards({ checksStandard: "  a  " })).toEqual(["  a  "]);
    expect(checkedStandards({ checksStandard: "   " })).toEqual([]);
    expect(checkedStandards({ checksStandard: ["a", "  ", "b", 1, ["c"]] })).toEqual(["a", "b"]);
  });

  it("does not read a raw key, and a missing field is an empty list", () => {
    expect(checkedStandards({})).toEqual([]);
    expect(checkedStandards({ checksStandard: null })).toEqual([]);
    expect(checkedStandards({ "a:checksStandard": "Rule" } as { checksStandard?: unknown })).toEqual(
      [],
    );
  });
});
