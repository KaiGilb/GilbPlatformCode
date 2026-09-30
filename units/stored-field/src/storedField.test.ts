import { describe, expect, it } from "vitest";
import { storedProcessName, wireField } from "./storedField";

describe("wireField", () => {
  it("prefers camelCase, including an empty string, and skips null", () => {
    expect(wireField({ title: "A", "a:title": "B" }, "title", "a:title")).toBe("A");
    expect(wireField({ title: "", "a:title": "B" }, "title", "a:title")).toBe("");
    expect(wireField({ title: null, "a:title": "B" }, "title", "a:title")).toBe("B");
    expect(wireField({}, "title", "a:title")).toBeUndefined();
    expect(wireField({ count: 0 }, "count", "count-legacy")).toBe(0);
  });
});

describe("storedProcessName", () => {
  it("uses title, then label, then the machine handle, and never the id", () => {
    expect(storedProcessName({ title: "  Title  ", label: "Label" })).toBe("Title");
    expect(storedProcessName({ title: "", "a:title": "Hidden", label: " Label " })).toBe("Label");
    expect(storedProcessName({ "a:title": " From raw " })).toBe("From raw");
    expect(storedProcessName({ processName: "  Proc  " })).toBe("  Proc  ");
    expect(storedProcessName({ "process-name": "Proc" })).toBe("Proc");
    expect(storedProcessName({ "@id": "https://example.test/base/e/proc-x" })).toBe("");
  });
});
