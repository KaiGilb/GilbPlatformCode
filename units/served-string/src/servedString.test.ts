import { describe, expect, it } from "vitest";
import { documentAppliesTo, servedString } from "./servedString";

describe("servedString", () => {
  it("returns undefined for a missing, non-string, or blank value", () => {
    expect(servedString({}, "label")).toBeUndefined();
    expect(servedString({ label: 1 }, "label")).toBeUndefined();
    expect(servedString({ label: "  " }, "label")).toBeUndefined();
    expect(servedString({ label: "" }, "label")).toBeUndefined();
  });

  it("keeps surrounding spaces on a real value", () => {
    expect(servedString({ label: "  Cat  " }, "label")).toBe("  Cat  ");
  });
});

describe("documentAppliesTo", () => {
  it("prefers the framed key and trims", () => {
    expect(documentAppliesTo({ appliesTo: "  keep  ", "a:appliesTo": "other" })).toBe("keep");
    expect(documentAppliesTo({ "a:appliesTo": " raw " })).toBe("raw");
  });

  it("falls through a blank framed value", () => {
    expect(documentAppliesTo({ appliesTo: "  ", "a:appliesTo": "raw" })).toBe("raw");
    expect(documentAppliesTo({})).toBeUndefined();
  });
});
