// New. Pins the entry point: the five runtime exports of the source file, and its two types.
import { expect, it } from "vitest";
import * as unit from "./index";
import type { HeaderLayout, HeaderTier } from "./index";

it("exports exactly AVATAR_MENU, headerLayout, nameBudget and useElementWidth at run time", () => {
  expect(Object.keys(unit).sort()).toEqual(["AVATAR_MENU", "headerLayout", "nameBudget", "useElementWidth"]);
});
it("the two types are exported (compile-time) and fit the layouts the function returns", () => {
  const tier: HeaderTier = unit.headerLayout(300, "full").tier;
  const layout: HeaderLayout = unit.headerLayout(300, "full");
  expect(layout.tier).toBe(tier);
});
it("arities: headerLayout 2, nameBudget 3, useElementWidth 1", () => {
  expect(unit.headerLayout.length).toBe(2);
  expect(unit.nameBudget.length).toBe(3);
  expect(unit.useElementWidth.length).toBe(1);
});
