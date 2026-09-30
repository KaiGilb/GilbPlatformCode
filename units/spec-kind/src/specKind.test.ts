import { describe, expect, it } from "vitest";
import {
  SPEC_DELIVERY_STATES,
  SPEC_LEVELS,
  specCardConstraintOn,
  specCardKindOfTypeName,
  specCardKindOfTypeUri,
  specCardStoredType,
} from "./specKind";

describe("specCardStoredType", () => {
  it("ticks constraint only for the exact word yes", () => {
    expect(specCardStoredType("function", { constraint: "yes" })).toBe("FunctionConstraint");
    expect(specCardStoredType("function", { constraint: "Yes" })).toBe("Function");
    expect(specCardStoredType("solution", { constraint: " yes " })).toBe("Constraint");
    expect(specCardStoredType("solution", {})).toBe("Solution");
    expect(specCardStoredType("value", { constraint: "yes" })).toBe("Value");
  });
});

describe("spec card kind", () => {
  it("maps the four type names and rejects a different capitalisation", () => {
    expect(specCardKindOfTypeName("FunctionConstraint")).toBe("function");
    expect(specCardKindOfTypeName("Constraint")).toBe("solution");
    expect(specCardKindOfTypeName("function")).toBeNull();
    expect(specCardConstraintOn("Constraint")).toBe(true);
    expect(specCardConstraintOn("Solution")).toBe(false);
  });

  it("reads the last path segment or a t: name", () => {
    expect(specCardKindOfTypeUri("https://example.test/base/t/Function")).toBe("function");
    expect(specCardKindOfTypeUri("t:Value")).toBe("value");
    expect(specCardKindOfTypeUri(null)).toBeNull();
  });

  it("offers the form words and does not treat them as a check", () => {
    expect(SPEC_LEVELS).toContain("To-Do");
    expect(SPEC_DELIVERY_STATES).toContain("In-Production");
    expect(specCardStoredType("value", { level: "NotALevel" })).toBe("Value");
  });
});
