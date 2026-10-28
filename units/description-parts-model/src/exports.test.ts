// The export list of the unit, pinned: a name added or dropped fails here. It is the export list of the two source files
// (planParts and planLevelRead) plus the LevelHost type; the bounded fan-out is used inside and not exported.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "ASSUMPTION_ELEMENT",
        "ASSUMPTION_KEPT",
        "ASSUMPTION_WARNING",
        "KEYWORD_MESSAGE",
        "ORDER_CAP",
        "ORDER_TOO_MANY",
        "ORDER_UNREAD",
        "PARENT_NOT_A_PART",
        "REMOVAL_MAX_DEPTH",
        "REMOVAL_MAX_PARTS",
        "REMOVAL_TOO_DEEP",
        "REMOVAL_TOO_MANY",
        "SUBPART_UNREAD",
        "asGrid",
        "assumptionHedge",
        "closeGap",
        "comparePartTie",
        "descriptionTree",
        "dropPlan",
        "duplicatePartTag",
        "effectiveOrder",
        "indexBefore",
        "isAssumptionPart",
        "isPartType",
        "keywordProblem",
        "moveInPlan",
        "moveOutPlan",
        "nextOrder",
        "otherRecordsSentence",
        "partBody",
        "partKeyword",
        "partLineSources",
        "partOrder",
        "planFullLevelMove",
        "planPartialWrite",
        "planStep",
        "previewPaste",
        "readLevel",
        "removalPlan",
        "reorderPlan",
        "stepPlan",
        "suggestKeyword",
        "tagTaken",
      ].sort(),
    );
    for (const [name, value] of Object.entries(unit)) {
      if (/^[A-Z_]+$/.test(name)) expect(typeof value, name).toMatch(/^(string|number)$/);
      else expect(typeof value, name).toBe("function");
    }
  });
});
