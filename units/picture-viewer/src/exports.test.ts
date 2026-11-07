import { describe, expect, it } from "vitest";
import * as unit from "./index";
import * as core from "./lightboxCore";

describe("the package's exports", () => {
  it("are exactly these values: the viewer, its hook, and everything lightboxCore exports", () => {
    expect(Object.keys(unit).sort()).toEqual(["PictureViewer", "usePictureViewer", ...Object.keys(core)].sort());
  });
  it("name the ones the brief lists", () => {
    for (const name of ["PictureViewer", "usePictureViewer", "defaultWords", "resolveWords", "whySkipped", "itemFromImg", "collectSet", "isTooSmall"]) {
      expect(typeof (unit as Record<string, unknown>)[name], name).not.toBe("undefined");
    }
  });
  it("keeps the numbers a gesture is read by", () => {
    expect([unit.MAX_ZOOM, unit.ZOOM_STEP, unit.DOUBLE_TAP_ZOOM, unit.SWIPE_DISTANCE, unit.SWIPE_CLOSE_DISTANCE, unit.TAP_TIME, unit.TAP_SLOP, unit.DOUBLE_TAP_TIME, unit.DOUBLE_TAP_DISTANCE])
      .toEqual([4, 1.5, 2.5, 50, 90, 300, 10, 350, 30]);
  });
});
