import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("names exactly what the README lists", () => {
    expect(Object.keys(unit)).toEqual(["PhoneValue"]);
    expect(typeof unit.PhoneValue).toBe("function");
  });
});
