import { expect, test } from "vitest";
import { altNamesForLang, languageDisplayName } from "./languageName";

test("the screen language wins, then the document label", () => {
  expect(languageDisplayName({ label: "Norsk", labelByLang: { en: "Norwegian" } }, "en")).toBe("Norwegian");
  expect(languageDisplayName({ label: "Norsk", labelByLang: { en: "  " } }, "en")).toBe("Norsk");
  expect(languageDisplayName({}, "en")).toBe("");
});

test("other names accept one string or a list", () => {
  expect(altNamesForLang({ en: "Norwegian" }, "en")).toEqual(["Norwegian"]);
  expect(altNamesForLang({ en: ["Norwegian", "Bokmål", ""] }, "en")).toEqual(["Norwegian", "Bokmål"]);
  expect(altNamesForLang({ en: "Norwegian" }, "de")).toEqual([]);
});
