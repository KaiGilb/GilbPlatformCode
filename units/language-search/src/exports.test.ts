// New. Pins the entry point so an export added or dropped is a decision.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "LANGUAGE_SEARCH_DEBOUNCE_MS",
    "LANGUAGE_SEARCH_LIST_CHARS",
    "LANGUAGE_SEARCH_MIN_CHARS",
    "LanguageSearchError",
    "findEntryForLegacyTag",
    "languageEntityPattern",
    "searchLanguagesRemote",
  ]);
});
