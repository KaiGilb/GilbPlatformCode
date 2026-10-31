// Ported from the source's tests: `languageEntries.s8lang.test.ts` (the marked entry first 7, moving the mark 3, the legacy rung 2),
// `languageEntries.s8fix.test.ts` F7 (the rules of the mark, 8 of 10; the other 2 are in `language-entry`) and `contactLanguageTag.test.ts` (`contactLanguageDisplay`, 2) = 22.
// The cases of the legacy search (`findEntryForLegacyTag`) are for `language-search`.
import { describe, expect, it } from "vitest";
import { contactLanguageDisplay, contactTagForMark, legacyListingAccess, markedIndex, orderLanguages } from "./index";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";

const NOR = "https://veda.example.test/base/e/xja6zz79cmva";
const ENG = "https://veda.example.test/base/e/eng000000001";
const POR = "https://veda.example.test/base/e/por000000001";
const info = (uri: string, label: string, tag: string | null, countries: string[] = [], code: string | null = null): LanguageEntryInfo => ({ uri, label, tag, code, countries });
const INFOS = new Map<string, LanguageEntryInfo>([
  [NOR, info(NOR, "Norwegian", "no")],
  [ENG, info(ENG, "English", "en")],
  [POR, info(POR, "Portuguese", "pt")],
]);
const e = (id: string, language: string) => ({ id, language });

describe("the marked entry is first, there is one mark, and nothing is lost", () => {
  it("🔴 the entry whose tag matches the contact language is marked and shown first", () => {
    const got = orderLanguages([e("1", ENG), e("2", NOR), e("3", POR)], INFOS, "no");
    expect(got.views.map((v) => [v.entry.id, v.marked])).toEqual([["2", true], ["1", false], ["3", false]]);
    expect(got.legacyTag).toBeNull();
  });
  it("🔴 'no-NO' and 'pt-BR' (a value another app wrote) mark Norwegian and Portuguese, and are not rewritten", () => {
    expect(orderLanguages([e("1", ENG), e("2", NOR)], INFOS, "no-NO").views[0]!.entry.id).toBe("2");
    expect(orderLanguages([e("1", ENG), e("3", POR)], INFOS, "pt-BR").views[0]!.entry.id).toBe("3");
  });
  it("🔴 never more than one mark, even when two entries carry the same primary tag", () => {
    const twin = new Map(INFOS).set(ENG, info(ENG, "English (alt)", "no"));
    const got = orderLanguages([e("1", ENG), e("2", NOR)], twin, "no");
    expect(got.views.filter((v) => v.marked)).toHaveLength(1);
    expect(got.views[0]!.entry.id).toBe("1");
  });
  it("the others keep the order they came in", () => {
    const got = orderLanguages([e("1", ENG), e("2", NOR), e("3", POR)], INFOS, "pt");
    expect(got.views.map((v) => v.entry.id)).toEqual(["3", "1", "2"]);
  });
  it("🔴 a stored value matching no listed entry is kept as the legacy marked row, never dropped", () => {
    const got = orderLanguages([e("1", ENG)], INFOS, "no");
    expect(got.views.map((v) => v.marked)).toEqual([false]);
    expect(got.legacyTag).toBe("no");
  });
  it("no contact language: no mark, no legacy row", () => {
    const got = orderLanguages([e("1", ENG), e("2", NOR)], INFOS, "  ");
    expect(got.views.some((v) => v.marked)).toBe(false);
    expect(got.legacyTag).toBeNull();
  });
  it("an entry whose own read failed (no info) is listed unmarked, after the rest is ordered", () => {
    const got = orderLanguages([e("9", "https://veda.example.test/base/e/zzz999999999"), e("2", NOR)], INFOS, "no");
    expect(got.views.map((v) => v.entry.id)).toEqual(["2", "9"]);
    expect(got.views[1]!.info.tag).toBeNull();
  });
});

describe("moving the mark is ONE write of the tag, at the entry's own rung", () => {
  it("the mark is the entry's tag; the contact fact takes the entry's rung (the card shows the mark only to who can read the entry)", () => {
    expect(contactTagForMark(INFOS.get(ENG)!, "public")).toEqual({ tag: "en", access: "public" });
    expect(contactTagForMark(INFOS.get(NOR)!, "private")).toEqual({ tag: "no", access: "private" });
  });
  it("an entry with no tag cannot be marked", () => {
    expect(contactTagForMark(info(NOR, "x", null), "public")).toBeNull();
  });
  it("a held card has no rung: the mark carries none", () => {
    expect(contactTagForMark(INFOS.get(ENG)!, null)).toEqual({ tag: "en", access: null });
  });
});

describe("🔴 listing a legacy value never widens it", () => {
  it("takes the rung the legacy field carries", () => {
    expect(legacyListingAccess("pro-connection")).toBe("pro-connection");
    expect(legacyListingAccess("private")).toBe("private");
    expect(legacyListingAccess("public")).toBe("public");
  });
  it("a rung that cannot be told is Private, never Public", () => {
    expect(legacyListingAccess(undefined)).toBe("private");
    expect(legacyListingAccess(null)).toBe("private");
  });
});

// F7, the rules of the mark (the source's s8fix file): its own fixtures (the `ara` / `arb` pair that share the tag `ar`).
describe("🔴 F7 · which entry the stored contact language marks", () => {
  const A = "https://veda.example.test/base/e/ara000000001";
  const B = "https://veda.example.test/base/e/arb000000001";
  const E = "https://veda.example.test/base/e/eng000000001";
  const info4 = (uri: string, label: string, tag: string | null, code: string | null): LanguageEntryInfo => ({ uri, label, tag, code, countries: [] });
  const ARA = info4(A, "Arabic", "ar", "ara");
  const ARB = info4(B, "Standard Arabic", "ar", "arb");
  const ENG = info4(E, "English", "en", "eng");
  const e = (language: string) => ({ id: `id-${language.slice(-12)}`, language });
  const infos = (...l: LanguageEntryInfo[]) => new Map(l.map((i) => [i.uri, i]));

  it("rule 1: the stored value EQUAL to an entry's tag or three-letter code marks that entry, before any primary-subtag match", () => {
    expect(markedIndex([ARA, ARB], "arb")).toBe(1);
    expect(markedIndex([ARA, ARB], "ara")).toBe(0);
    expect(markedIndex([ARB, ARA], "ara")).toBe(1);
    expect(markedIndex([ARA, ARB], "AR")).toBe(0);
  });

  it("rule 2: otherwise the FIRST entry with the same primary subtag (`pt-BR` marks Portuguese; a stored `ar` with two Arabics marks the first)", () => {
    const por = info4("https://veda.example.test/base/e/por000000001", "Portuguese", "pt", "por");
    expect(markedIndex([ENG, por], "pt-BR")).toBe(1);
    expect(markedIndex([ARA, ARB], "ar")).toBe(0);
    expect(markedIndex([ARB, ARA], "ar")).toBe(0);
  });

  it("nothing marks nothing; an entry with no tag is never marked", () => {
    expect(markedIndex([ARA], "")).toBe(-1);
    expect(markedIndex([ENG], "fr")).toBe(-1);
    expect(markedIndex([info4(E, "x", null, null)], "en")).toBe(-1);
  });

  it("🔴 marking the SECOND of two entries that share a primary subtag writes its own three-letter code, so it IS the marked one", () => {
    const list = [ARA, ARB];
    const m = contactTagForMark(ARB, "public", list);
    expect(m).toEqual({ tag: "arb", access: "public" });
    const ordered = orderLanguages([e(A), e(B)], infos(ARA, ARB), m!.tag);
    expect(ordered.views.map((v) => [v.info.uri, v.marked])).toEqual([[B, true], [A, false]]);
    expect(ordered.legacyTag).toBeNull();
    // and back: marking the first writes ITS code, and the mark moves (one mark each time)
    const back = contactTagForMark(ARA, "public", list);
    expect(back!.tag).toBe("ara");
    const o2 = orderLanguages([e(A), e(B)], infos(ARA, ARB), back!.tag);
    expect(o2.views.filter((v) => v.marked).map((v) => v.info.uri)).toEqual([A]);
  });

  it("with no other entry sharing the tag, the plain tag is written (`en`, not `eng`)", () => {
    expect(contactTagForMark(ENG, null, [ARA, ARB, ENG])).toEqual({ tag: "en", access: null });
    expect(contactTagForMark(ENG, "private")).toEqual({ tag: "en", access: "private" });
  });

  it("an entry with no tag cannot be marked", () => {
    expect(contactTagForMark(info4(E, "x", null, null), null, [])).toBeNull();
  });

  it("when two entries share a tag but the entry has no code, its tag is written (it cannot do better)", () => {
    expect(contactTagForMark(info4(B, "x", "ar", null), null, [ARA])).toEqual({ tag: "ar", access: null });
  });

  it("still exactly ONE mark when the stored value is shared by both", () => {
    const ordered = orderLanguages([e(A), e(B)], infos(ARA, ARB), "ar");
    expect(ordered.views.filter((v) => v.marked)).toHaveLength(1);
  });
});

describe("contactLanguageDisplay", () => {
  it("names a stored tag and keeps the tag visible", () => {
    expect(contactLanguageDisplay("no", ["en"])).toBe("Norwegian (no)");
  });
  it("shows a value it cannot name exactly as stored", () => {
    expect(contactLanguageDisplay("Norsk please", ["en"])).toBe("Norsk please");
  });
});
