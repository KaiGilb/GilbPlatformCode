import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("what the unit exports", () => {
  it("is the eight components and nothing else", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["HelpExample", "HelpKeys", "HelpLayout", "HelpLink", "HelpList", "HelpNote", "HelpSection", "HelpSteps"],
    );
    for (const name of Object.keys(unit) as (keyof typeof unit)[]) expect(unit[name]).toBeTypeOf("function");
  });
});
