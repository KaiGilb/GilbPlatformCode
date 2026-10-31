// Ported from the source's `countryFlags.s8lang.test.ts` (the file id, "how a flag is drawn and named", "which flags a language offers": 8 cases), with the example hosts of the library;
// and new: the viewer's flag rule (`viewerFlagCountry`).
import { describe, expect, it } from "vitest";
import { countryNameFromCode, ENTITY_ADDRESS, FLAG_SHORT_LIST_MAX, flagChoices, flagDataUrl, flagFileId, viewerFlagCountry } from "./index";

const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const UK = "https://geo.example.test/base/e/osm-r-62149";
const USA = "https://geo.example.test/base/e/osm-r-148838";
const SVG_NO = '<svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-no" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';

describe("the file id: a country's local id, never the country entity", () => {
  it("is `flag-` + the local id of the country's address", () => {
    expect(flagFileId(NORWAY)).toBe("flag-osm-r-2978650");
  });
  it("is null for what is not a catalogue entity address", () => {
    expect(flagFileId("Norway")).toBeNull();
    expect(flagFileId("https://geo.example.test/base/t/Country")).toBeNull();
    expect(flagFileId("")).toBeNull();
  });
});

describe("how a flag is drawn and named", () => {
  it("is an image data address, so a picture can run no script", () => {
    expect(flagDataUrl(SVG_NO)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(flagDataUrl(SVG_NO).split(",")[1]!)).toBe(SVG_NO);
  });
  it("names a country from its ISO code in the reader's language; no code, no name", () => {
    expect(countryNameFromCode("no", ["en"])).toBe("Norway");
    expect(countryNameFromCode("NO", ["nb"])).toBe("Norge");
    expect(countryNameFromCode(null)).toBeNull();
    expect(countryNameFromCode("zz-bad!")).toBeNull();
  });
});

describe("which flags a language offers", () => {
  const c = (n: number) => Array.from({ length: n }, (_, i) => `https://geo.example.test/base/e/c${i}`);
  it("one country is the default flag", () => {
    expect(flagChoices(c(1))).toEqual({ defaultCountry: c(1)[0], short: c(1), needsSearch: false });
  });
  it("2 to the cut: a short list to pick from, no default", () => {
    expect(flagChoices(c(4))).toEqual({ defaultCountry: null, short: c(4), needsSearch: false });
    expect(flagChoices(c(FLAG_SHORT_LIST_MAX)).needsSearch).toBe(false);
  });
  it("over the cut: no short list, a search over all countries", () => {
    expect(flagChoices(c(FLAG_SHORT_LIST_MAX + 1))).toEqual({ defaultCountry: null, short: [], needsSearch: true });
  });
  it("none: no default and no list (the globe, and any country by search)", () => {
    expect(flagChoices([])).toEqual({ defaultCountry: null, short: [], needsSearch: true });
  });
});

describe("the address rule", () => {
  it("cuts the host and the local id from a catalogue address and nothing else", () => {
    const m = ENTITY_ADDRESS.exec(NORWAY);
    expect(m?.[1]).toBe("https://geo.example.test");
    expect(m?.[2]).toBe("osm-r-2978650");
    expect(ENTITY_ADDRESS.exec("http://geo.example.test/base/e/x")).toBeNull();
    expect(ENTITY_ADDRESS.exec("https://geo.example.test/base/e/x/y")).toBeNull();
  });
});

describe("viewerFlagCountry: the flag a language row shows", () => {
  it("N-a: the claim's own flag country wins over the entry's countries", () => {
    expect(viewerFlagCountry({ flagCountry: USA, languageCountries: [UK] })).toBe(USA);
    expect(viewerFlagCountry({ flagCountry: USA, languageCountries: [] })).toBe(USA);
    expect(viewerFlagCountry({ flagCountry: USA, languageCountries: [UK, NORWAY] })).toBe(USA);
  });
  it("N-b: with no own flag, exactly one language country is the flag", () => {
    expect(viewerFlagCountry({ languageCountries: [NORWAY] })).toBe(NORWAY);
    expect(viewerFlagCountry({ flagCountry: null, languageCountries: [NORWAY] })).toBe(NORWAY);
    expect(viewerFlagCountry({ flagCountry: "  ", languageCountries: [NORWAY] })).toBe(NORWAY);
  });
  it("N-c: no country gives null (the globe), and so do two or more", () => {
    expect(viewerFlagCountry({ languageCountries: [] })).toBeNull();
    expect(viewerFlagCountry({ flagCountry: null, languageCountries: [UK, USA] })).toBeNull();
    expect(viewerFlagCountry({ languageCountries: Array.from({ length: FLAG_SHORT_LIST_MAX + 1 }, (_, i) => `https://geo.example.test/base/e/c${i}`) })).toBeNull();
  });
  it("agrees with flagChoices' default when no flag is chosen", () => {
    for (const n of [0, 1, 2, 5, 13]) {
      const cs = Array.from({ length: n }, (_, i) => `https://geo.example.test/base/e/c${i}`);
      expect(viewerFlagCountry({ languageCountries: cs })).toBe(flagChoices(cs).defaultCountry);
    }
  });
});

describe("the cut of the short list", () => {
  it("is twelve countries: twelve are listed, thirteen need a search", () => {
    expect(FLAG_SHORT_LIST_MAX).toBe(12);
    const c = (n: number) => Array.from({ length: n }, (_, i) => `https://geo.example.test/base/e/c${i}`);
    expect(flagChoices(c(12)).short).toHaveLength(12);
    expect(flagChoices(c(13)).needsSearch).toBe(true);
  });
});
