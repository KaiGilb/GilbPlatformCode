// @vitest-environment node
// New. Pins the entry point: the four exports the source file has, no more.
import { expect, it } from "vitest";
import * as unit from "./index";
import { changeRecordFactItems } from "./index";

it("exports exactly the source file's four functions and one class", () => {
  expect(Object.keys(unit).sort()).toEqual(["RecordVersionUnknownError", "changeRecordFactItems", "factItemsToWire", "storedFactItems"]);
});
it("changeRecordFactItems has the five parameters the card-references host member names", () => {
  expect(changeRecordFactItems.length).toBe(5);
  type Member = (recordId: string, recordEntityUri: string | null, factKey: string, change: (stored: readonly unknown[]) => unknown[], notChanged: string) => Promise<unknown[]>;
  const asMember: Member = changeRecordFactItems; // compile-time: assignable
  expect(asMember).toBe(changeRecordFactItems);
});
