// @vitest-environment jsdom
// New. The source's cases of this hook are driven through the languages section (those are in `language-section`) and in `heldPrivate.sb1b`
// (`useHeldLanguages.sb1b.test.tsx`). These drive the hook alone over the fake platform and read every request as it went out on the wire:
// nothing is written on mount, render or idle; the record's contact tag is written only on the user's act; a null goes out only for the flag the user cleared.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { watchWire, writes, type WireCall } from "../test/wire";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const ADDER = vi.hoisted(() => "https://adder.platform.example.test/base/e/vsc-adder");
const own = vi.hoisted(() => ({ noOwnVault: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => ADDER, () => ({ noOwnVault: own.noOwnVault })),
);

// eslint-disable-next-line import/first
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
// eslint-disable-next-line import/first
import { __resetHeldLanguageVocab } from "@kaigilb/gilbplatformcode-held-language";
// eslint-disable-next-line import/first
import { useHeldLanguages, type LanguageRow } from "./index";

const { VAULT, store } = fake;
const AGENT = "https://id.platform.example.test/base/p/kai";
const ORIGIN = "https://veda.platform.example.test";
const NOR = `${ORIGIN}/base/e/xja6zz79cmva`;
const ENG = `${ORIGIN}/base/e/eng000000001`;
const POR = `${ORIGIN}/base/e/por000000001`;
const NORWAY = "https://geo.platform.example.test/base/e/osm-r-2978650";
const UK = "https://geo.platform.example.test/base/e/osm-r-62149";
const USA = "https://geo.platform.example.test/base/e/osm-r-148838";
const OTHER_ADDER = "https://other.platform.example.test/base/e/vsc-other";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const info = (uri: string, label: string, tag: string | null, countries: string[] = [], code: string | null = null): LanguageEntryInfo => ({ uri, label, tag, code, countries });
const NOR_I = info(NOR, "Norwegian", "no", [NORWAY], "nor");
const ENG_I = info(ENG, "English", "en", [UK, USA], "eng");
const POR_I = info(POR, "Portuguese", "pt", [], "por");

let tom: string;
let qc: QueryClient;
let calls: WireCall[];
beforeEach(() => {
  setUp();
  setTermOrigin(ORIGIN);
  fake.resetStore();
  __resetHeldNoteChains();
  __resetHeldLanguageVocab();
  fake.attributeSpelling.mockImplementation(async (name: string) => name);
  own.noOwnVault = false;
  calls = watchWire();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  resetTermOrigin();
  tearDown();
});
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const seed = (statedBy: string, language: string, flag?: string) =>
  fake.seed("t:HeldPartyFieldClaim", {
    "a:heldParty": { "@id": uriOf(tom) },
    "a:languageUsed": { "@id": language },
    "a:statedBy": { "@id": statedBy },
    ...(flag ? { "a:flagCountry": { "@id": flag } } : {}),
  });
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim" && "a:languageUsed" in e.facts);
function mount(contact: { tag: string; write: ((t: string) => void) | null } = { tag: "", write: null }, vault: string | null = VAULT) {
  return renderHook(({ c, v }) => useHeldLanguages(v, uriOf(tom), AGENT, c), { wrapper, initialProps: { c: contact, v: vault } });
}
const rowOf = (r: { current: { rows: readonly LanguageRow[] } }, language: string) => r.current.rows.find((x) => x.language === language)!;
const patchBodies = () => writes(calls).filter((c) => c.method === "PATCH").map((c) => c.body as Record<string, unknown>);

describe("🔴 the guarantee: reading writes nothing", () => {
  it("mount, render, idle and a re-render with a changed contact tag make zero writes and never call the record's save", async () => {
    seed(ADDER, NOR, NORWAY);
    seed(OTHER_ADDER, ENG);
    const write = vi.fn();
    const h = mount({ tag: "no", write });
    await waitFor(() => expect(h.result.current.rows).toHaveLength(2));
    h.rerender({ c: { tag: "en", write }, v: VAULT });
    h.rerender({ c: { tag: "", write }, v: VAULT });
    h.rerender({ c: { tag: "", write: null }, v: VAULT });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(writes(calls)).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    expect(calls.length).toBeGreaterThan(0);
  });
  it("rows list every claim the platform returned, whoever stated it; only the viewer's own are 'own'", async () => {
    seed(ADDER, NOR);
    seed(OTHER_ADDER, ENG);
    const h = mount();
    await waitFor(() => expect(h.result.current.rows).toHaveLength(2));
    await waitFor(() => expect(rowOf(h.result, NOR).own).toBe(true));
    expect(rowOf(h.result, ENG).own).toBe(false);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.hasRungs).toBe(false);
    expect(rowOf(h.result, NOR).access).toBeNull();
  });
  it("a read that fails is said, never shown as 'no languages'", async () => {
    fake.findByAttribute.mockRejectedValue(new Error("down"));
    const h = mount();
    await waitFor(() => expect(h.result.current.error).toMatch(/^Could not read your languages: /));
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.rows).toEqual([]);
  });
  it("two claims for one entry are one row", async () => {
    seed(ADDER, NOR);
    seed(OTHER_ADDER, NOR);
    const h = mount();
    await waitFor(() => expect(h.result.current.rows).toHaveLength(1));
  });
  it("noOwnVault is the adder card's word", async () => {
    own.noOwnVault = true;
    const h = mount();
    expect(h.result.current.noOwnVault).toBe(true);
  });
});

describe("add", () => {
  it("is ONE create of a held claim, stated by the viewer's own card, with the entry's one country as its flag and no tier", async () => {
    const h = mount();
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      expect(await h.result.current.add(NOR_I)).toBe(true);
    });
    const w = writes(calls);
    expect(w.map((c) => c.method)).toEqual(["POST"]);
    const facts = (w[0]!.body as { facts: Record<string, unknown> }).facts;
    expect(facts).toMatchObject({ "a:languageUsed": { "@id": NOR }, "a:statedBy": { "@id": ADDER }, "a:flagCountry": { "@id": NORWAY }, "a:heldParty": { "@id": uriOf(tom) } });
    expect(Object.keys(facts).some((k) => /visibilityTier|claimSubject/.test(k))).toBe(false);
    await waitFor(() => expect(h.result.current.rows.map((r) => r.language)).toEqual([NOR]));
    expect(rowOf(h.result, NOR).flagCountry).toBe(NORWAY);
  });
  it("a language in several countries, or none, is added with no flag", async () => {
    const h = mount();
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      await h.result.current.add(ENG_I);
      await h.result.current.add(POR_I);
    });
    for (const [, e] of claims()) expect(e.facts).not.toHaveProperty("a:flagCountry");
    expect(claims()).toHaveLength(2);
  });
  it("two adds of one language at once make ONE claim (each act waits for the one before)", async () => {
    const h = mount();
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      await Promise.all([h.result.current.add(NOR_I), h.result.current.add(NOR_I)]);
    });
    expect(claims()).toHaveLength(1);
    expect(writes(calls).filter((c) => c.method === "POST")).toHaveLength(1);
  });
  it("with no vault it says so and writes nothing", async () => {
    const h = mount({ tag: "", write: null }, null);
    await act(async () => {
      expect(await h.result.current.add(NOR_I)).toBe(false);
    });
    expect(h.result.current.errorFor(NOR)).toMatch(/Not signed in to a vault/);
    expect(writes(calls)).toEqual([]);
  });
  it("listLegacy is add", async () => {
    const h = mount();
    expect(h.result.current.listLegacy).toBe(h.result.current.add);
  });
});

describe("🔴 the flag: a null goes out only for the flag the user cleared", () => {
  it("a chosen flag is ONE PATCH of exactly that key; 'No flag' is ONE PATCH of exactly that key as null; no other PATCH carries a null", async () => {
    const id = seed(ADDER, ENG);
    const h = mount();
    await waitFor(() => expect(rowOf(h.result, ENG)?.own).toBe(true));
    await act(async () => {
      expect(await h.result.current.setFlag(rowOf(h.result, ENG), UK)).toBe(true);
    });
    expect(patchBodies()).toEqual([{ "a:flagCountry": { "@id": UK } }]);
    expect(store.get(id)!.facts["a:flagCountry"]).toEqual({ "@id": UK });
    await waitFor(() => expect(rowOf(h.result, ENG).flagCountry).toBe(UK));
    await act(async () => {
      expect(await h.result.current.setFlag(rowOf(h.result, ENG), null)).toBe(true);
    });
    expect(patchBodies()).toEqual([{ "a:flagCountry": { "@id": UK } }, { "a:flagCountry": null }]);
    const nulls = patchBodies().flatMap((b) => Object.entries(b)).filter(([, v]) => v === null);
    expect(nulls).toEqual([["a:flagCountry", null]]);
    expect(store.get(id)!.facts["a:languageUsed"]).toEqual({ "@id": ENG });
  });
  it("the same flag again writes nothing", async () => {
    seed(ADDER, ENG, UK);
    const h = mount();
    await waitFor(() => expect(rowOf(h.result, ENG)?.own).toBe(true));
    await act(async () => {
      expect(await h.result.current.setFlag(rowOf(h.result, ENG), UK)).toBe(true);
    });
    expect(writes(calls)).toEqual([]);
  });
  it("acts on every claim of the viewer's own for the entry (a duplicate is not left with another flag)", async () => {
    const a = seed(ADDER, ENG);
    const b = seed(ADDER, ENG);
    const h = mount();
    await waitFor(() => expect(rowOf(h.result, ENG)?.own).toBe(true));
    await act(async () => {
      expect(await h.result.current.setFlag(rowOf(h.result, ENG), USA)).toBe(true);
    });
    expect(store.get(a)!.facts["a:flagCountry"]).toEqual({ "@id": USA });
    expect(store.get(b)!.facts["a:flagCountry"]).toEqual({ "@id": USA });
    expect(patchBodies()).toHaveLength(2);
  });
  it("another person's claim is not changed: said, and no PATCH", async () => {
    seed(OTHER_ADDER, ENG);
    const h = mount();
    await waitFor(() => expect(h.result.current.rows).toHaveLength(1));
    await act(async () => {
      expect(await h.result.current.setFlag(h.result.current.rows[0]!, UK)).toBe(false);
    });
    expect(h.result.current.errorFor(ENG)).toMatch(/could not be found on this card/);
    expect(writes(calls)).toEqual([]);
  });
});

describe("remove", () => {
  it("deletes only the viewer's own claims for the entry", async () => {
    const mine = seed(ADDER, NOR);
    const theirs = seed(OTHER_ADDER, NOR);
    const other = seed(ADDER, ENG);
    const h = mount();
    await waitFor(() => expect(rowOf(h.result, NOR)?.own).toBe(true));
    await act(async () => {
      expect(await h.result.current.remove(rowOf(h.result, NOR), false)).toBe(true);
    });
    expect(writes(calls).map((c) => c.method)).toEqual(["DELETE"]);
    expect(store.has(mine)).toBe(false);
    expect(store.has(theirs)).toBe(true);
    expect(store.has(other)).toBe(true);
  });
  it("🔴 removing the marked language clears the record's contact tag with ONE write of '' (on the user's act)", async () => {
    seed(ADDER, NOR);
    const write = vi.fn();
    const h = mount({ tag: "no", write });
    await waitFor(() => expect(rowOf(h.result, NOR)?.own).toBe(true));
    expect(write).not.toHaveBeenCalled();
    await act(async () => {
      expect(await h.result.current.remove(rowOf(h.result, NOR), true)).toBe(true);
    });
    expect(write.mock.calls).toEqual([[""]]);
  });
  it("removing an unmarked language never touches the contact tag", async () => {
    seed(ADDER, NOR);
    const write = vi.fn();
    const h = mount({ tag: "en", write });
    await waitFor(() => expect(rowOf(h.result, NOR)?.own).toBe(true));
    await act(async () => {
      await h.result.current.remove(rowOf(h.result, NOR), false);
    });
    expect(write).not.toHaveBeenCalled();
  });
  it("🔴 a mark moved to another language while the removal ran is left alone", async () => {
    seed(ADDER, NOR);
    seed(ADDER, POR);
    const write = vi.fn();
    const h = mount({ tag: "no", write });
    await waitFor(() => expect(h.result.current.rows).toHaveLength(2));
    await waitFor(() => expect(rowOf(h.result, POR)?.own).toBe(true));
    let done!: Promise<boolean>;
    await act(async () => {
      done = h.result.current.remove(rowOf(h.result, NOR), true);
      await h.result.current.markContact(rowOf(h.result, POR), POR_I, [NOR_I, POR_I]);
      await done;
    });
    expect(write.mock.calls).toEqual([["pt"]]);
  });
  it("🔴 an entry marked in the meantime clears the mark it put when it is removed, even if the click came before it was marked", async () => {
    seed(ADDER, POR);
    const write = vi.fn();
    const h = mount({ tag: "", write });
    await waitFor(() => expect(rowOf(h.result, POR)?.own).toBe(true));
    await act(async () => {
      await h.result.current.markContact(rowOf(h.result, POR), POR_I, [POR_I]);
      expect(await h.result.current.remove(rowOf(h.result, POR), false)).toBe(true);
    });
    expect(write.mock.calls).toEqual([["pt"], [""]]);
  });
  it("with no card of its own the viewer has stated nothing: nothing is deleted and it is not an error", async () => {
    seed(OTHER_ADDER, NOR);
    const h = mount();
    await waitFor(() => expect(h.result.current.rows).toHaveLength(1));
    await act(async () => {
      expect(await h.result.current.remove(h.result.current.rows[0]!, false)).toBe(true);
    });
    expect(writes(calls)).toEqual([]);
    expect(claims()).toHaveLength(1);
  });
});

describe("the contact language mark: only the record's own save, only on an act", () => {
  it("markContact writes the entry's tag once and says so; an entry with no tag, or a record with no field, writes nothing", async () => {
    seed(ADDER, NOR);
    const write = vi.fn();
    const h = mount({ tag: "", write });
    await waitFor(() => expect(h.result.current.rows).toHaveLength(1));
    await act(async () => {
      expect(await h.result.current.markContact(rowOf(h.result, NOR), NOR_I)).toBe(true);
      expect(await h.result.current.markContact(rowOf(h.result, NOR), info(NOR, "x", null))).toBe(false);
    });
    expect(write.mock.calls).toEqual([["no"]]);
    const none = mount({ tag: "", write: null });
    await act(async () => {
      expect(await none.result.current.markContact(rowOf(h.result, NOR), NOR_I)).toBe(false);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(writes(calls)).toEqual([]);
  });
  it("the tag written is the entry's own code when another listed entry shares its primary subtag", async () => {
    const write = vi.fn();
    const h = mount({ tag: "", write });
    const ara = info(`${ORIGIN}/base/e/ara000000001`, "Arabic", "ar", [], "ara");
    const arb = info(`${ORIGIN}/base/e/arb000000001`, "Standard Arabic", "ar", [], "arb");
    await act(async () => {
      await h.result.current.markContact({ id: "x", language: arb.uri, flagCountry: null, access: null }, arb, [ara, arb]);
    });
    expect(write.mock.calls).toEqual([["arb"]]);
  });
  it("clearContact writes '' once, and says false when the record has no field to write", async () => {
    const write = vi.fn();
    const h = mount({ tag: "no", write });
    await act(async () => {
      expect(await h.result.current.clearContact()).toBe(true);
    });
    expect(write.mock.calls).toEqual([[""]]);
    const none = mount({ tag: "no", write: null });
    await act(async () => {
      expect(await none.result.current.clearContact()).toBe(false);
    });
  });
  it("the stored tag is handed back as contactTag", () => {
    const h = mount({ tag: "pt-BR", write: null });
    expect(h.result.current.contactTag).toBe("pt-BR");
  });
});
