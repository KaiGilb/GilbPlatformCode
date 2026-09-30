import { describe, expect, it } from "vitest";
import { wireKeyFor } from "./wireKey";

describe("wireKeyFor", () => {
  it("strips one leading a: and nothing else", () => {
    expect(wireKeyFor("a:label")).toBe("label");
    expect(wireKeyFor("a:a:label")).toBe("a:label");
    expect(wireKeyFor("a:")).toBe("");
    expect(wireKeyFor("label")).toBe("label");
    expect(wireKeyFor("role:source")).toBe("role:source");
    expect(wireKeyFor("A:label")).toBe("A:label");
    expect(wireKeyFor(" a:label")).toBe(" a:label");
    expect(wireKeyFor("https://h.example/base/a/label")).toBe("https://h.example/base/a/label");
  });
});
