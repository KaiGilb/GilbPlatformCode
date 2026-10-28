import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("what the unit exports", () => {
  it("is the component and the three constants, and nothing else", () => {
    expect(Object.keys(unit).sort()).toEqual(["DESCRIPTION_HELP_SECTIONS", "DescriptionHelp", "PASTE_HELP_EXAMPLE", "PASTE_HELP_EXAMPLE_FUNCTION"]);
    expect(unit.DescriptionHelp).toBeTypeOf("function");
    expect(Array.isArray(unit.DESCRIPTION_HELP_SECTIONS)).toBe(true);
    expect(unit.PASTE_HELP_EXAMPLE).toBeTypeOf("string");
    expect(unit.PASTE_HELP_EXAMPLE_FUNCTION).toBeTypeOf("string");
  });
});
