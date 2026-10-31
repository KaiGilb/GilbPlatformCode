// What every test file of this unit stands in: the fake platform, the master doubled at `term-slots` (as the source doubled it at its own module), the two
// origins set, the caches empty, and at the end of the file the proof that nothing but a GET ever went to the place catalogue.
import { afterAll, afterEach, beforeEach, expect } from "vitest";
import { __resetGeoCache, __resetGeoGrainCache, type GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { __resetPlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { claimsAbout, listPlaceClaimsInVault, type PlaceClaim, type PlaceClaimInput } from "@kaigilb/gilbplatformcode-place-claims";
import * as fake from "./fakePlaceStore";
import { setUp, tearDown } from "./support";

export const { VAULT, store } = fake;
export const RECORD = `${VAULT}/e/06gkperson0000000000000001`;
export const OTHER = `${VAULT}/e/06gkperson0000000000000002`;
export const PRINCIPAL = "https://kai.platform.example.test/base/i";
export const NONE = { city: null, region: null, country: null };
const place = (id: string, label: string, type: string): GeoPlace => ({ id: `${fake.GEO_HOST}/base/e/${id}`, label, type, memberOf: [] });
export const NORWAY = place("no", "Norway", "Country");
export const OSLO = place("oslo", "Oslo", "Municipality");
export const VIKEN = place("viken", "Viken", "GeoAdminArea");
export const SWEDEN = place("se", "Sweden", "Country");
export const input = (over: Partial<PlaceClaimInput>): PlaceClaimInput => ({ label: "", streetLine: "", addressLine1: "", addressLine2: "", postalCode: "", place: NONE, ...over });
/** The stored entities of one type, facts as STORED (`a:` keys). */
export const ofType = (t: string) => [...store.entries()].filter(([, e]) => e.type === t);
/** The addresses about RECORD, read fresh. */
export const freshRead = async (): Promise<PlaceClaim[]> => claimsAbout(await listPlaceClaimsInVault(VAULT), RECORD);
/** The requests of a method (writes only if none given). */
export const sent = (...methods: string[]) => fake.calls.filter((c) => (methods.length ? methods.includes(c.method) : c.method !== "GET"));
export const bodyKeys = (b: Record<string, unknown> | null) => Object.keys(b?.facts ? (b.facts as Record<string, unknown>) : (b ?? {})).sort();

const geoWritesSeen: string[] = [];
export function useWorld(): void {
  beforeEach(() => {
    fake.resetStore();
    __resetPlaceVocab();
    __resetGeoCache();
    __resetGeoGrainCache();
    setUp();
  });
  afterEach(() => {
    for (const c of fake.geoRequests()) if (c.method !== "GET") geoWritesSeen.push(`${c.method} ${c.url}`);
    tearDown();
  });
  afterAll(() => expect(geoWritesSeen).toEqual([])); // the world-level proof: nothing but a GET ever went to the place catalogue
}
