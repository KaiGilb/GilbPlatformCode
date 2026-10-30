// New test: the unit's export list.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the export list", () => {
  it("is exactly PersonFieldRow", () => {
    expect(Object.keys(unit)).toEqual(["PersonFieldRow"]);
  });
});
