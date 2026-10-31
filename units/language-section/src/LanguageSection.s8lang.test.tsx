// @vitest-environment jsdom
// Ported from the source's `LanguageSection.s8lang.test.tsx` (22 cases). Re-based: the source drove the store through module mocks of the app's record client; here the real
// peers run over a fake platform at the level of `fetch` (test/fakePlaceStore.ts), and the language catalogue and the geo catalogue are a local fixture. The example hosts
// replace the real ones; `__resetGeoCache` (the country picker's cache, not in a unit) is dropped. The cases are otherwise the source's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { AddedByHostContext, __resetAddedByForTest } from "@kaigilb/gilbplatformcode-added-by";
import { __resetFlags, geoFlagSource, setFlagSource, setFlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import { __resetHeldLanguageVocab, heldLanguageFacts, heldLanguagesAbout, HeldLanguageError, ownHeldLanguages, resolveHeldLanguageVocab } from "@kaigilb/gilbplatformcode-held-language";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __resetLanguageEntries } from "@kaigilb/gilbplatformcode-language-entry";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { installSourceName } from "../test/addedByTestkit";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const stater = vi.hoisted(() => ({ uri: "" }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri),
);

// eslint-disable-next-line import/first
import { LanguageSection } from "./index";

const { VAULT, store } = fake;
const AGENT = "https://id.platform.example.test/base/p/kai";
const NOR = "https://veda.platform.example.test/base/e/xja6zz79cmva";
const ENG = "https://veda.platform.example.test/base/e/eng000000001";
const POR = "https://veda.platform.example.test/base/e/por000000001";
const NORWAY = "https://geo.platform.example.test/base/e/osm-r-2978650";
const UK = "https://geo.platform.example.test/base/e/osm-r-62149";
const USA = "https://geo.platform.example.test/base/e/osm-r-148838";
const AUS = "https://geo.platform.example.test/base/e/osm-r-80500";
const SVG = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="${c}" d="M0 0h640v480H0z"/></svg>`;
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim" && "a:languageUsed" in e.facts);

const CATALOGUE: Record<string, { label: string; iso6393Code: string; languageCountry?: string[] }> = {
  [NOR]: { label: "Norwegian", iso6393Code: "nor", languageCountry: [NORWAY] },
  [ENG]: { label: "English", iso6393Code: "eng", languageCountry: [UK, USA, AUS] },
  [POR]: { label: "Portuguese", iso6393Code: "por" },
};
let geoFlags: Record<string, { code: string; svg: string }> = {};
const geoCalls: string[] = [];
function installFetch() {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (p: unknown, status = 200) => new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("https://geo.platform.example.test/")) {
      geoCalls.push(url);
      const m = /^https:\/\/geo\.platform\.example\.test\/(base\/e|files)\/(flag-[a-z0-9-]+)$/.exec(url);
      if (m) {
        const hit = geoFlags[m[2]!];
        if (!hit) return new Response("no", { status: 404 });
        return m[1] === "files" ? new Response(hit.svg, { status: 200, headers: { "Content-Type": "image/svg+xml" } }) : json({ fileTag: ["flag", hit.code] });
      }
      const names: Record<string, string> = { [UK]: "United Kingdom", [USA]: "United States", [AUS]: "Australia", [NORWAY]: "Norway" };
      return names[url] ? json({ "@id": url, "@type": "t:Country", label: names[url] }) : new Response("no", { status: 404 });
    }
    if (url.includes("/base/search") && url.includes("type=HumanLanguage")) {
      const q = (new URL(url, "http://x").searchParams.get("q") ?? "").toLowerCase();
      return json({
        hits: Object.entries(CATALOGUE).filter(([, d]) => d.label.toLowerCase().startsWith(q)).map(([entity, d]) => ({ entity, label: d.label, typeUri: null, does: null })),
        next: null,
      });
    }
    const entry = Object.keys(CATALOGUE).find((k) => url === k);
    if (entry) {
      const d = CATALOGUE[entry]!;
      return json({ "@id": entry, label: d.label, iso6393Code: d.iso6393Code, ...(d.languageCountry ? { languageCountry: d.languageCountry.map((c) => ({ "@id": c })) } : {}) });
    }
    // The record doors and the per-person find are the fake platform's (test/fakePlaceStore.ts).
    return fake.fakeFetch(input, init);
  });
  vi.stubGlobal("fetch", f);
  setFlagSource(geoFlagSource({ fetchFn: f as unknown as typeof fetch }));
}

let tom: string;
let ann: string;
let BY: Record<string, unknown>;
/** The record's own `a:contactLanguage`, and every write the card made to it. Survives a "reload". */
let contact = { tag: "" };
let contactWrites: string[] = [];

function Harness({ canEdit = true }: { canEdit?: boolean }) {
  const [tag, setTag] = useState(contact.tag);
  return (
    <LanguageSection
      vaultId={VAULT}
      principal={AGENT}
      recordEntityUri={uriOf(tom)}
      canEdit={canEdit}
      contactTag={tag}
      writeContact={(t) => {
        contactWrites.push(t);
        contact.tag = t;
        setTag(t);
      }}
    />
  );
}
function show(canEdit = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AddedByHostContext.Provider value={{ useShell: () => null }}>
      <QueryClientProvider client={qc}>
        <Harness canEdit={canEdit} />
      </QueryClientProvider>
    </AddedByHostContext.Provider>,
  );
}
const rows = () => screen.queryAllByTestId("language-row");
const names = () => rows().map((r) => within(r).getByTestId("language-row-value").textContent);
const rowOf = (name: string) => rows().find((r) => within(r).getByTestId("language-row-value").textContent === name)!;
async function addLanguage(typed: string, label: string) {
  const add = await screen.findByRole("button", { name: /Add languages/ });
  // offered once the first read has landed (the button is disabled until then)
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  fireEvent.change(screen.getByRole("combobox", { name: "Add a language" }), { target: { value: typed } });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldLanguageVocab();
  __resetHeldNoteChains();
  __resetLanguageEntries();
  __resetFlags();
  setFlagStore(null);
  geoFlags = {};
  geoCalls.length = 0;
  contact = { tag: "" };
  contactWrites = [];
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  ann = fake.seed("t:Person", { "a:givenName": "Ann" });
  // RuleBaseappSourceIsAdder: the ADDER's own card, in THEIR vault (a card that is not in the vault written to).
  stater.uri = "https://adder.platform.example.test/base/e/vsc-adder";
  BY = { "a:statedBy": { "@id": stater.uri } };
  installFetch();
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  resetTermOrigin();
  tearDown();
});

describe("a held card's language: one held claim, NO rung, never found", () => {
  it("🔴 a language picked from the catalogue is ONE held claim with its flag; the person's record is ⛔ not written; ⛔ no rung, ⛔ no claim subject", async () => {
    const before = JSON.stringify(store.get(tom)!.facts);
    show();
    await addLanguage("Norw", "Norwegian");
    await waitFor(() => expect(claims()).toHaveLength(1));
    expect(claims()[0]![1].facts).toEqual({
      "a:heldParty": { "@id": uriOf(tom) },
      "a:languageUsed": { "@id": NOR },
      "a:statedBy": { "@id": stater.uri },
      "a:flagCountry": { "@id": NORWAY },
      "a:directReader": AGENT,
    });
    expect(JSON.stringify(store.get(tom)!.facts)).toBe(before);
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("🔴 NEVER FOUND: the composer refuses a rung or a claim subject (they are what posts a claim to the network find, and a:languageUsed carries the find key)", async () => {
    const v = await resolveHeldLanguageVocab();
    const ok = heldLanguageFacts(v, { subject: uriOf(tom), language: NOR, stater: stater.uri });
    expect(Object.keys(ok).some((k) => /visibilityTier|claimSubject/.test(k))).toBe(false);
    expect(() => heldLanguageFacts({ ...v, statedBy: "a:visibilityTier" }, { subject: uriOf(tom), language: NOR, stater: stater.uri })).toThrow(HeldLanguageError);
    expect(() => heldLanguageFacts({ ...v, statedBy: "a:claimSubject" }, { subject: uriOf(tom), language: NOR, stater: stater.uri })).toThrow(HeldLanguageError);
    expect(() => heldLanguageFacts(v, { subject: uriOf(tom), language: "Norwegian", stater: stater.uri })).toThrow(HeldLanguageError);
    expect(() => heldLanguageFacts(v, { subject: uriOf(tom), language: NOR, flagCountry: "Norway", stater: stater.uri })).toThrow(HeldLanguageError);
  });

  it("no rung control is drawn on a held card", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    show();
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(screen.queryByRole("button", { name: /^Sharing/ })).toBeNull();
  });

  it("shows THIS person's languages; ⛔ not Ann's, ⛔ not an interest claim", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:languageUsed": { "@id": ENG } });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": "https://veda.platform.example.test/base/t/Sailing" } });
    show();
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
  });

  it("🔴 the held languages of THIS card are every claim about this person, whoever stated it (⛔ not another person's, ⛔ not a claim about two people); only the VIEWER's own are theirs to change", () => {
    const L = (id: string, parties: string[], statedBy: string[]) => ({ id, uri: uriOf(id), heldParties: parties, language: NOR, flagCountry: null, statedBy });
    const tomUri = uriOf(tom);
    const annUri = uriOf(ann);
    const keep = L("k", [tomUri], [stater.uri]);
    const theirs = L("other-adder", [tomUri], ["https://id.platform.example.test/base/p/other"]);
    const oldVaultCard = L("old", [tomUri], [uriOf("vsc-oldvaultcard")]);
    const shown = heldLanguagesAbout([keep, L("ann", [annUri], [stater.uri]), theirs, oldVaultCard, L("two", [tomUri, annUri], [stater.uri]), L("nobody", [], [stater.uri])], tomUri);
    expect(shown.map((l) => l.id)).toEqual(["k", "other-adder", "old"]);
    expect(ownHeldLanguages(shown, stater.uri).map((l) => l.id)).toEqual(["k"]);
    expect(ownHeldLanguages(shown, null)).toEqual([]);
    expect(heldLanguagesAbout([keep], "")).toEqual([]);
  });

  it("a language another adder (or an old vault card) stated is SHOWN with no remove and no flag change; the viewer's own has both", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": "https://id.platform.example.test/base/p/other" }, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": ENG } });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    show();
    await waitFor(() => expect([...names()].sort()).toEqual(["English", "Norwegian"]));
    // The (−) shows only in edit mode, which `show()` opens; the other adder's row has none.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove language Norwegian" })).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Remove language English" })).toBeNull();
    expect(within(rowOf("English")).queryByTestId("language-flag-button")).toBeNull();
    expect(within(rowOf("Norwegian")).queryByTestId("language-flag-button")).not.toBeNull();
  });

  it("a language already on the card is added once", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    show();
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    const add = await screen.findByRole("button", { name: /Add languages/ });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("combobox", { name: "Add a language" }), { target: { value: "Norw" } });
    await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
    expect(claims()).toHaveLength(1);
  });
});

describe("a held card's contact language: marked, first, one write", () => {
  it("🔴 marking English writes the record's contact tag ONCE; English is first with the mark; one mark", async () => {
    show();
    await addLanguage("Norw", "Norwegian");
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    await addLanguage("Engl", "English");
    await waitFor(() => expect(names()).toEqual(["Norwegian", "English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Make English the contact language" }));
    await waitFor(() => expect(names()).toEqual(["English", "Norwegian"]));
    expect(contactWrites).toEqual(["en"]);
    expect(screen.getAllByTestId("language-contact-mark")).toHaveLength(1);
    fireEvent.click(within(rowOf("Norwegian")).getByRole("button", { name: "Make Norwegian the contact language" }));
    await waitFor(() => expect(names()).toEqual(["Norwegian", "English"]));
    expect(contactWrites).toEqual(["en", "no"]);
    expect(screen.getAllByTestId("language-contact-mark")).toHaveLength(1);
  });

  it("the stored 'no-NO' or 'pt-BR' marks the Norwegian or Portuguese entry and is not rewritten", async () => {
    contact = { tag: "pt-BR" };
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": POR } });
    show();
    await waitFor(() => expect(names()).toEqual(["Portuguese", "Norwegian"]));
    expect(rowOf("Portuguese").getAttribute("data-marked")).toBe("true");
    expect(contactWrites).toEqual([]);
  });

  it("🔴 the old single contact language arrives as the marked row (legacy), listed on a tap with no rung to widen", async () => {
    contact = { tag: "no" };
    show();
    const legacy = await screen.findByTestId("language-legacy-row");
    expect(legacy.textContent).toContain("Norwegian (no)");
    await waitFor(() => expect((within(legacy).getByTestId("language-legacy-list") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(legacy).getByTestId("language-legacy-list"));
    await waitFor(() => expect(claims()).toHaveLength(1));
    expect(claims()[0]![1].facts["a:languageUsed"]).toEqual({ "@id": NOR });
    expect(Object.keys(claims()[0]![1].facts).some((k) => /visibilityTier|claimSubject/.test(k))).toBe(false);
    await waitFor(() => expect(screen.queryByTestId("language-legacy-row")).toBeNull());
    expect(rowOf("Norwegian").getAttribute("data-marked")).toBe("true");
    expect(contactWrites).toEqual([]);
  });

  it("a card with no contact-language field offers no mark (nothing can be written), and says nothing false", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    render(
      <AddedByHostContext.Provider value={{ useShell: () => null }}>
        <QueryClientProvider client={qc}>
          <LanguageSection vaultId={VAULT} principal={AGENT} recordEntityUri={uriOf(tom)} canEdit contactTag="" writeContact={null} />
        </QueryClientProvider>
      </AddedByHostContext.Provider>,
    );
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    fireEvent.click(within(rowOf("Norwegian")).getByRole("button", { name: "Make Norwegian the contact language" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("language-contact-mark")).toBeNull();
  });
});

describe("a held card's delete is the shared red round (−) at the left", () => {
  it("the (−) is the row's FIRST element and removes that claim only; ⛔ Ann's claim for the same language stays", async () => {
    const a = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    const b = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": POR } });
    const c = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:languageUsed": { "@id": NOR } });
    show();
    await waitFor(() => expect(names()).toEqual(["Norwegian", "Portuguese"]));
    const btn = within(rowOf("Norwegian")).getByRole("button", { name: "Remove language Norwegian" });
    expect(btn.getAttribute("data-remove-control")).toBe("minus-circle");
    expect(btn.textContent).toBe("");
    // ⛔ no button on the card draws a text ×, ✕ or −
    expect(screen.queryAllByRole("button").filter((b) => /^[×✕−x]$/i.test((b.textContent ?? "").trim()))).toHaveLength(0);
    expect((rowOf("Norwegian").firstElementChild as HTMLElement).firstElementChild).toBe(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(store.has(a)).toBe(false));
    expect(store.has(b)).toBe(true);
    expect(store.has(c)).toBe(true);
  });

  it("🔴 removing the marked entry clears the mark by one write of the record's contact tag; an unmarked one leaves it", async () => {
    contact = { tag: "no" };
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": POR } });
    show();
    await waitFor(() => expect(names()).toEqual(["Norwegian", "Portuguese"]));
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Remove language Portuguese" }));
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(contactWrites).toEqual([]);
    fireEvent.click(within(rowOf("Norwegian")).getByRole("button", { name: "Remove language Norwegian" }));
    await waitFor(() => expect(contactWrites).toEqual([""]));
  });

  it("a card the person may not edit shows no (−), no add, no flag change… the list only", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    show(false);
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(screen.queryByRole("button", { name: /^Remove language/ })).toBeNull();
  });
});

describe("a held card's flag: the language's country, a short choice, or the globe", () => {
  it("🔴 reads the flag from GilbGeo and draws it; against the real geo as it is today (no flag written) the globe shows and nothing breaks", async () => {
    show();
    await addLanguage("Norw", "Norwegian");
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    await waitFor(() => expect(geoCalls.length).toBeGreaterThan(0));
    expect(within(rowOf("Norwegian")).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    __resetFlags();
    geoFlags = { "flag-osm-r-2978650": { code: "no", svg: SVG("#ed2939") } };
    show();
    await waitFor(() => expect(within(rowOf("Norwegian")).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("flag"));
    expect(within(rowOf("Norwegian")).getByRole("img", { name: "Flag of Norway" })).toBeTruthy();
  });

  it("🔴 a language in several countries opens a short choice at once; the pick is saved with the claim and kept after a reload; changing it is one PATCH", async () => {
    geoFlags = { "flag-osm-r-148838": { code: "us", svg: SVG("#3c3b6e") } };
    show();
    await addLanguage("Engl", "English");
    const chooser = await screen.findByTestId("flag-chooser");
    expect(within(chooser).getAllByTestId("flag-choice")).toHaveLength(3);
    fireEvent.click(await within(chooser).findByRole("button", { name: "Use the flag of United States" }));
    await waitFor(() => expect(claims()[0]![1].facts["a:flagCountry"]).toEqual({ "@id": USA }));
    cleanup();
    __resetFlags();
    __resetHeldNoteChains();
    show();
    await waitFor(() => expect(names()).toEqual(["English"]));
    await waitFor(() => expect(within(rowOf("English")).getByTestId("flag-image").getAttribute("data-flag-country")).toBe(USA));
    const patches = fake.patchRecord.mock.calls.length;
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the flag of osm-r-80500" }));
    await waitFor(() => expect(claims()[0]![1].facts["a:flagCountry"]).toEqual({ "@id": AUS }));
    expect(fake.patchRecord.mock.calls.length).toBe(patches + 1);
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByTestId("flag-none"));
    await waitFor(() => expect("a:flagCountry" in claims()[0]![1].facts).toBe(false));
    expect(claims()[0]![1].facts["a:languageUsed"]).toEqual({ "@id": ENG });
  });

  it("a language with no country shows the globe and saves no flag", async () => {
    show();
    await addLanguage("Port", "Portuguese");
    await waitFor(() => expect(names()).toEqual(["Portuguese"]));
    expect(within(rowOf("Portuguese")).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("globe");
    expect("a:flagCountry" in claims()[0]![1].facts).toBe(false);
  });
});

describe("a held card — reload shows the same list, order and flags", () => {
  it("Norwegian + English added, English marked and its flag changed: after a remount the same list returns", async () => {
    geoFlags = { "flag-osm-r-2978650": { code: "no", svg: SVG("#ed2939") }, "flag-osm-r-148838": { code: "us", svg: SVG("#3c3b6e") } };
    show();
    await addLanguage("Norw", "Norwegian");
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    await addLanguage("Engl", "English");
    fireEvent.click(await within(await screen.findByTestId("flag-chooser")).findByRole("button", { name: "Use the flag of osm-r-62149" }));
    await waitFor(() => expect(names()).toEqual(["Norwegian", "English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Make English the contact language" }));
    await waitFor(() => expect(names()).toEqual(["English", "Norwegian"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the flag of United States" }));
    await waitFor(() => expect(within(rowOf("English")).getByTestId("flag-image").getAttribute("data-flag-country")).toBe(USA));
    cleanup();
    __resetFlags();
    __resetLanguageEntries();
    __resetHeldNoteChains();
    show();
    await waitFor(() => expect(names()).toEqual(["English", "Norwegian"]));
    expect(rowOf("English").getAttribute("data-marked")).toBe("true");
    await waitFor(() => expect(within(rowOf("English")).getByTestId("flag-image").getAttribute("data-flag-country")).toBe(USA));
    await waitFor(() => expect(within(rowOf("Norwegian")).getByTestId("flag-image").getAttribute("data-flag-state")).toBe("flag"));
  });
});

describe("a held card's failures are said, never shown as saved", () => {
  it("a store that answers but does not keep the claim: said, not added", async () => {
    fake.createRecord.mockImplementationOnce(async () => ({ id: "ghost", etag: '"x"' }));
    show();
    await addLanguage("Norw", "Norwegian");
    expect((await screen.findByTestId("language-error")).textContent).toMatch(/did not keep it|could not/);
  });
});

describe("SB1b-1 LanguageSection — the 'who sees this' switch on a language the viewer added", () => {
  it("the viewer's language offers 'Make private to me only' -> private in one PATCH -> label 'Only you see this' and 'Everyone in this vault' -> back; another adder's language has no switch", async () => {
    const mine = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": "https://id.platform.example.test/base/p/other" }, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": ENG } });
    show();
    await waitFor(() => expect([...names()].sort()).toEqual(["English", "Norwegian"]));
    await waitFor(() => expect(within(rowOf("Norwegian")).queryByRole("button", { name: /private to me only/ })).not.toBeNull());
    expect(within(rowOf("English")).queryByTestId("held-visibility")).toBeNull();
    fireEvent.click(within(rowOf("Norwegian")).getByRole("button", { name: /private to me only/ }));
    await waitFor(() => expect(store.get(mine)!.facts["a:visibilityTier"]).toBe("private"));
    expect(fake.patchRecord.mock.calls.filter((c) => c[0] === mine)).toHaveLength(1);
    expect((await within(rowOf("Norwegian")).findByTestId("held-private-label")).textContent).toBe("Only you see this");
    fireEvent.click(within(rowOf("Norwegian")).getByRole("button", { name: /to everyone in this vault/ }));
    await waitFor(() => expect("a:visibilityTier" in store.get(mine)!.facts).toBe(false));
    await waitFor(() => expect(within(rowOf("Norwegian")).queryByTestId("held-private-label")).toBeNull());
  });
});

describe("SB1b-2 LanguageSection — 'Added by <name>' on a language", () => {
  const ANNA = "https://anna.platform.example.test/base/e/vsc-anna";
  beforeEach(() => __resetAddedByForTest());

  it("another adder's language shows 'Added by Anna Berg' (a link to her card); the viewer's own shows 'Added by you', no link; one request, for hers only", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": NOR } });
    const hers = fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": ANNA }, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": ENG } });
    const rig = installSourceName((items) => ({ [items[0]!]: { statedBy: ANNA, name: "Anna Berg" } }));
    try {
      show();
      await waitFor(() => expect([...names()].sort()).toEqual(["English", "Norwegian"]));
      await waitFor(() => expect(within(rowOf("English")).getByTestId("added-by").textContent).toBe("Added by Anna Berg"));
      expect(within(rowOf("English")).getByTestId("added-by-link").getAttribute("href")).toBe(ANNA);
      await waitFor(() => expect(within(rowOf("Norwegian")).getByTestId("added-by").textContent).toBe("Added by you"));
      expect(within(rowOf("Norwegian")).queryByTestId("added-by-link")).toBeNull();
      await new Promise((r) => setTimeout(r, 60));
      expect(rig.calls).toEqual([[uriOf(hers)]]);
    } finally {
      rig.restore();
    }
  });

  it("not disclosed (null/null) and an older platform (404 on the route) show nothing for the language", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": ANNA }, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": ENG } });
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    for (const answer of [() => ({}), () => 404] as const) {
      __resetAddedByForTest();
      const rig = installSourceName(answer);
      const sizeBefore = rig.calls.length;
      try {
        const r = show();
        await waitFor(() => expect([...names()]).toEqual(["English"]));
        await waitFor(() => expect(rig.calls.length).toBe(sizeBefore + 1));
        await new Promise((x) => setTimeout(x, 60));
        expect(screen.queryByTestId("added-by")).toBeNull();
        expect(screen.queryByText(/unknown/i)).toBeNull();
        r.unmount();
      } finally {
        rig.restore();
      }
    }
    debug.mockRestore();
  });
});
