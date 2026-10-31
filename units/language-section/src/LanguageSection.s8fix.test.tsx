// @vitest-environment jsdom
// Ported from the source's `LanguageSection.s8fix.test.tsx` (10 cases; F1, F2, F3, F5, F7). Re-based as `LanguageSection.s8lang.test.tsx` is: the real peers over a fake platform
// at the level of `fetch`, the example hosts, no `__resetGeoCache`. The cases, including the F3 assertion that no country entity is ever requested, are the source's.
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
const ARA = "https://veda.platform.example.test/base/e/ara000000001";
const ARB = "https://veda.platform.example.test/base/e/arb000000001";
const NORWAY = "https://geo.platform.example.test/base/e/osm-r-2978650";
const UK = "https://geo.platform.example.test/base/e/osm-r-62149";
const USA = "https://geo.platform.example.test/base/e/osm-r-148838";
const AUS = "https://geo.platform.example.test/base/e/osm-r-80500";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim" && "a:languageUsed" in e.facts);

const CATALOGUE: Record<string, { label: string; iso6393Code: string; languageCountry?: string[] }> = {
  [NOR]: { label: "Norwegian", iso6393Code: "nor", languageCountry: [NORWAY] },
  [ENG]: { label: "English", iso6393Code: "eng", languageCountry: [UK, USA, AUS] },
  [POR]: { label: "Portuguese", iso6393Code: "por" },
  [ARA]: { label: "Arabic", iso6393Code: "ara" },
  [ARB]: { label: "Standard Arabic", iso6393Code: "arb" },
};
let failing = new Set<string>();
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
    if (entry && failing.has(entry)) return json({}, 503);
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
let BY: Record<string, unknown>;
/** The record's own `a:contactLanguage`, and every write the card made to it. Survives a "reload". */
let contact = { tag: "" };
let contactWrites: string[] = [];

/** How long the record's own save takes to show the new contact tag (0 = at once). */
let contactLandsAfterMs = 0;
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
        const land = () => {
          contact.tag = t;
          setTag(t);
        };
        if (contactLandsAfterMs > 0) setTimeout(land, contactLandsAfterMs);
        else land();
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
beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldLanguageVocab();
  __resetHeldNoteChains();
  __resetLanguageEntries();
  __resetFetchPool();
  __resetFlags();
  setFlagStore(null);
  geoFlags = {};
  failing = new Set();
  contactLandsAfterMs = 0;
  geoCalls.length = 0;
  contact = { tag: "" };
  contactWrites = [];
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  BY = { "a:statedBy": { "@id": stater.uri } };
  installFetch();
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  resetTermOrigin();
  tearDown();
});

const held = (language: string, extra: Record<string, unknown> = {}) =>
  fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": language }, ...extra });
const claimsFor = (language: string) => claims().filter(([, e]) => (e.facts["a:languageUsed"] as { "@id": string })["@id"] === language);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Make the next delete take `ms`, so two acts overlap. */
function slowNextDelete(ms: number) {
  const real = fake.deleteRecord.getMockImplementation()!;
  fake.deleteRecord.mockImplementationOnce(async (...a: Parameters<typeof real>) => {
    await sleep(ms);
    return real(...a);
  });
}

describe("🔴 F1 · one entry = one row (a held card: two claims for one language)", () => {
  it("two claims for one entry are ONE row; Remove takes both", async () => {
    const a = held(ENG);
    const b = held(ENG);
    held(NOR);
    show();
    await waitFor(() => expect(names()).toEqual(["English", "Norwegian"]));
    expect(rows()).toHaveLength(2);
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Remove language English" }));
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(store.has(a)).toBe(false);
    expect(store.has(b)).toBe(false);
    expect(claimsFor(ENG)).toHaveLength(0);
  });

  it("a flag goes on EVERY claim for the entry", async () => {
    const a = held(ENG);
    const b = held(ENG);
    show();
    await waitFor(() => expect(names()).toEqual(["English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the flag of osm-r-80500" }));
    await waitFor(() => expect(store.get(a)!.facts["a:flagCountry"]).toEqual({ "@id": AUS }));
    expect(store.get(b)!.facts["a:flagCountry"]).toEqual({ "@id": AUS });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("🔴 F2 · overlapping acts leave the mark the person last chose", () => {
  it("removing the MARKED entry while marking ANOTHER: the new mark is not wiped; the record's contact tag is written ONCE", async () => {
    held(ENG);
    held(POR);
    contact.tag = "en";
    show();
    await waitFor(() => expect(names()).toEqual(["English", "Portuguese"]));
    slowNextDelete(150);
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Remove language English" }));
    await sleep(30);
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Make Portuguese the contact language" }));
    await waitFor(() => expect(claimsFor(ENG)).toHaveLength(0));
    await sleep(400);
    expect(contactWrites).toEqual(["pt"]);
    expect(contact.tag).toBe("pt");
    await waitFor(() => expect(names()).toEqual(["Portuguese"]));
    expect(rowOf("Portuguese").getAttribute("data-marked")).toBe("true");
  });

  it("even when the record's own save shows the new tag LATER than the removal finishes: the new mark is not wiped (the intent is recorded at once)", async () => {
    held(ENG);
    held(POR);
    contact.tag = "en";
    show();
    await waitFor(() => expect(names()).toEqual(["English", "Portuguese"]));
    contactLandsAfterMs = 400;
    slowNextDelete(150);
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Remove language English" }));
    await sleep(30);
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Make Portuguese the contact language" }));
    await waitFor(() => expect(claimsFor(ENG)).toHaveLength(0));
    await sleep(700);
    expect(contactWrites).toEqual(["pt"]);
    expect(contact.tag).toBe("pt");
  });

  it("an entry marked while its own removal is in flight: the removal clears that mark (⛔ a mark left on a language that is gone)", async () => {
    held(ENG);
    held(POR);
    contact.tag = "en";
    show();
    await waitFor(() => expect(names()).toEqual(["English", "Portuguese"]));
    slowNextDelete(150);
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Remove language Portuguese" }));
    await sleep(30);
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Make Portuguese the contact language" }));
    await waitFor(() => expect(claimsFor(POR)).toHaveLength(0));
    await sleep(300);
    expect(contactWrites).toEqual(["pt", ""]);
    expect(contact.tag).toBe("");
    await waitFor(() => expect(names()).toEqual(["English"]));
  });

  it("no overlap: removing the marked entry still clears the mark by one write; removing an unmarked one leaves it", async () => {
    held(ENG);
    held(POR);
    contact.tag = "en";
    show();
    await waitFor(() => expect(names()).toEqual(["English", "Portuguese"]));
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Remove language Portuguese" }));
    await waitFor(() => expect(names()).toEqual(["English"]));
    expect(contactWrites).toEqual([]);
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Remove language English" }));
    await waitFor(() => expect(contactWrites).toEqual([""]));
  });
});

describe("🔴 F3 · the flag chooser never downloads a country entity", () => {
  it("a language naming three countries, no flag file at geo: only the small flag files are asked, names are the local ids", async () => {
    held(ENG);
    show();
    await waitFor(() => expect(names()).toEqual(["English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    const chooser = await screen.findByTestId("flag-chooser");
    await waitFor(() => expect(geoCalls.length).toBeGreaterThan(0));
    await sleep(60);
    expect(within(chooser).getAllByTestId("flag-choice")).toHaveLength(3);
    expect(within(chooser).getByRole("button", { name: "Use the flag of osm-r-62149" })).toBeTruthy();
    for (const url of geoCalls) expect(url, "a country entity was asked for").toMatch(/\/(files|base\/e)\/flag-osm-r-\d+$/);
    for (const c of [UK, USA, AUS, NORWAY]) expect(geoCalls).not.toContain(c);
  });
});

describe("🔴 F5 · a failed catalogue read is said, and the contact language is never called unmatched on it", () => {
  it("the catalogue down: ONE line with Try again, ⛔ no 'unmatched' legacy row; back up, the names and the mark return", async () => {
    held(ENG);
    held(POR);
    contact.tag = "en";
    failing = new Set([ENG, POR]);
    show();
    const msg = await screen.findByTestId("languages-catalogue-error");
    expect(msg.textContent).toMatch(/Some language names could not be read from the language list right now\./);
    expect(screen.queryByTestId("language-legacy-row")).toBeNull();
    failing = new Set();
    fireEvent.click(within(msg).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(names()).toEqual(["English", "Portuguese"]));
    expect(rowOf("English").getAttribute("data-marked")).toBe("true");
    expect(screen.queryByTestId("languages-catalogue-error")).toBeNull();
    expect(screen.queryByTestId("language-legacy-row")).toBeNull();
  });

  it("a legacy value with no listed entry still shows at once as the marked legacy row", async () => {
    contact.tag = "no";
    show();
    expect((await screen.findByTestId("language-legacy-row")).textContent).toContain("Norwegian (no)");
  });
});

describe("🔴 F7 · two entries that share a primary subtag: the second can be marked", () => {
  it("'Make contact language' on the second writes that entry's own code, marks it, and moves back; one mark each time", async () => {
    held(ARA);
    held(ARB);
    show();
    await waitFor(() => expect(names()).toEqual(["Arabic", "Standard Arabic"]));
    fireEvent.click(within(rowOf("Standard Arabic")).getByRole("button", { name: "Make Standard Arabic the contact language" }));
    await waitFor(() => expect(names()).toEqual(["Standard Arabic", "Arabic"]));
    expect(contactWrites).toEqual(["arb"]);
    expect(screen.getAllByTestId("language-contact-mark")).toHaveLength(1);
    fireEvent.click(within(rowOf("Arabic")).getByRole("button", { name: "Make Arabic the contact language" }));
    await waitFor(() => expect(names()).toEqual(["Arabic", "Standard Arabic"]));
    expect(contactWrites).toEqual(["arb", "ara"]);
    expect(rowOf("Arabic").getAttribute("data-marked")).toBe("true");
    expect(screen.getAllByTestId("language-contact-mark")).toHaveLength(1);
  });
});
