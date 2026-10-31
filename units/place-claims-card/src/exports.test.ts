// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["LABEL_SUGGESTIONS", "NO_VAULT_NOTE", "PlaceClaimsCard", "READING_NOTE", "READ_FAILED_NOTE", "incompleteNote"]);
  expect(unit.LABEL_SUGGESTIONS).toEqual(["home", "work", "home2", "cabin"]);
});
