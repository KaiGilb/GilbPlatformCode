// Every name the package index exports, and no other.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package index", () => {
  it("exports the four functions the level chooser's host serves, and the helpers they share", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["addProjectLevel", "ensureDefaultLevels", "planLevelsKey", "readAllLevels", "readLevelTree", "rememberLevels", "useAllLevels", "waitForLevels"].sort(),
    );
    for (const name of Object.keys(unit)) expect(typeof (unit as Record<string, unknown>)[name]).toBe("function");
  });
});
