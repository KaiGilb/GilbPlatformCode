import { describe, expect, it } from "vitest";
import { kindFromNodeKind, optionMatchesPlane } from "./createKind";

describe("kindFromNodeKind", () => {
  it("treats empty as a thing and folds case", () => {
    expect(kindFromNodeKind(null)).toBe("type");
    expect(kindFromNodeKind(undefined)).toBe("type");
    expect(kindFromNodeKind("")).toBe("type");
    expect(kindFromNodeKind(" entity ")).toBe("type");
    expect(kindFromNodeKind(" FUNCTION ")).toBe("function");
    expect(kindFromNodeKind("Value")).toBe("value");
  });

  it("drops relation, attribute, and scale, and keeps a near miss", () => {
    expect(kindFromNodeKind("relation")).toBeNull();
    expect(kindFromNodeKind(" Attribute ")).toBeNull();
    expect(kindFromNodeKind("scale")).toBeNull();
    expect(kindFromNodeKind("relations")).toBe("type");
  });
});

describe("optionMatchesPlane", () => {
  it("filters by the open list", () => {
    expect(optionMatchesPlane("type", "all")).toBe(true);
    expect(optionMatchesPlane("function", "all")).toBe(true);
    expect(optionMatchesPlane("type", "things")).toBe(true);
    expect(optionMatchesPlane("function", "things")).toBe(false);
    expect(optionMatchesPlane("function", "function")).toBe(true);
    expect(optionMatchesPlane("value", "function")).toBe(false);
    expect(optionMatchesPlane("value", "value")).toBe(true);
  });
});
