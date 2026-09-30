import { describe, expect, it } from "vitest";
import { normalizeLabel } from "./labelHyphen";

describe("normalizeLabel", () => {
  it("trims, lowers without a locale, and turns each whitespace run into one hyphen", () => {
    expect(normalizeLabel("  Depends On  ")).toBe("depends-on");
    expect(normalizeLabel("already-hyphen")).toBe("already-hyphen");
    expect(normalizeLabel("a- b")).toBe("a--b");
    expect(normalizeLabel("Depends On!")).toBe("depends-on!");
    expect(normalizeLabel("a\tb\nc")).toBe("a-b-c");
    expect(normalizeLabel("   ")).toBe("");
    expect(normalizeLabel("I")).toBe("i");
  });
});
