// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "ADD_LEVEL",
        "DEFAULT_LEVELS",
        "NOT_A_PROJECT_LEVEL",
        "ProjectLevelsHostContext",
        "defaultLevelTree",
        "directChildren",
        "isCauseEffectLevel",
        "isDefaultLevelToken",
        "levelKnown",
        "levelTag",
        "levelTree",
        "nextPosition",
        "optionLabel",
        "pascalCase",
        "pickerNodes",
        "tagOf",
        "tokenOf",
        "useProjectLevels",
      ].sort(),
    );
    expect(typeof unit.ADD_LEVEL).toBe("string");
    expect(typeof unit.NOT_A_PROJECT_LEVEL).toBe("string");
    expect(Array.isArray(unit.DEFAULT_LEVELS)).toBe(true);
    expect(typeof unit.ProjectLevelsHostContext.Provider).toBe("object");
    for (const name of Object.keys(unit)) {
      if (["ADD_LEVEL", "NOT_A_PROJECT_LEVEL", "DEFAULT_LEVELS", "ProjectLevelsHostContext"].includes(name)) continue;
      expect(typeof (unit as Record<string, unknown>)[name], name).toBe("function");
    }
  });
});
