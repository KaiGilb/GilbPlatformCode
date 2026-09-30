import { describe, expect, it } from "vitest";
import { valueSummarySync } from "./historyValue";

describe("valueSummarySync", () => {
  it("names absence, booleans, numbers, and empty lists without fetching", () => {
    expect(valueSummarySync(null)).toBe("∅");
    expect(valueSummarySync(undefined)).toBe("∅");
    expect(valueSummarySync(false)).toBe("false");
    expect(valueSummarySync(0)).toBe("0");
    expect(valueSummarySync([])).toBe("[]");
    expect(valueSummarySync([null])).toBe("∅");
    expect(valueSummarySync([1, 2])).toBe("[2 items]");
    expect(valueSummarySync("null")).toBe("null");
    expect(valueSummarySync("   ")).toBe("");
  });

  it("prefers a type address over an entity address, and does not decode the entity id", () => {
    expect(valueSummarySync("http://example.test/base/t/A%20B")).toBe("A B");
    expect(valueSummarySync("http://example.test/base/t/Foo/base/e/bar")).toBe("Foo");
    expect(valueSummarySync("http://example.test/base/e/a%20b")).toBe("entity:a%20b");
    expect(valueSummarySync("http://example.test/base/e/")).toBe("http://example.test/base/e/");
    expect(valueSummarySync("HTTP://example.test/base/e/a")).toBe("HTTP://example.test/base/e/a");
    expect(valueSummarySync("base:e/abc")).toBe("entity:abc");
    expect(valueSummarySync("base:t/Foo")).toBe("Foo");
  });

  it("uses a label for the opaque id before the full address, and ignores labels for base:e", () => {
    const labels = new Map<string, string>([
      ["abc", ""],
      ["http://example.test/base/e/abc", "ignored"],
    ]);
    expect(valueSummarySync("http://example.test/base/e/abc", labels)).toBe("");
    const byAddress = new Map<string, string>([["http://example.test/base/e/abc", "The name"]]);
    expect(valueSummarySync("  http://example.test/base/e/abc  ", byAddress)).toBe("The name");
    expect(valueSummarySync("base:e/abc", byAddress)).toBe("entity:abc");
  });

  it("clips a long string at 160 and a long object at 120", () => {
    expect(valueSummarySync("a".repeat(160))).toBe("a".repeat(160));
    expect(valueSummarySync("a".repeat(161))).toBe(`${"a".repeat(157)}…`);
    const wide = { text: "b".repeat(200) };
    const raw = JSON.stringify(wide);
    expect(raw.length).toBeGreaterThan(120);
    expect(valueSummarySync(wide)).toBe(`${raw.slice(0, 117)}…`);
    expect(valueSummarySync({ a: 1 })).toBe('{"a":1}');
  });

  it("reads @id and returns the ellipsis when the value cannot be printed", () => {
    expect(valueSummarySync({ "@id": "base:t/Foo" })).toBe("Foo");
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(valueSummarySync(circular)).toBe("…");
  });

  it("keeps a broken percent-encoding instead of throwing", () => {
    expect(valueSummarySync("http://example.test/base/t/%E0%A4")).toBe("%E0%A4");
  });
});
