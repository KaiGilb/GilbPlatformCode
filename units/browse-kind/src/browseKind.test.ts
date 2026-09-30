import { describe, expect, it } from "vitest";
import { kindBadge, kindFromRaw } from "./browseKind";

describe("kindFromRaw", () => {
  it("reads node kind first and folds it", () => {
    expect(kindFromRaw({ "a:nodeKind": " Function " })).toBe("function");
    expect(kindFromRaw({ "a:nodeKind": "   ", nodeKind: "value" })).toBe("value");
    expect(kindFromRaw({ "a:nodeKind": "relation" })).toBe("type");
    expect(kindFromRaw({})).toBe("type");
  });

  it("reads @type only as an exact function or value", () => {
    expect(kindFromRaw({ "@type": "t:Function" })).toBe("function");
    expect(kindFromRaw({ "@type": "https://h.example/base/t/Value" })).toBe("value");
    expect(kindFromRaw({ "@type": "T:Function" })).toBe("type");
    expect(kindFromRaw({ "@type": "https://h.example/base/t/Function/" })).toBe("type");
    expect(kindFromRaw({ "@type": ["nope", "t:Value"] })).toBe("value");
    expect(kindFromRaw({ "a:nodeKind": "function", "@type": "t:Value" })).toBe("function");
  });
});

describe("kindBadge", () => {
  it("uses the three words", () => {
    expect(kindBadge("function")).toBe("FUNCTION");
    expect(kindBadge("value")).toBe("VALUE");
    expect(kindBadge("type")).toBe("TYPE");
  });
});
