// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual(["LANGUAGE_READING_TEXT", "LANGUAGE_UNNAMED_TEXT", "LanguageRow", "languageNameOf"]);
});
it("the two words", () => {
  expect(unit.LANGUAGE_READING_TEXT).toBe("…");
  expect(unit.LANGUAGE_UNNAMED_TEXT).toBe("A language");
});
