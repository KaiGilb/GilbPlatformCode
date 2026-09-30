import { expect, test } from "vitest";
import { levelsFromScaleDoc } from "./scaleDoc";

test("codes keep their order and an example fills the includes line", () => {
  const levels = levelsFromScaleDoc({
    "a:valueSet": ["A1", "A2", ""],
    "a:example": ["A1 — beginner", "A2"],
  });
  expect(levels).toEqual([
    { code: "A1", includes: "beginner" },
    { code: "A2", includes: "" },
  ]);
});

test("a missing set is an error, not an empty scale", () => {
  expect(() => levelsFromScaleDoc({})).toThrow(/value set/);
  expect(() => levelsFromScaleDoc({ "a:valueSet": [] })).toThrow(/empty/);
});
