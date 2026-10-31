// Ported from the source's `languageEntries.s8lang.test.ts`: the tag of a language (2 cases) and a catalogue entry as the list reads it (5 cases) = 7 of its 23.
// The ordering, the mark, the legacy rung and the legacy search cases are for `language-order` and `language-search` (not in this unit).
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetLanguageEntries, languageEntryInfoOf, primaryLanguageSubtag, readLanguageEntry, sameLanguageTag } from "./index";

const NOR = "https://veda.example.test/base/e/xja6zz79cmva";

afterEach(() => {
  __resetLanguageEntries();
  vi.unstubAllGlobals();
});

describe("the tag of a language: the primary subtag decides", () => {
  it("takes the first subtag, lower case, either separator", () => {
    expect(primaryLanguageSubtag("pt-BR")).toBe("pt");
    expect(primaryLanguageSubtag("NO_nb")).toBe("no");
    expect(primaryLanguageSubtag(" en ")).toBe("en");
    expect(primaryLanguageSubtag("")).toBe("");
  });
  it("'no' and 'no-NO' are the same language; 'no' and 'nb' are not; nothing equals nothing", () => {
    expect(sameLanguageTag("no", "no-NO")).toBe(true);
    expect(sameLanguageTag("pt-BR", "pt")).toBe(true);
    expect(sameLanguageTag("no", "nb")).toBe(false);
    expect(sameLanguageTag("", "")).toBe(false);
  });
});

describe("a catalogue entry as the list reads it", () => {
  it("takes the label, the tag the browser makes from the ISO code, and the countries it names", () => {
    const got = languageEntryInfoOf(NOR, {
      "@id": NOR,
      label: "Norwegian",
      iso6393Code: "nor",
      languageCountry: [{ "@id": "https://geo.example.test/base/e/osm-r-2978650" }],
    });
    expect(got).toEqual({ uri: NOR, label: "Norwegian", tag: "no", code: "nor", countries: ["https://geo.example.test/base/e/osm-r-2978650"] });
  });
  it("reads the prefixed spelling too; one country as an object; none as an empty list", () => {
    expect(languageEntryInfoOf(NOR, { "a:label": "Norwegian", "a:iso6393Code": "nor", "a:languageCountry": { "@id": "https://geo.example.test/base/e/x1" } }).countries).toEqual(["https://geo.example.test/base/e/x1"]);
    expect(languageEntryInfoOf(NOR, { label: "Norwegian", iso6393Code: "nor" }).countries).toEqual([]);
  });
  it("an entry with no usable code has no tag (it can be listed, never marked); a missing label falls back to the address tail", () => {
    const got = languageEntryInfoOf(NOR, { "@id": NOR });
    expect(got.tag).toBeNull();
    expect(got.label).toBe("xja6zz79cmva");
  });
  it("a country that is not an address is dropped, a repeated one kept once", () => {
    const got = languageEntryInfoOf(NOR, {
      label: "x",
      languageCountry: [{ "@id": "Norway" }, { "@id": "https://geo.example.test/base/e/a" }, { "@id": "https://geo.example.test/base/e/a" }],
    });
    expect(got.countries).toEqual(["https://geo.example.test/base/e/a"]);
  });
  it("is read once per entry per session, and a failed read is not remembered", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify({ label: "Norwegian", iso6393Code: "nor" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readLanguageEntry(NOR)).rejects.toThrow();
    expect((await readLanguageEntry(NOR)).tag).toBe("no");
    await readLanguageEntry(NOR);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

