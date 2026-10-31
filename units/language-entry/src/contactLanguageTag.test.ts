// Ported from the source's `contactLanguageTag.test.ts`: `contactLanguageTagFor` (3 cases) and `iso6393CodeOf` (2) = 5 of its 10; and new: `contactLanguageName`, `languageEntryReadUrl`.
// `contactLanguageDisplay` (2) is for `language-order`, and `contactLanguageTagOf` (3, a picker's read) is not taken.
import { describe, expect, it } from "vitest";
import { contactLanguageName, contactLanguageTagFor, iso6393CodeOf, languageEntryReadUrl } from "./index";

// The served shape of the catalogue's Norwegian entry (GET https://veda.example.test/base/e/xja6zz79cmva,
// anonymous, 2026-10-14T20:15Z), trimmed to the keys this code reads and two it must ignore.
const NORWEGIAN = {
  "@id": "https://veda.example.test/base/e/xja6zz79cmva",
  "@type": "t:HumanLanguage",
  glottocode: "norw1258",
  iso6393Code: "nor",
  label: "Norwegian",
};

describe("contactLanguageTag", () => {
  describe("contactLanguageTagFor", () => {
    it("makes the shortest tag the browser knows from an ISO 639-3 code", () => {
      expect(contactLanguageTagFor("nor")).toBe("no");
      expect(contactLanguageTagFor("nob")).toBe("nb");
      expect(contactLanguageTagFor("eng")).toBe("en");
      expect(contactLanguageTagFor("NOR")).toBe("no");
    });
    it("keeps three letters for a language with no two-letter code (still a valid tag)", () => {
      expect(contactLanguageTagFor("non")).toBe("non");
    });
    it("refuses what is not a three-letter code", () => {
      expect(contactLanguageTagFor("")).toBeNull();
      expect(contactLanguageTagFor("no")).toBeNull();
      expect(contactLanguageTagFor("Norwegian")).toBeNull();
    });
  });

  describe("iso6393CodeOf", () => {
    it("reads the code off a served entry, and a prefixed or @value spelling", () => {
      expect(iso6393CodeOf(NORWEGIAN)).toBe("nor");
      expect(iso6393CodeOf({ "a:iso6393Code": "NOB" })).toBe("nob");
      expect(iso6393CodeOf({ iso6393Code: { "@value": "eng" } })).toBe("eng");
    });
    it("gives null for an entry with no usable code", () => {
      expect(iso6393CodeOf({ label: "Norwegian" })).toBeNull();
      expect(iso6393CodeOf({ iso6393Code: "no" })).toBeNull();
      expect(iso6393CodeOf(null)).toBeNull();
    });
  });

  describe("contactLanguageName", () => {
    it("new: names a tag in the reader's language, and gives null for what the browser cannot name", () => {
      expect(contactLanguageName("no", ["en"])).toBe("Norwegian");
      expect(contactLanguageName("", ["en"])).toBeNull();
      expect(contactLanguageName("   ", ["en"])).toBeNull();
      expect(contactLanguageName("zz-not a tag!", ["en"])).toBeNull();
    });
  });

  describe("languageEntryReadUrl", () => {
    it("new: an entry is read at its own address", () => {
      expect(languageEntryReadUrl(NORWEGIAN["@id"])).toBe(NORWEGIAN["@id"]);
    });
  });
});
