import { describe, expect, it } from "vitest";
import {
  TAG_CARRIERS_DISPLAY,
  resolveUnitTag,
  resolveUnitTagCarriers,
} from "./tagCarrier";

describe("resolveUnitTagCarriers", () => {
  it("is empty only when neither field holds text", () => {
    expect(resolveUnitTagCarriers(null)).toEqual([]);
    expect(resolveUnitTagCarriers(undefined)).toEqual([]);
    expect(resolveUnitTagCarriers({})).toEqual([]);
    expect(resolveUnitTagCarriers({ unitTag: "   ", "a:ruleId": "" })).toEqual([]);
    expect(resolveUnitTagCarriers({ tag: "Quantify", rule: "Quantify" })).toEqual([]);
  });

  it("trims, prefers the bare spelling of one field, and does not block on an empty bare key", () => {
    expect(resolveUnitTagCarriers({ unitTag: "  Keep  " })).toEqual([
      { tag: "Keep", carrier: "unitTag" },
    ]);
    expect(resolveUnitTagCarriers({ unitTag: "", "a:unitTag": " FromRaw " })).toEqual([
      { tag: "FromRaw", carrier: "unitTag" },
    ]);
    expect(resolveUnitTagCarriers({ unitTag: 1, "a:unitTag": "Text" })).toEqual([
      { tag: "Text", carrier: "unitTag" },
    ]);
  });

  it("keeps both fields even when the text is the same, unitTag first", () => {
    expect(
      resolveUnitTagCarriers({
        "a:ruleId": "Same",
        unitTag: "Same",
      }),
    ).toEqual([
      { tag: "Same", carrier: "unitTag" },
      { tag: "Same", carrier: "ruleId" },
    ]);
  });

  it("does not treat the bare spelling and the a: spelling as two fields", () => {
    expect(
      resolveUnitTagCarriers({ unitTag: "Framed", "a:unitTag": "Raw" }),
    ).toEqual([{ tag: "Framed", carrier: "unitTag" }]);
  });
});

describe("resolveUnitTag", () => {
  it("returns only the first field, and null when the list is empty", () => {
    expect(resolveUnitTag({ ruleId: "OnlyRule" })).toEqual({
      tag: "OnlyRule",
      carrier: "ruleId",
    });
    expect(resolveUnitTag({ unitTag: "First", ruleId: "Second" })?.tag).toBe("First");
    expect(resolveUnitTag({})).toBeNull();
  });

  it("names both fields in the absence line, in the same order", () => {
    expect(TAG_CARRIERS_DISPLAY).toBe("a:unitTag or a:ruleId");
  });
});
