import { describe, expect, it } from "vitest";
import { conditionFieldKebab, conditionTitle } from "./conditionTitle";

describe("conditionTitle", () => {
  it("trims a string title, and an empty camel key blocks the stored spelling", () => {
    expect(conditionTitle({ title: "  Hello  " })).toBe("Hello");
    expect(conditionTitle({ title: "", "a:title": "stored" })).toBe("");
    expect(conditionTitle({ title: null, "a:title": " stored " })).toBe("stored");
    expect(conditionTitle({ "a:title": "only" })).toBe("only");
    expect(conditionTitle({ title: 1, "a:title": "stored" })).toBe("");
    expect(conditionTitle({})).toBe("");
    expect(conditionTitle({ title: "   " })).toBe("");
  });
});

describe("conditionFieldKebab", () => {
  it("maps the two list names and nothing else is in the type", () => {
    expect(conditionFieldKebab("entryCondition")).toBe("entry-condition");
    expect(conditionFieldKebab("exitCondition")).toBe("exit-condition");
  });
});
