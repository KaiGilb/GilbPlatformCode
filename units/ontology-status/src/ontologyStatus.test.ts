import { describe, expect, it } from "vitest";
import { normalizeOntologyStatus } from "./ontologyStatus";

describe("normalizeOntologyStatus", () => {
  it("maps the three write words and never emits retired", () => {
    expect(normalizeOntologyStatus(null)).toBe("Suggested");
    expect(normalizeOntologyStatus(undefined)).toBe("Suggested");
    expect(normalizeOntologyStatus("")).toBe("Suggested");
    expect(normalizeOntologyStatus("  ")).toBe("Suggested");
    expect(normalizeOntologyStatus("suggested")).toBe("Suggested");
    expect(normalizeOntologyStatus("nope")).toBe("Suggested");
    expect(normalizeOntologyStatus("approve")).toBe("Suggested");
    expect(normalizeOntologyStatus(" Approved ")).toBe("Approved");
    expect(normalizeOntologyStatus("RETIRED")).toBe("Deprecated");
    expect(normalizeOntologyStatus("deprecated")).toBe("Deprecated");
    expect(normalizeOntologyStatus("withdrawn")).toBe("Deprecated");
  });
});
