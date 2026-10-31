// Test-only. The place catalogue at the fetch boundary, adapted from GilbApp `src/lib/mynet/geo/geoCatalogueDouble.ts` (commit a703b3ed):
// the rows, the searches and the modes are the source's, kept as they were. Changes: the hosts are `*.example.test`; every request is
// RECORDED in `calls` (method, url, credentials, body) so a test can assert what was asked and what was not; a request to the catalogue
// with any method but GET is recorded in `geoWrites`, and `expectNoGeoWrites()` is registered for the end of every file that uses
// `useWorld()` (the world-level proof that nothing is ever written to the catalogue).
// ⚠ IT IS A DOUBLE, NOT THE CATALOGUE. It answers the four route shapes the client calls (`/base/t/GeoRegion/children`, `/base/t/<Type>`,
// `/base/search`, and a row GET) and a flag file shape, and nothing else.
// A 502 is a failure and a 404 an absence: `getPlace` turns a 404 into `null` and anything else into a throw.

import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { resetGeoOrigin, setGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetGeoCache, __resetGeoGrainCache } from "../src/geoCatalogue";

export const GEO_ORIGIN = "https://geo.example.test";
export const VEDA_ORIGIN = "https://ontology.example.test";
export const GEO = `${GEO_ORIGIN}/base/e`;
// s8 city fix (Kai 2026-10-16: "Oslo does not come up as a city"): the keys are in the order GilbVeda serves the children of
// `t/GeoRegion` (read live 2026-10-16: City, Country, GeoAdminArea, Municipality, Town), so the administrative area comes before
// the municipality exactly as it does on the real search. ⚠ The ORDER is the fixture; before this the double listed the
// settlement types first and the region could never come first, which hid the defect.
export const GRAIN_OF: Record<string, string> = {
  City: "settlement",
  Country: "country",
  GeoAdminArea: "administrativeArea",
  Municipality: "settlement",
  Town: "settlement",
};
/** The ontology's own labels for the catalogue types, as `GET /base/t/GeoRegion/children` serves them
 *  (read live 2026-10-16: "City", "Country", "Geo Admin Area", "Municipality", "Town"). */
export const LABEL_OF: Record<string, string> = {
  City: "City",
  Municipality: "Municipality",
  Town: "Town",
  GeoAdminArea: "Geo Admin Area",
  Country: "Country",
};
export const ROWS: Record<string, unknown> = {
  [`${GEO}/no`]: { "@id": `${GEO}/no`, "@type": "t:Country", label: "Norway" },
  [`${GEO}/oslo`]: { "@id": `${GEO}/oslo`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO}/no` },
  [`${GEO}/us`]: { "@id": `${GEO}/us`, "@type": "t:Country", label: "United States" },
  [`${GEO}/uk`]: { "@id": `${GEO}/uk`, "@type": "t:Country", label: "United Kingdom" },
  // s8 card look (Kai 2026-10-16: "Oslo / Oslo / Oslo kommune / Oslo Township … need to show what Oslo, the
  // city in Norway or some town in USA"): the four live rows a search for "Oslo" returns, in the live shape
  // (GilbGeo, read 2026-10-16): the municipality and the administrative area both in Norway, a point row with
  // NO `memberOf`, and a township in the United States.
  [`${GEO}/oslo-admin`]: { "@id": `${GEO}/oslo-admin`, "@type": "t:GeoAdminArea", label: "Oslo", memberOf: `${GEO}/no` },
  [`${GEO}/oslo-kommune`]: { "@id": `${GEO}/oslo-kommune`, "@type": "t:Municipality", label: "Oslo kommune" },
  [`${GEO}/oslo-township`]: { "@id": `${GEO}/oslo-township`, "@type": "t:Municipality", label: "Oslo Township", memberOf: { "@id": "base:e/us" } },
  // s8 city fix: the live shapes of Bergen, Stockholm, Springfield and London (GilbGeo, read 2026-10-16 through the public search and
  // row GETs; `memberOf` is the one declared parent, as a string). Bergen and Stockholm are held as MUNICIPALITIES (as Oslo is);
  // London and Springfield also as CITIES; Stockholm's county is an administrative area. Only the five types the ontology serves.
  [`${GEO}/se`]: { "@id": `${GEO}/se`, "@type": "t:Country", label: "Sweden" },
  [`${GEO}/de`]: { "@id": `${GEO}/de`, "@type": "t:Country", label: "Germany" },
  [`${GEO}/bergen`]: { "@id": `${GEO}/bergen`, "@type": "t:Municipality", label: "Bergen", memberOf: `${GEO}/no` },
  [`${GEO}/bergen-ruegen`]: { "@id": `${GEO}/bergen-ruegen`, "@type": "t:Municipality", label: "Bergen auf Rügen", memberOf: `${GEO}/de` },
  [`${GEO}/bergen-town-of`]: { "@id": `${GEO}/bergen-town-of`, "@type": "t:Municipality", label: "Town of Bergen", memberOf: `${GEO}/us` },
  [`${GEO}/stockholm-muni`]: { "@id": `${GEO}/stockholm-muni`, "@type": "t:Municipality", label: "Stockholm Municipality", memberOf: `${GEO}/se` },
  [`${GEO}/stockholm-county`]: { "@id": `${GEO}/stockholm-county`, "@type": "t:GeoAdminArea", label: "Stockholm County", memberOf: `${GEO}/se` },
  [`${GEO}/london`]: { "@id": `${GEO}/london`, "@type": "t:City", label: "London", memberOf: `${GEO}/uk` },
  [`${GEO}/springfield-city`]: { "@id": `${GEO}/springfield-city`, "@type": "t:City", label: "Springfield", memberOf: `${GEO}/us` },
  [`${GEO}/springfield-town`]: { "@id": `${GEO}/springfield-town`, "@type": "t:Town", label: "Springfield", memberOf: `${GEO}/us` },
  [`${GEO}/springfield-township`]: { "@id": `${GEO}/springfield-township`, "@type": "t:Municipality", label: "Springfield Township", memberOf: `${GEO}/us` },
  // 🔴 New York is held ONLY as an administrative area — the measured live shape, and the row
  //    whose pick in the City box produced VATester NEW-1.
  [`${GEO}/ny-admin`]: {
    "@id": `${GEO}/ny-admin`, "@type": "t:GeoAdminArea", label: "New York", memberOf: `${GEO}/us`,
  },
  // A settlement-grain competitor, so the City box offers a MIXED list and the "lands here /
  // lands elsewhere" distinction has a control rather than being true of every row.
  [`${GEO}/york-city`]: {
    "@id": `${GEO}/york-city`, "@type": "t:City", label: "York", memberOf: `${GEO}/us`,
  },
  // Three levels, so "one hop" and "the walk to Country" give DIFFERENT answers (MX8).
  [`${GEO}/manchester`]: {
    "@id": `${GEO}/manchester`, "@type": "t:City", label: "Manchester", memberOf: `${GEO}/uk-region`,
  },
  [`${GEO}/uk-region`]: {
    "@id": `${GEO}/uk-region`, "@type": "t:GeoAdminArea", label: "Greater Manchester", memberOf: `${GEO}/uk`,
  },
  // 🔴 A row the search index returns under the City grain whose type this client CANNOT read —
  //    `@type` is absent, so `bareTypeName` yields "" and `rungOf` has no entry. It is a real
  //    live shape (`GeoGrainMap.unclassified` exists because of it) and it is the case where the
  //    honest answer is "we do not know which field this goes in".
  //
  // ⛔ THE TYPE IS OMITTED RATHER THAN FAKED, DELIBERATELY. This fixture first carried
  //    `"@type": "t:Hamlet"`, which BVedanta's typing gate FAILed at `bc4ad82` (exit 1, 75 gated
  //    terms, 1 un-adjudicated) — a term string minted by a test with no BVGATE_01 handoff, and
  //    worse, `Hamlet` is OSM's real `place=hamlet` class and the natural sixth child of
  //    `t/GeoRegion`, so this module's own architecture predicts it becoming classifiable.
  //    An absent type mints ⛔ NOTHING and exercises the same branch.
  [`${GEO}/puzzling`]: {
    "@id": `${GEO}/puzzling`, label: "Puzzling", memberOf: `${GEO}/us`,
  },
  // 🔴 THREE hops, so the deepest is NOT warmed by the option row's `immediateParent` call and
  //    can still be failed at click time — which is exactly where VATester measured the 502.
  [`${GEO}/deepcity`]: {
    "@id": `${GEO}/deepcity`, "@type": "t:City", label: "Deepcity", memberOf: `${GEO}/deep-region`,
  },
  // s8 card look: the option row now names TWO containers (Deep Region, Deeper Region), so the country is the FOURTH
  // hop and is still not warmed by the row: the click-time walk is where the 502 must land (the guard's whole point).
  [`${GEO}/deep-region`]: {
    "@id": `${GEO}/deep-region`, "@type": "t:GeoAdminArea", label: "Deep Region", memberOf: `${GEO}/deeper-region`,
  },
  [`${GEO}/deeper-region`]: {
    "@id": `${GEO}/deeper-region`, "@type": "t:GeoAdminArea", label: "Deeper Region", memberOf: `${GEO}/deep-country`,
  },
  [`${GEO}/deep-country`]: {
    "@id": `${GEO}/deep-country`, "@type": "t:Country", label: "Deepland",
  },
};

/** Ids the catalogue refuses with a 502 — ⚠ a 502, ⛔ not a 404: a failure, not an absence. */
export const failIds = new Set<string>();

/** The live answers per query and type for "cities-live" (read 2026-10-16). ⚠ A type absent here answers 0, as the live search does. */
export const LIVE_SEARCH: Record<string, Record<string, string[]>> = {
  Oslo: { Municipality: [`${GEO}/oslo`, `${GEO}/oslo-kommune`, `${GEO}/oslo-township`], GeoAdminArea: [`${GEO}/oslo-admin`] },
  Bergen: { Municipality: [`${GEO}/bergen`, `${GEO}/bergen-ruegen`, `${GEO}/bergen-town-of`] },
  Stockholm: { Municipality: [`${GEO}/stockholm-muni`], GeoAdminArea: [`${GEO}/stockholm-county`] },
  London: { City: [`${GEO}/london`] },
  Springfield: { City: [`${GEO}/springfield-city`], Municipality: [`${GEO}/springfield-township`], Town: [`${GEO}/springfield-town`] },
};

export const SEARCH: Record<string, string[]> = {
  [`Municipality|Oslo`]: [`${GEO}/oslo`],
  [`GeoAdminArea|New York`]: [`${GEO}/ny-admin`],
  [`City|New York`]: [`${GEO}/york-city`],
  [`City|Manchester`]: [`${GEO}/manchester`],
  [`City|Puzzling`]: [`${GEO}/puzzling`],
  [`City|Deepcity`]: [`${GEO}/deepcity`],
  [`Country|Norway`]: [`${GEO}/no`],
};

/**
 * How the server answers. ⚠ THREE modes, because "empty" and "truncated" and "truncated but
 * still returning rows" are three different facts and the surface must render three different
 * things. The third mode did not exist and that is why MX7 — deleting the whole
 * capped-with-results disclosure — survived with 0 red.
 */
export type CatalogueMode = "normal" | "truncated-empty" | "truncated-with-hits" | "oslo-live" | "cities-live";
let mode: CatalogueMode = "normal";

/** The three answers a live catalogue gives. ⚠ Reset by {@link resetCatalogueDouble}. */
export function setCatalogueMode(next: CatalogueMode) {
  mode = next;
}

export interface Call {
  readonly method: string;
  readonly url: string;
  readonly credentials: string | undefined;
  readonly body: unknown;
}
/** Every request the code under test made, in order. Reset by `resetCatalogueDouble`. */
export const calls: Call[] = [];
/** Every request to the catalogue's origin with a method but GET. Must stay empty. */
export const geoWrites: Call[] = [];
const geoWritesSeen: Call[] = [];

export function fetchDouble() {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const call: Call = { method: String(init?.method ?? "GET"), url, credentials: init?.credentials, body: init?.body };
    calls.push(call);
    if (call.method !== "GET" && url.startsWith(GEO_ORIGIN)) {
      geoWrites.push(call);
      geoWritesSeen.push(call);
    }
    if (url.includes("/base/t/GeoRegion/children")) {
      return new Response(JSON.stringify({ children: Object.keys(GRAIN_OF).map((name) => ({ name, label: LABEL_OF[name] })) }), { status: 200 });
    }
    const tm = /\/base\/t\/([A-Za-z]+)$/.exec(url);
    if (tm) {
      const g = GRAIN_OF[tm[1]!];
      return g ? new Response(JSON.stringify({ "a:placeGrain": g }), { status: 200 }) : new Response("nf", { status: 404 });
    }
    if (url.includes("/base/search")) {
      const u = new URL(url);
      const q = u.searchParams.get("q") ?? "";
      const type = u.searchParams.get("type") ?? "";
      if (mode === "truncated-empty") {
        // total 70, zero usable ids inside the pinned country → the N6 shape exactly.
        return new Response(JSON.stringify({ total: { kind: "exact", value: 70 }, count: 0, ids: [] }), { status: 200 });
      }
      if (mode === "oslo-live" && q === "Oslo") {
        // The live answer (2026-10-16): Municipality 3, GeoAdminArea 1, City / Town / Country 0.
        const live: Record<string, string[]> = {
          Municipality: [`${GEO}/oslo`, `${GEO}/oslo-kommune`, `${GEO}/oslo-township`],
          GeoAdminArea: [`${GEO}/oslo-admin`],
        };
        const got = live[type] ?? [];
        return new Response(JSON.stringify({ total: { kind: "exact", value: got.length }, count: got.length, ids: got }), { status: 200 });
      }
      if (mode === "cities-live" && LIVE_SEARCH[q]) {
        const got = LIVE_SEARCH[q][type] ?? [];
        return new Response(JSON.stringify({ total: { kind: "exact", value: got.length }, count: got.length, ids: got }), { status: 200 });
      }
      const ids = SEARCH[`${type}|${q}`] ?? (q.startsWith("Osl") && type === "Municipality" ? [`${GEO}/oslo`] : []);
      if (mode === "truncated-with-hits") {
        // 🔴 THE ORDINARY LIVE CASE: rows come back AND the server truncated. Measured
        //    `Municipality|New York` = total 55, ids 20. Results and incompleteness together.
        return new Response(JSON.stringify({ total: { kind: "exact", value: 70 }, count: ids.length, ids }), { status: 200 });
      }
      return new Response(JSON.stringify({ total: { kind: "exact", value: ids.length }, count: ids.length, ids }), { status: 200 });
    }
    // 🔴 A 502 IS A FAILURE, ⛔ NOT AN ABSENCE — `getPlace` turns a 404 into null and anything
    //    else into a throw, which is the path this guard exercises.
    if (failIds.has(url)) return new Response("upstream down", { status: 502 });
    const row = ROWS[url];
    return row ? new Response(JSON.stringify(row), { status: 200 }) : new Response("nf", { status: 404 });
  });
}


/** Put the double back to its neutral state. ⚠ Call in `beforeEach`, ⛔ not only in `afterEach`:
 *  a test that throws must not leak `truncated-empty` into its neighbour. */
export function resetCatalogueDouble() {
  mode = "normal";
  failIds.clear();
  calls.length = 0;
  geoWrites.length = 0;
}

/** The requests made to one origin. */
export const callsTo = (origin: string): Call[] => calls.filter((c) => c.url.startsWith(origin));

/** An in-memory `localStorage`, for the tests of the lean copy. */
export function memoryStorage(): Storage & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, v),
    dump: () => Object.fromEntries(m),
  };
}

/**
 * The world every test file of this unit stands in: both origins set, the caches empty, the double behind `fetch`, and, at the end of the
 * file, the proof that no request to the catalogue was ever anything but a GET.
 */
export function useWorld(): void {
  beforeEach(() => {
    setGeoOrigin(GEO_ORIGIN);
    setTermOrigin(VEDA_ORIGIN);
    resetCatalogueDouble();
    setCatalogueMode("cities-live");
    __resetGeoCache();
    __resetGeoGrainCache();
    vi.stubGlobal("fetch", fetchDouble());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetGeoCache();
    __resetGeoGrainCache();
    resetGeoOrigin();
    resetTermOrigin();
  });
  afterAll(() => {
    expect(geoWritesSeen).toEqual([]);
  });
}
