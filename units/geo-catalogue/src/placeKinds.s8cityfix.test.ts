// Ported from GilbApp `src/lib/mynet/geo/placeKinds.s8cityfix.test.ts` (commit a703b3ed): the same cases against the unit. Changes: the
// import paths, the double (`test/world.ts`: example hosts, the call log, the origins set by `useWorld()`), and the setup lines that
// `useWorld()` now does. The cases and their expectations are the source's.
// Cycle214 s8 city fix — Kai, 2026-10-16 (verbatim): "Oslo does not come up as a city". GilbGeo types the city of Oslo (and Bergen, and
// Stockholm) as a MUNICIPALITY; the box already accepted it (every type the ontology gives the grain `settlement` is a city), but the
// ADMINISTRATIVE AREA "Oslo" (a region) was listed before it, with "goes in your Region field, not City", and the township and the
// kommune with no container were mixed in. These tests pin the ORDER: the hits of the box's own kind first, then the unclassified, then
// the hits that belong in another field; inside each, the hits that name a containing place before those that do not.
// Fixtures: the live GilbGeo shapes (read 2026-10-16), served by `geoCatalogueDouble` in the order GilbVeda lists the types.
import { describe, expect, it } from "vitest";
import {
  rankHitsForRung,
  resolveGeoGrains,
  searchPlaces,
  searchPlacesInCountryDetailed,
  type GeoPlace,
} from "./geoCatalogue";
import { GEO, useWorld } from "../test/world";

useWorld();

const ids = (rows: readonly GeoPlace[]) => rows.map((r) => r.id.replace(`${GEO}/`, ""));

describe("which types the City box counts as a city (measured shape of GilbGeo's ontology)", () => {
  it("City, Municipality and Town are the city rung; the administrative area is the region rung; Country is the country", async () => {
    const g = await resolveGeoGrains();
    expect([...g.byRung.city].sort()).toEqual(["City", "Municipality", "Town"]);
    expect(g.byRung.region).toEqual(["GeoAdminArea"]);
    expect(g.byRung.country).toEqual(["Country"]);
  });
});

describe("the City box lists the hits of its own kind first", () => {
  it("Oslo: the municipality that has a container, the township, the kommune with no container, and only then the region", async () => {
    const rows = await searchPlaces("Oslo", "city", 8);
    expect(ids(rows)).toEqual(["oslo", "oslo-township", "oslo-kommune", "oslo-admin"]);
  });

  it("Stockholm: the municipality before the county", async () => {
    expect(ids(await searchPlaces("Stockholm", "city", 8))).toEqual(["stockholm-muni", "stockholm-county"]);
  });

  it("Bergen: the municipalities keep the catalogue's own order (all of the city rung, all with a container)", async () => {
    expect(ids(await searchPlaces("Bergen", "city", 8))).toEqual(["bergen", "bergen-ruegen", "bergen-town-of"]);
  });

  it("Springfield: a city, a township and a town are all offered, none pushed behind another", async () => {
    expect(ids(await searchPlaces("Springfield", "city", 8))).toEqual(["springfield-city", "springfield-township", "springfield-town"]);
  });

  it("London: the city is found and offered", async () => {
    expect(ids(await searchPlaces("London", "city", 8))).toEqual(["london"]);
  });

  it("the same order when a country is pinned (the restricted path)", async () => {
    const { hits } = await searchPlacesInCountryDetailed("Stockholm", "city", `${GEO}/se`, 8);
    expect(ids(hits)).toEqual(["stockholm-muni", "stockholm-county"]);
  });

  it("the Region box still offers only regions, and Country only countries (no widening)", async () => {
    expect(ids(await searchPlaces("Oslo", "region", 8))).toEqual(["oslo-admin"]);
    expect(ids(await searchPlaces("Stockholm", "region", 8))).toEqual(["stockholm-county"]);
    expect(ids(await searchPlaces("Oslo", "country", 8))).toEqual([]);
  });
});

describe("rankHitsForRung (the rule, with the ontology's map handed in, so no type name is listed in the code)", () => {
  const p = (id: string, type: string, memberOf: string[] = ["x"]): GeoPlace => ({ id, label: id, type, memberOf });
  const rungOf = new Map<string, "city" | "region" | "country">([
    ["A", "city"],
    ["B", "city"],
    ["R", "region"],
    ["C", "country"],
  ]);

  it("own kind, then unclassified, then another field's kind", () => {
    const rows = [p("r", "R"), p("u", "Z"), p("a", "A"), p("c", "C"), p("b", "B")];
    expect(rankHitsForRung(rows, "city", rungOf).map((x) => x.id)).toEqual(["a", "b", "u", "r", "c"]);
  });

  it("inside a tier, a hit that records a container before one that records none; otherwise the given order stands", () => {
    const rows = [p("a1", "A", []), p("a2", "A"), p("a3", "A", []), p("b1", "B")];
    expect(rankHitsForRung(rows, "city", rungOf).map((x) => x.id)).toEqual(["a2", "b1", "a1", "a3"]);
  });

  it("the region box ranks the other way round, from the same map", () => {
    const rows = [p("a", "A"), p("r", "R")];
    expect(rankHitsForRung(rows, "region", rungOf).map((x) => x.id)).toEqual(["r", "a"]);
  });

  it("does not mutate its input and keeps every hit", () => {
    const rows = [p("r", "R"), p("a", "A")];
    const out = rankHitsForRung(rows, "city", rungOf);
    expect(rows.map((x) => x.id)).toEqual(["r", "a"]);
    expect(out).toHaveLength(2);
  });
});
