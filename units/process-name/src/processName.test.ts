import { describe, expect, it } from "vitest";
import { processDisplayName } from "./processName";

describe("processDisplayName", () => {
  it("prefers a trimmed title, then a trimmed label", () => {
    expect(processDisplayName({ title: "  Hi  ", label: "No" })).toBe("Hi");
    expect(processDisplayName({ title: "   ", label: "  Lab  " })).toBe("Lab");
    expect(processDisplayName({ title: null, "a:title": "From raw" })).toBe("From raw");
    expect(processDisplayName({ label: "Lab" })).toBe("Lab");
  });

  it("returns the machine handle untrimmed, and blank when nothing names it", () => {
    expect(processDisplayName({ processName: "  proc  " })).toBe("  proc  ");
    expect(processDisplayName({ "process-name": "legacy" })).toBe("legacy");
    expect(processDisplayName({ processName: "", "process-name": "legacy" })).toBe("");
    expect(processDisplayName({ "a:processName": "not read" })).toBe("");
    expect(processDisplayName({ title: 1, label: false })).toBe("");
    expect(processDisplayName({})).toBe("");
  });
});
