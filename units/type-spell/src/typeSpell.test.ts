import { describe, expect, it } from "vitest";
import { normalizeTypeUri } from "./typeSpell";

const abs = (name: string) => `https://types.example/base/t/${name}`;

describe("normalizeTypeUri", () => {
  it("does not call the builder for a missing or empty value", () => {
    const boom = () => {
      throw new Error("called");
    };
    expect(normalizeTypeUri(null, boom)).toBe("");
    expect(normalizeTypeUri(undefined, boom)).toBe("");
    expect(normalizeTypeUri("", boom)).toBe("");
    expect(normalizeTypeUri(1 as unknown as string, boom)).toBe("");
  });

  it("sends a bare name, a t: curie, and a base path to the builder", () => {
    expect(normalizeTypeUri("Task", abs)).toBe("https://types.example/base/t/Task");
    expect(normalizeTypeUri("t:Task", abs)).toBe("https://types.example/base/t/Task");
    expect(normalizeTypeUri("t:", abs)).toBe("https://types.example/base/t/");
    expect(normalizeTypeUri("https://other.example/base/t/Task", abs)).toBe(
      "https://types.example/base/t/Task",
    );
    expect(normalizeTypeUri("https://other.example/BASE/T/Task", abs)).toBe(
      "https://types.example/base/t/Task",
    );
  });

  it("decodes the path name once and keeps the first match", () => {
    expect(normalizeTypeUri("https://other.example/base/t/Caf%C3%A9", abs)).toBe(
      "https://types.example/base/t/Café",
    );
    expect(normalizeTypeUri("https://other.example/base/t/A/base/t/B", abs)).toBe(
      "https://types.example/base/t/A",
    );
    expect(normalizeTypeUri("https://other.example/base/t/Task?x=1#y", abs)).toBe(
      "https://types.example/base/t/Task",
    );
  });

  it("returns a foreign address unchanged and does not call the builder", () => {
    const boom = () => {
      throw new Error("called");
    };
    expect(normalizeTypeUri("https://schema.example/Task", boom)).toBe("https://schema.example/Task");
    expect(normalizeTypeUri("https://other.example/base/t/", boom)).toBe("https://other.example/base/t/");
  });

  it("does not treat an uppercase scheme as an address", () => {
    expect(normalizeTypeUri("HTTP://other.example/base/t/Task", abs)).toBe(
      "https://types.example/base/t/HTTP://other.example/base/t/Task",
    );
    expect(normalizeTypeUri("T:Task", abs)).toBe("https://types.example/base/t/T:Task");
  });

  it("throws on a broken percent-encoding and does not trim", () => {
    expect(() => normalizeTypeUri("https://other.example/base/t/%E0%A4%A", abs)).toThrow();
    expect(normalizeTypeUri("  Task", abs)).toBe("https://types.example/base/t/  Task");
  });
});
