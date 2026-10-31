// The geo parts of GilbApp's `PlacePicker.cycle168.test.tsx` (commit a703b3ed), put at the function level: that file renders the picker
// (a later batch), but the catalogue behaviours it pins are this unit's. N6: a truncated answer is never "no match"; NEW-2: the pinned and
// unpinned states stay apart; the 502 on the deepest hop is a failure and not an absence; the walk is bounded. F13 is new (the rows dropped
// because no country could be reached are counted).
import { describe, expect, it } from "vitest";
import { MAX_MEMBER_OF_HOPS, getPlace, resolveAncestry, searchPlaceIds, searchPlacesInCountryDetailed, type GeoPlace } from "./geoCatalogue";
import { GEO, ROWS, SEARCH, failIds, setCatalogueMode, useWorld } from "../test/world";

useWorld();

describe("N6 / NEW-2: what a search could and could not establish", () => {
  it("a server-truncated empty answer is `incomplete`, never 'no match'", async () => {
    setCatalogueMode("truncated-empty");
    const s = await searchPlaceIds("New York", "city");
    expect(s.ids).toEqual([]);
    expect(s.incomplete).toBe(true);
  });

  it("a complete empty answer is not incomplete: the two stay distinguishable", async () => {
    setCatalogueMode("normal");
    const s = await searchPlaceIds("zzqqnotaplace", "city");
    expect(s).toMatchObject({ ids: [], incomplete: false });
  });

  it("UNPINNED and truncated: `capped` is set and `unplaced` is 0 (no country was asked for)", async () => {
    setCatalogueMode("truncated-with-hits");
    const r = await searchPlacesInCountryDetailed("New York", "city", null);
    expect(r.capped).toBe(true);
    expect(r.unplaced).toBe(0);
  });

  it("PINNED and truncated and nothing in the country: capped, empty, and not 'no such place'", async () => {
    setCatalogueMode("truncated-empty");
    const r = await searchPlacesInCountryDetailed("New York", "city", `${GEO}/no`);
    expect(r.hits).toEqual([]);
    expect(r.capped).toBe(true);
  });

  it("a complete answer inside the pinned country is not capped", async () => {
    setCatalogueMode("normal");
    const r = await searchPlacesInCountryDetailed("Manchester", "city", `${GEO}/uk`);
    expect(r.hits.map((p: GeoPlace) => p.id)).toEqual([`${GEO}/manchester`]);
    expect(r.capped).toBe(false);
    expect(r.unplaced).toBe(0);
  });
});

describe("F13: the rows dropped for want of a country are counted, not hidden", () => {
  it("a hit in ANOTHER country is dropped and is not 'unplaced'", async () => {
    setCatalogueMode("normal");
    const r = await searchPlacesInCountryDetailed("Manchester", "city", `${GEO}/no`);
    expect(r.hits).toEqual([]);
    expect(r.unplaced).toBe(0);
    expect(r.capped).toBe(false);
  });

  it("a hit whose parents lead to no country is dropped AND counted", async () => {
    setCatalogueMode("normal");
    // "Puzzling" has a country (us) through memberOf; make a row with none, found by the City search
    const ROW = `${GEO}/lonely`;
    ROWS[ROW] = { "@id": ROW, "@type": "t:City", label: "Lonely" };
    SEARCH["City|Lonely"] = [ROW, `${GEO}/puzzling`];
    try {
      const r = await searchPlacesInCountryDetailed("Lonely", "city", `${GEO}/no`);
      expect(r.hits).toEqual([]);
      // lonely: no parent at all -> unplaced; puzzling: reaches the us -> another country, not unplaced
      expect(r.unplaced).toBe(1);
    } finally {
      delete ROWS[ROW];
      delete SEARCH["City|Lonely"];
    }
  });

  it("a hit whose parent cannot be read as a row (404) is unplaced", async () => {
    setCatalogueMode("normal");
    const ROW = `${GEO}/orphan`;
    ROWS[ROW] = { "@id": ROW, "@type": "t:City", label: "Orphan", memberOf: `${GEO}/gone` };
    SEARCH["City|Orphan"] = [ROW];
    try {
      const r = await searchPlacesInCountryDetailed("Orphan", "city", `${GEO}/no`);
      expect(r.unplaced).toBe(1);
    } finally {
      delete ROWS[ROW];
      delete SEARCH["City|Orphan"];
    }
  });
});

describe("a failed read is a failure, an absent row is an absence (the 502 guard)", () => {
  it("a 502 on the deepest hop of the walk throws; the same walk healthy reaches the country", async () => {
    failIds.add(`${GEO}/deep-country`);
    await expect(resolveAncestry(`${GEO}/deepcity`)).rejects.toMatchObject({ status: 502, reason: "unreachable" });
    failIds.clear();
    // the double's own walk: deepcity -> deep-region -> deeper-region -> deep-country, three hops up
    const found = await resolveAncestry(`${GEO}/deepcity`);
    expect(found.country?.id).toBe(`${GEO}/deep-country`);
  });

  it("a 404 is `null` (no such place), not a throw", async () => {
    await expect(getPlace(`${GEO}/not-a-place`)).resolves.toBeNull();
  });

  it("the walk is bounded and a cycle ends it", async () => {
    const A = `${GEO}/cycle-a`;
    const B = `${GEO}/cycle-b`;
    ROWS[A] = { "@id": A, "@type": "t:City", label: "A", memberOf: B };
    ROWS[B] = { "@id": B, "@type": "t:GeoAdminArea", label: "B", memberOf: A };
    try {
      const found = await resolveAncestry(A);
      expect(found.country).toBeNull();
      expect(found.city?.id).toBe(A);
      expect(found.region?.id).toBe(B);
    } finally {
      delete ROWS[A];
      delete ROWS[B];
    }
    expect(MAX_MEMBER_OF_HOPS).toBe(5);
  });
});

describe("the walk is bounded by hops, not only by cycles", () => {
  it("a country more than MAX_MEMBER_OF_HOPS hops away is not reached (the rung stays null, never guessed)", async () => {
    const ids = Array.from({ length: MAX_MEMBER_OF_HOPS + 3 }, (_, i) => `${GEO}/chain-${i}`);
    ids.forEach((id, i) => {
      ROWS[id] = i === ids.length - 1 ? { "@id": id, "@type": "t:Country", label: "End" } : { "@id": id, "@type": "t:GeoAdminArea", label: `L${i}`, memberOf: ids[i + 1] };
    });
    try {
      const found = await resolveAncestry(ids[0]!);
      expect(found.region?.id).toBe(ids[0]);
      expect(found.country).toBeNull();
    } finally {
      for (const id of ids) delete ROWS[id];
    }
  });
});
