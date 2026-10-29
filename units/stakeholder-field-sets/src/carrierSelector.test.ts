// Ported from `gilb-stakeholders` `test/carrierSelector-22c.test.ts` at 0a261488: 16 of its 17 tests (the one left out reads the app's cached
// vocabulary, `createStakeholderVocabulary`, which is not in this unit).
// `carriersOf` asks the master's predicate-carrier selector in one request; it refuses an answer that was not narrowed; the read checks back
// with the master on each load. The fixture master emulates the selector (`test/support.ts` `carrierRead`), and with `selector = false` it
// is a master without it, which ignores the key and pages the whole listing.
//
// Named checks:
//   C1  one request for the declarations, and the field sets equal the whole walk's (the known answer, computed through `carriers: "walk"`
//       on the same master, and checked against literals)
//   C2  an answer that was not narrowed is refused "not known yet", after one request, never walked
//   C3  every page of a narrowed read must say so; a page that does not is refused
//   C4  the narrowed read pages with `limit` and follows `next` on the rig origin
//   C5  every master read is sent with cache mode `no-cache`
//   C6  a field added with `a:fieldOf` shows after a reload inside the cache hour (a browser-like HTTP cache in front of the master), with
//       the control that the cache does hide it otherwise
//   C7  an app that injects no fetch checks back too
import { describe, it, expect, vi, afterEach } from "vitest";
import { CarrierSelectorMissingError, VocabularyUnavailableError, masterSource, type MasterSourceOptions, type TermFetch } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolvePredicates } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, type FixtureMaster } from "../test/support";

const source = (m: FixtureMaster, opts: Partial<MasterSourceOptions> = {}) =>
  masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch, ...opts });
// The declarations listing only: the named type reads (`?status=all&type=…`) are not it.
const listingCalls = (m: FixtureMaster) => m.requested.filter((u) => u.includes("/base/vocab?") && !new URL(u).searchParams.has("type"));
const fieldsOf = (sets: Awaited<ReturnType<typeof resolveFieldSets>>, kind: string) =>
  sets.byKind[t(kind)]!.fields.map((f) => f.term);
const SELECTOR_URL = `${RIG}/base/vocab?status=all&carries=a%3AfieldOf&limit=100`;

describe("C1: one narrowed request, and the same field sets as the whole walk", () => {
  it("asks the selector once, by the predicate's own served spelling", async () => {
    const m = fixtureMaster();
    const sets = await resolveFieldSets(source(m));
    expect(listingCalls(m)).toEqual([SELECTOR_URL]);
    expect(sets.complete).toBe(true);
  });

  it("the field sets equal the whole walk's, kind by kind (the known answer)", async () => {
    const narrowed = await resolveFieldSets(source(fixtureMaster()));
    const walked = await resolveFieldSets(source(fixtureMaster(), { carriers: "walk" }));
    expect(Object.keys(narrowed.byKind).sort()).toEqual(Object.keys(walked.byKind).sort());
    for (const kind of Object.keys(walked.byKind)) expect(narrowed.byKind[kind]).toEqual(walked.byKind[kind]);
    // And both equal the fixture's intent, so a walk that is itself wrong cannot agree.
    expect(fieldsOf(narrowed, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
    expect(fieldsOf(narrowed, "PartyGroup")).toEqual([t("Name"), t("PlanguageLevel")]);
    expect(fieldsOf(narrowed, "AiAgent")).toEqual([t("Name"), t("PlanguageLevel")]);
  });

  it("the walk mode asks no selector, and the selector mode walks no listing", async () => {
    const walked = fixtureMaster();
    await resolveFieldSets(source(walked, { carriers: "walk" }));
    expect(listingCalls(walked).some((u) => u.includes("carries="))).toBe(false);
    const narrowed = fixtureMaster();
    await resolveFieldSets(source(narrowed));
    expect(listingCalls(narrowed).some((u) => u.includes("limit=2000"))).toBe(false);
  });

  it("states how the list was read", async () => {
    const m = fixtureMaster();
    const p = await resolvePredicates(source(m));
    expect((await source(m).carriersOf(p.fieldOf.readKeys)).read).toBe("selector");
    expect((await source(m, { carriers: "walk" }).carriersOf(p.fieldOf.readKeys)).read).toBe("whole-walk");
  });

  it("a 400 from the selector (an unbound name) is an error, never an empty field set", async () => {
    const m = fixtureMaster();
    // The fixture's own unbound-name answer, as the master gives it.
    expect((await m.fetch(`${RIG}/base/vocab?status=all&carries=a%3AnoSuchPredicate&limit=100`)).status).toBe(400);
    // A master that answers the package's ask that way.
    const refusing: TermFetch = async (u, init) =>
      u.includes("carries=") ? m.fetch(u.replace("carries=a%3AfieldOf", "carries=a%3AnoSuchPredicate"), init) : m.fetch(u, init);
    await expect(resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: refusing }))).rejects.toThrow(/answered 400/);
  });
});

describe("C2: an answer that was not narrowed is refused, never walked", () => {
  it("a master without the selector: 'not known yet' after one request", async () => {
    const m = fixtureMaster();
    m.selector = false;
    const read = resolveFieldSets(source(m));
    await expect(read).rejects.toBeInstanceOf(CarrierSelectorMissingError);
    await expect(resolveFieldSets(source(m))).rejects.toThrow(/not known yet/);
    // The refusal is a VocabularyUnavailableError: "I could not read the definition", not "nothing".
    await expect(resolveFieldSets(source(m))).rejects.toBeInstanceOf(VocabularyUnavailableError);
    // One listing request per attempt, the narrowed ask, and no page of the whole walk after it.
    expect(listingCalls(m)).toEqual([SELECTOR_URL, SELECTOR_URL, SELECTOR_URL]);
  });

  it("an agent may still choose the walk on the same master", async () => {
    const m = fixtureMaster();
    m.selector = false;
    const sets = await resolveFieldSets(source(m, { carriers: "walk" }));
    expect(fieldsOf(sets, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
  });

  it("a face that repeats another predicate is refused", async () => {
    const m = fixtureMaster();
    const answer = (await (await m.fetch(SELECTOR_URL)).json()) as Record<string, unknown>;
    m.docs.set(SELECTOR_URL, { ...answer, carries: "a:nobodyCarries" });
    await expect(resolveFieldSets(source(m))).rejects.toThrow(/answered carries="a:nobodyCarries"/);
  });

  it("a face without carriesSpellings is refused", async () => {
    const m = fixtureMaster();
    const answer = (await (await m.fetch(SELECTOR_URL)).json()) as Record<string, unknown>;
    m.docs.set(SELECTOR_URL, { ...answer, carriesSpellings: undefined });
    await expect(resolveFieldSets(source(m))).rejects.toThrow(/without a `carriesSpellings` list/);
  });
});

describe("C3 and C4: pages of a narrowed read", () => {
  it("pages with the asked limit, re-rooting next on the rig origin; each carrier once", async () => {
    const m = fixtureMaster();
    const sets = await resolveFieldSets(source(m, { carrierPageSize: 2 }));
    // Four carriers in the fixture listing: Name, Email, PlanguageLevel, JobTitle.
    expect(listingCalls(m)).toEqual([
      `${RIG}/base/vocab?status=all&carries=a%3AfieldOf&limit=2`,
      `${RIG}/base/vocab?status=all&carries=a%3AfieldOf&limit=2&cursor=k2`,
    ]);
    expect(sets.complete).toBe(true);
    expect(fieldsOf(sets, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
  });

  it("a later page that does not say it was narrowed is refused, not kept", async () => {
    const m = fixtureMaster();
    const second = `${RIG}/base/vocab?status=all&carries=a%3AfieldOf&limit=2&cursor=k2`;
    const answer = (await (await m.fetch(second)).json()) as Record<string, unknown>;
    const { carries: _c, carriesSpellings: _s, ...bare } = answer;
    void _c;
    void _s;
    m.docs.set(second, bare);
    await expect(resolveFieldSets(source(m, { carrierPageSize: 2 }))).rejects.toBeInstanceOf(CarrierSelectorMissingError);
  });

  it("the page ceiling is reported as incompleteness on the narrowed read too", async () => {
    const sets = await resolveFieldSets(source(fixtureMaster(), { carrierPageSize: 2, maxPages: 1 }));
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt.join(" ")).toMatch(/stopped after 1 pages/);
  });
});

describe("C5: every master read checks back", () => {
  it("is sent with cache mode no-cache, the declarations read included", async () => {
    const m = fixtureMaster();
    await resolveFieldSets(source(m));
    expect(m.inits.length).toBeGreaterThan(10);
    expect(m.inits.every((i) => i?.cache === "no-cache")).toBe(true);
    const at = m.requested.indexOf(SELECTOR_URL);
    expect(m.inits[at]?.cache).toBe("no-cache");
  });
});

// A browser-like HTTP cache in front of the master: a 200 is kept for max-age 3600 s with an ETag.
// `default` answers a fresh entry from the cache; `no-cache` asks the master again and gets the
// cached body back when nothing changed (the 304 a real master sends, by ETag). The clock never
// moves, so every reload is "inside the hour".
function browserCache(origin: TermFetch) {
  const kept = new Map<string, { etag: string; body: string }>();
  const log = { fromCache: 0, revalidated: 0, notModified: 0, network: 0 };
  const etagOf = (body: string) => `W/"${body.length}-${[...body].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}"`;
  const fetchThrough: TermFetch = async (url, init) => {
    const hit = kept.get(url);
    const mode = init?.cache ?? "default";
    if (hit && mode === "default") {
      log.fromCache += 1;
      return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", etag: hit.etag } });
    }
    const res = await origin(url, init);
    log.network += 1;
    if (!res.ok) return res;
    const body = await res.text();
    const etag = etagOf(body);
    if (hit) {
      log.revalidated += 1;
      if (hit.etag === etag) log.notModified += 1;
    }
    kept.set(url, { etag, body });
    return new Response(body, { status: 200, headers: { "content-type": "application/json", etag } });
  };
  return { fetchThrough, log };
}

const addDeclaration = (m: FixtureMaster) => {
  const first = `${RIG}/base/vocab?status=all&limit=2000`;
  const page = m.docs.get(first) as { "@graph": unknown[] } & Record<string, unknown>;
  m.docs.set(first, {
    ...page,
    "@graph": [
      ...page["@graph"],
      { "@id": t("Phone"), "a:predicateAttribute": "a:phone", "a:label": "Phone", "a:fieldOf": { "@id": t("Person") } },
    ],
  });
};

describe("C6: a field added on the master shows after a reload inside the cache hour", () => {
  it("the reload shows the new field, through a browser-like cache", async () => {
    const m = fixtureMaster();
    const cache = browserCache(m.fetch);
    const first = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: cache.fetchThrough }));
    expect(fieldsOf(first, "Person")).not.toContain(t("Phone"));
    addDeclaration(m);
    const reload = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: cache.fetchThrough }));
    expect(fieldsOf(reload, "Person")).toEqual([t("Email"), t("Name"), t("Phone"), t("PlanguageLevel")]);
    // Nothing was answered from the cache unasked; the unchanged documents came back as "not modified".
    expect(cache.log.fromCache).toBe(0);
    expect(cache.log.notModified).toBeGreaterThan(0);
  });

  it("control: the same cache, read in the default mode, hides the new field (the cache is real)", async () => {
    const m = fixtureMaster();
    const cache = browserCache(m.fetch);
    const defaultMode: TermFetch = (u) => cache.fetchThrough(u, undefined);
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: defaultMode }));
    addDeclaration(m);
    const reload = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: defaultMode }));
    expect(fieldsOf(reload, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
    expect(cache.log.fromCache).toBeGreaterThan(0);
  });
});

describe("C7: an app that injects no fetch checks back too", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the default fetch is handed cache mode no-cache on every read", async () => {
    const m = fixtureMaster();
    const seen: (RequestInit | undefined)[] = [];
    vi.stubGlobal("fetch", (u: string, init?: RequestInit) => {
      seen.push(init);
      return m.fetch(u, init);
    });
    const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG }));
    expect(fieldsOf(sets, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
    expect(seen.length).toBe(m.requested.length);
    expect(seen.every((i) => i?.cache === "no-cache")).toBe(true);
  });
});
