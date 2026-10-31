// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["SkillRows"]);
});
