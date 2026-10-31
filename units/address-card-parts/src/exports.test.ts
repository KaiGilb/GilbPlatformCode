// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "AddressLineRows",
    "AddressTextRow",
    "BoundPlaceLine",
    "CHANGE_FAILED_FIXED",
    "CompactAddress",
    "GRAINS_UNREAD_SAYS",
    "LINE_SLOTS",
    "PLACES_TOO_MANY_SAYS",
    "PLACE_GONE_SAYS",
    "PLACE_UNREAD_SAYS",
    "SavedAddress",
    "compactLines",
    "hiddenFieldsSentence",
    "termWords",
    "textFieldLabel",
  ]);
});
