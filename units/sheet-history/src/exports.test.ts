// @vitest-environment node
// New. Pins the entry point and the shapes `org-employees`' host members name.
import { expect, it } from "vitest";
import * as unit from "./index";
import { dropStaleSheetEntry, useSheetHistory } from "./index";

it("exports exactly useSheetHistory, dropStaleSheetEntry and the test seam", () => {
  expect(Object.keys(unit).sort()).toEqual(["__resetSheetHistory", "dropStaleSheetEntry", "useSheetHistory"]);
});
it("the two fit org-employees' host members", () => {
  const hook: (open: boolean, onClosed: () => void) => { requestClose: (after?: () => void) => void } = useSheetHistory; // compile-time
  const drop: () => void = dropStaleSheetEntry;
  expect(hook.length).toBe(2);
  expect(drop.length).toBe(0);
});
it("without a window (a server), dropStaleSheetEntry does nothing and does not throw", () => {
  expect(typeof window).toBe("undefined");
  expect(() => dropStaleSheetEntry()).not.toThrow();
});
