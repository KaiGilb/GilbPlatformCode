// @vitest-environment node
// New (0.1.1). `expandRelationRef` was a private file of this unit; it is now exported from the entry point so that `stated-by` imports it.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

const DOC = "https://v.example.test/base/r/rel1";

describe("expandRelationRef (exported since 0.1.1)", () => {
  it("is exported from the entry point", () => {
    expect(typeof unit.expandRelationRef).toBe("function");
    expect(unit.expandRelationRef.length).toBe(2);
  });
  it("expands a compact base: reference against the document's own prefix, as a string, a reference or a one-element list", () => {
    expect(unit.expandRelationRef("base:e/x", DOC)).toBe("https://v.example.test/base/e/x");
    expect(unit.expandRelationRef({ "@id": "base:e/x" }, DOC)).toBe("https://v.example.test/base/e/x");
    expect(unit.expandRelationRef([{ "@id": "base:e/x" }], DOC)).toBe("https://v.example.test/base/e/x");
  });
  it("an absolute reference is kept; an unresolvable one is null", () => {
    expect(unit.expandRelationRef("https://o.example.test/base/e/y", DOC)).toBe("https://o.example.test/base/e/y");
    expect(unit.expandRelationRef("urn:x:1", DOC)).toBe("urn:x:1");
    expect(unit.expandRelationRef("base:e/x", "not-a-doc")).toBeNull();
    expect(unit.expandRelationRef("other:e/x", DOC)).toBeNull();
    expect(unit.expandRelationRef(42, DOC)).toBeNull();
    expect(unit.expandRelationRef({ "@id": 1 }, DOC)).toBeNull();
  });
});
