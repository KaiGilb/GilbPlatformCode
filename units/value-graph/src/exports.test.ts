// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CAPTION_H",
        "CAPTION_W",
        "END_ROOM",
        "EndpointEnd",
        "MENU_KINDS",
        "MENU_SETS_SHOWN",
        "NewMenu",
        "PlanValueGraph",
        "PlanValueGraphFullScreen",
        "RESOURCE_MENU_KINDS",
        "RowChips",
        "ViewToggle",
        "captionBox",
        "endHasType",
        "endRoom",
        "focusLevelEditor",
        "inTextField",
        "kindText",
        "markerRenders",
        "setVariables",
        "useGraphUi",
        "withVariable",
      ].sort(),
    );
    for (const name of ["PlanValueGraph", "PlanValueGraphFullScreen", "EndpointEnd", "NewMenu", "ViewToggle", "captionBox", "endHasType", "endRoom", "focusLevelEditor", "inTextField", "kindText", "setVariables", "useGraphUi", "withVariable"] as const) {
      expect(typeof unit[name], name).toBe("function");
    }
    expect(typeof unit.RowChips).toBe("object");
    expect(unit.markerRenders).toEqual({ count: 0 });
    expect(unit.MENU_KINDS).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    expect(unit.RESOURCE_MENU_KINDS).toEqual(["Past", "Status", "Tolerable", "Budget", "Wish"]);
    expect([unit.END_ROOM, unit.CAPTION_W, unit.CAPTION_H, unit.MENU_SETS_SHOWN]).toEqual([36, 64, 12, 12]);
  });
});
