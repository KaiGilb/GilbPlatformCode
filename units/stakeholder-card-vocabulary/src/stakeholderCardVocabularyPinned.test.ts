// The unit's exports pinned, with a fake host and the fixture master. The ported tests are in carrierPage.test.ts and storedVocabulary.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStakeholderKindReader, KIND_SET_MAX_AGE_MS, type StakeholderKindReader } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterSource, type TermFetch } from "@kaigilb/gilbplatformcode-vocabulary-source";
import * as unit from "./index";
import {
  CARD_CARRIER_PAGE_SIZE,
  cardMasterSource,
  masterFetch,
  readStakeholderCardVocabulary,
  readStoredCardVocabulary,
  referenceReadingQuery,
  stakeholderCardVocabularyQuery,
  stakeholderCardVocabularyQueryKey,
  stakeholderReferenceReadingQueryKey,
  storeCardVocabulary,
  type CardVocabularyHost,
  type StakeholderCardVocabulary,
} from "./stakeholderCardVocabulary";
import { fixtureMaster, ID, RIG } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { memoryStorage } from "../test/memoryStorage";

const OTHER = "https://ontology.other.example.test";

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin(ID);
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
});

function master() {
  const m = withReferenceTerms(fixtureMaster());
  const hostFetch: TermFetch = (url, init) => m.fetch(url.replace(ID, RIG), init);
  return { m, hostFetch };
}
/** The reader the page would hand over: a memory-only one over a fetch, as the app's `masterKindReader(fetchImpl)` builds it. */
const readerOver = (fetchImpl: TermFetch): StakeholderKindReader =>
  createStakeholderKindReader({ source: masterSource({ vedaOrigin: ID, fetchImpl }), origin: ID, store: null, defer: () => {} });
const reading = (over: Partial<StakeholderCardVocabulary> = {}): StakeholderCardVocabulary =>
  ({ kindNames: ["Person"], kindsComplete: true, fieldSets: { byKind: {} }, fieldSetsRefusal: null, ...over }) as unknown as StakeholderCardVocabulary;

describe("the export list", () => {
  it("is exactly the source's names plus the three the origin getters make", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CARD_CARRIER_PAGE_SIZE",
        "cardMasterSource",
        "masterFetch",
        "readStakeholderCardVocabulary",
        "readStoredCardVocabulary",
        "referenceReadingQuery",
        "stakeholderCardVocabularyQuery",
        "stakeholderCardVocabularyQueryKey",
        "stakeholderReferenceReadingQueryKey",
        "storeCardVocabulary",
      ].sort(),
    );
  });
});

describe("the origin is read when it is needed", () => {
  it("the two query keys follow termOrigin()", () => {
    expect(stakeholderCardVocabularyQueryKey()).toEqual(["gilb-stakeholders", "card-vocabulary", ID]);
    expect(stakeholderReferenceReadingQueryKey()).toEqual(["gilb-stakeholders", "reference-reading", ID]);
    setTermOrigin(OTHER);
    expect(stakeholderCardVocabularyQueryKey()).toEqual(["gilb-stakeholders", "card-vocabulary", OTHER]);
    expect(stakeholderReferenceReadingQueryKey()).toEqual(["gilb-stakeholders", "reference-reading", OTHER]);
  });
  it("without a set origin, each throws the setting's own error", () => {
    resetTermOrigin();
    expect(() => stakeholderCardVocabularyQueryKey()).toThrow(/term-origin/);
    expect(() => stakeholderReferenceReadingQueryKey()).toThrow(/term-origin/);
    expect(() => cardMasterSource()).toThrow(/term-origin/);
    expect(() => storeCardVocabulary(reading(), true)).toThrow(/term-origin/);
    expect(() => readStoredCardVocabulary(true)).toThrow(/term-origin/);
  });
  it("the device copy is kept under a key that names the origin set at the time of the call", () => {
    storeCardVocabulary(reading(), true);
    expect(localStorage.getItem(`gilbapp.cardVocabulary.v1.${ID}`)).not.toBeNull();
    setTermOrigin(OTHER);
    expect(readStoredCardVocabulary(true)).toBeUndefined();
    storeCardVocabulary(reading({ kindNames: ["Org"] }), true);
    expect(localStorage.getItem(`gilbapp.cardVocabulary.v1.${OTHER}`)).not.toBeNull();
    setTermOrigin(ID);
    expect(readStoredCardVocabulary(true)?.kindNames).toEqual(["Person"]);
  });
  it("cardMasterSource reads the master at the set origin", async () => {
    setTermOrigin(OTHER);
    const urls: string[] = [];
    const fetchImpl: TermFetch = async (url) => (urls.push(url), new Response("{}", { status: 404 }));
    await cardMasterSource(fetchImpl).carriersOf(["a:fieldOf"]).catch(() => undefined);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith(OTHER))).toBe(true);
  });
});

describe("masterFetch", () => {
  it("passes the url and the whole request init on to the inner fetch", async () => {
    const seen: unknown[][] = [];
    const inner: TermFetch = async (url, init) => (seen.push([url, init]), new Response("{}"));
    const init = { cache: "no-cache" as const, headers: { accept: "application/json" } };
    await masterFetch(inner)("https://x.example.test/a", init);
    expect(seen).toEqual([["https://x.example.test/a", init]]);
  });
  it("without an inner fetch it uses the global fetch", async () => {
    const g = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", g);
    await masterFetch()("https://x.example.test/b", { cache: "no-cache" });
    expect(g).toHaveBeenCalledWith("https://x.example.test/b", { cache: "no-cache" });
  });
});

describe("readStakeholderCardVocabulary", () => {
  it("reads the kinds and the field sets from the master; the shortcut steps are keyed by each shortcut's name", async () => {
    const { hostFetch } = master();
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch), readerOver(hostFetch));
    expect(v.kindNames.length).toBeGreaterThan(0);
    expect(new Set(v.kindNames).size).toBe(v.kindNames.length);
    expect(v.kindsComplete).toBe(true);
    expect(v.fieldSets).not.toBeNull();
    expect(v.fieldSetsRefusal).toBeNull();
    expect(Object.keys(v.shortcutSteps ?? {}).sort()).toEqual((v.createShortcuts ?? []).map((s) => s.name).sort());
    for (const s of v.createShortcuts ?? []) expect(Object.keys(s).sort()).toEqual(["label", "name", "term"]);
  });
  it("lists each kind name once and leaves out an empty one, in served order", async () => {
    const { hostFetch } = master();
    const real = readerOver(hostFetch);
    const set = await real.get();
    const reader = { ...real, get: async () => ({ ...set, names: ["Person", "", "Person", "Org", "Person"] }) } as StakeholderKindReader;
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch), reader);
    expect(v.kindNames).toEqual(["Person", "Org"]);
    expect(v.roleLabel).toBe(set.roleLabel);
  });
  it("on a master without the carrier selector it keeps the kinds and says the fields are not known yet", async () => {
    const { m, hostFetch } = master();
    m.selector = false;
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch), readerOver(hostFetch));
    expect(v.fieldSets).toBeNull();
    expect(v.fieldSetsRefusal).toMatch(/^not known yet: /);
    expect(v.kindNames.length).toBeGreaterThan(0);
  });
  it("a failure that is not the package's 'not known yet' is rethrown, not dressed up as one", async () => {
    const { hostFetch } = master();
    const real = readerOver(hostFetch);
    const boom = new Error("a defect");
    const source = { ...cardMasterSource(hostFetch), carriersOf: async () => Promise.reject(boom) };
    await expect(readStakeholderCardVocabulary(source as never, real)).rejects.toBe(boom);
  });
  it("a kinds read that fails rejects, so the card cannot take a stakeholder kind for another type", async () => {
    const { hostFetch } = master();
    const reader = { ...readerOver(hostFetch), get: async () => Promise.reject(new Error("kinds down")) } as StakeholderKindReader;
    await expect(readStakeholderCardVocabulary(cardMasterSource(hostFetch), reader)).rejects.toThrow("kinds down");
  });
  it("without a reader it makes a memory-only one over the source and keeps nothing", async () => {
    const { hostFetch } = master();
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch));
    expect(v.kindNames.length).toBeGreaterThan(0);
    expect(localStorage.length).toBe(0);
  });
});

describe("the device copy", () => {
  it("stores a reading with field sets, and a reading without them is never stored", () => {
    storeCardVocabulary(reading({ fieldSets: null, fieldSetsRefusal: "refused" }), true);
    expect(localStorage.length).toBe(0);
    storeCardVocabulary(reading(), true);
    expect(localStorage.length).toBe(1);
  });
  it("a stored copy without a kind list, or without field sets, or damaged, reads as nothing", () => {
    const key = `gilbapp.cardVocabulary.v1.${ID}`;
    for (const raw of ["{not json", "null", JSON.stringify({ kindNames: "Person", fieldSets: {} }), JSON.stringify({ kindNames: [], fieldSets: null }), ""]) {
      localStorage.setItem(key, raw);
      expect(readStoredCardVocabulary(true), raw).toBeUndefined();
    }
  });
  it("reads and stores under a key of the caller's choice", () => {
    storeCardVocabulary(reading({ kindNames: ["Mine"] }), true, "my-key");
    expect(localStorage.getItem("my-key")).not.toBeNull();
    expect(readStoredCardVocabulary(true, "my-key")?.kindNames).toEqual(["Mine"]);
    expect(readStoredCardVocabulary(true)).toBeUndefined();
  });
  it("with no localStorage there is nothing to read and nothing to fail on store", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readStoredCardVocabulary(true)).toBeUndefined();
    expect(() => storeCardVocabulary(reading(), true)).not.toThrow();
  });
  it("a store that refuses the write costs only the warm start", () => {
    vi.stubGlobal("localStorage", { ...memoryStorage(), setItem: () => { throw new Error("quota"); } });
    expect(() => storeCardVocabulary(reading(), true)).not.toThrow();
  });
  it("with no host it persists, as production does", () => {
    storeCardVocabulary(reading());
    expect(readStoredCardVocabulary()?.kindNames).toEqual(["Person"]);
  });
  it("a host whose persistVocabulary says no keeps nothing and reads nothing, unless forced", () => {
    const off = { persistVocabulary: () => false };
    storeCardVocabulary(reading(), false, undefined, off);
    expect(localStorage.length).toBe(0);
    storeCardVocabulary(reading(), true, undefined, off);
    expect(localStorage.length).toBe(1);
    expect(readStoredCardVocabulary(false, undefined, off)).toBeUndefined();
    expect(readStoredCardVocabulary(true, undefined, off)?.kindNames).toEqual(["Person"]);
  });
  it("a host whose persistVocabulary says yes, or has none, persists; it is asked at each call", () => {
    let on = false;
    const host = { persistVocabulary: vi.fn(() => on) };
    storeCardVocabulary(reading(), false, undefined, host);
    expect(localStorage.length).toBe(0);
    on = true;
    storeCardVocabulary(reading(), false, undefined, host);
    expect(localStorage.length).toBe(1);
    expect(host.persistVocabulary).toHaveBeenCalledTimes(2);
    expect(readStoredCardVocabulary(false, undefined, {})?.kindNames).toEqual(["Person"]);
  });
});

describe("stakeholderCardVocabularyQuery", () => {
  const hostOver = (fetchImpl: TermFetch, extra: Partial<CardVocabularyHost> = {}) => {
    const asked: (TermFetch | undefined)[] = [];
    const host: CardVocabularyHost = { masterKindReader: (f) => (asked.push(f), readerOver(fetchImpl)), ...extra };
    return { host, asked };
  };
  it("is held for the session: never stale, never collected, never retried or re-read", () => {
    const { host } = hostOver(master().hostFetch);
    const q = stakeholderCardVocabularyQuery(host);
    expect(q).toMatchObject({
      queryKey: ["gilb-stakeholders", "card-vocabulary", ID],
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      retryOnMount: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  });
  it("its key is read each time the options are made", () => {
    const { host } = hostOver(master().hostFetch);
    setTermOrigin(OTHER);
    expect(stakeholderCardVocabularyQuery(host).queryKey).toEqual(["gilb-stakeholders", "card-vocabulary", OTHER]);
  });
  it("queryFn asks the host for a reader over the fetch it was given, reads, and keeps the reading on the device", async () => {
    const { hostFetch } = master();
    const { host, asked } = hostOver(hostFetch);
    const v = await stakeholderCardVocabularyQuery(host, hostFetch).queryFn();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toEqual(expect.any(Function));
    expect(v.fieldSets).not.toBeNull();
    expect(localStorage.getItem(`gilbapp.cardVocabulary.v1.${ID}`)).toBe(JSON.stringify(v));
  });
  it("the fetch the host's reader gets passes the request init on", async () => {
    const { hostFetch } = master();
    const inits: (RequestInit | undefined)[] = [];
    const { host, asked } = hostOver(hostFetch);
    await stakeholderCardVocabularyQuery(host, (u, i) => (inits.push(i), hostFetch(u, i))).queryFn();
    await asked[0]!("https://x.example.test/probe", { cache: "no-cache" }).catch(() => undefined);
    expect(inits.some((i) => i?.cache === "no-cache")).toBe(true);
  });
  it("a host that does not persist keeps nothing; the placeholder is the stored copy, or nothing", async () => {
    const { hostFetch } = master();
    const { host } = hostOver(hostFetch, { persistVocabulary: () => false });
    const q = stakeholderCardVocabularyQuery(host, hostFetch);
    await q.queryFn();
    expect(localStorage.length).toBe(0);
    expect(q.placeholderData()).toBeUndefined();
    storeCardVocabulary(reading({ kindNames: ["Kept"] }), true);
    expect(q.placeholderData()).toBeUndefined();
    const { host: on } = hostOver(hostFetch);
    expect(stakeholderCardVocabularyQuery(on, hostFetch).placeholderData()?.kindNames).toEqual(["Kept"]);
  });
});

describe("referenceReadingQuery", () => {
  it("is kept for the readers' own max age and never retried, under the reference key", async () => {
    const { hostFetch } = master();
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch), readerOver(hostFetch));
    const q = referenceReadingQuery(v.fieldSets!, hostFetch);
    expect(q).toMatchObject({ queryKey: ["gilb-stakeholders", "reference-reading", ID], staleTime: KIND_SET_MAX_AGE_MS, gcTime: Infinity, retry: false });
    setTermOrigin(OTHER);
    expect(referenceReadingQuery(v.fieldSets!, hostFetch).queryKey).toEqual(["gilb-stakeholders", "reference-reading", OTHER]);
  });
  it("with a fetch of its own it reads through memory-only readers over it", async () => {
    const { m, hostFetch } = master();
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch), readerOver(hostFetch));
    const r = await referenceReadingQuery(v.fieldSets!, hostFetch).queryFn();
    expect(r).toBeTruthy();
    expect(m.requested.length).toBeGreaterThan(0);
    expect(localStorage.length).toBe(0);
  });
  it("without a fetch of its own it reads the master at the set origin through the global fetch", async () => {
    const { hostFetch } = master();
    const v = await readStakeholderCardVocabulary(cardMasterSource(hostFetch), readerOver(hostFetch));
    setTermOrigin(OTHER);
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (urls.push(String(url)), new Response("{}", { status: 404 })));
    await referenceReadingQuery(v.fieldSets!).queryFn().catch(() => undefined);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith(OTHER))).toBe(true);
  });
});

describe("CARD_CARRIER_PAGE_SIZE", () => {
  it("is 400", () => expect(CARD_CARRIER_PAGE_SIZE).toBe(400));
});
