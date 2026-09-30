import { expect, test } from "vitest";
import { labelFromDocument } from "./docLabel";

test("the first stated name wins, and a missing name stays blank", () => {
  expect(labelFromDocument({ "a:label": " Note " })).toBe("Note");
  expect(labelFromDocument({ label: "Plain" })).toBe("Plain");
  expect(labelFromDocument({ name: "Only name" })).toBe("Only name");
  expect(labelFromDocument({})).toBe("");
  expect(labelFromDocument(null)).toBe("");
});
