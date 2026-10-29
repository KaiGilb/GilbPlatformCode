import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's export list", () => {
  it("is the tag routes' typed calls, their constants, their errors and the route test; `asObject` stays private", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "MASTERS_BATCH_MAX",
        "NO_TAG_ROUTES_SENTENCE",
        "NoTagRoutesError",
        "TagRoleDerivedError",
        "TagTakenError",
        "addTag",
        "ensureMasterTag",
        "isRouteMissing",
        "makeMainTag",
        "readMainTags",
        "readMasterTag",
        "readTags",
        "removeTag",
      ].sort(),
    );
  });
});
