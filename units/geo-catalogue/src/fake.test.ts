// New. The fake GilbGeo (`/fake`) used through the real client: search, row read, unknown id, added rows, the walk up, a failing row, and
// that it hands on a request that is not the catalogue's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGeoOrigin, setGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { GeoUnavailableError, __resetGeoCache, __resetGeoGrainCache, getPlace, resolveAncestry, searchPlaces } from "./index";
import { FAKE_COUNTRIES, fakeGeo } from "./fake";

const GEO = "https://geo.example.test";
const TERM = "https://terms.example.test";
let other: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setGeoOrigin(GEO);
  setTermOrigin(TERM);
  __resetGeoCache();
  __resetGeoGrainCache();
  other = vi.fn(async () => new Response("other", { status: 200 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetGeoOrigin();
  resetTermOrigin();
  __resetGeoCache();
  __resetGeoGrainCache();
});

function install(f = fakeGeo()) {
  vi.stubGlobal("fetch", f.fetch(other as unknown as typeof fetch));
  return f;
}

describe("fakeGeo through the real client", () => {
  it("has at least ten countries", () => {
    expect(FAKE_COUNTRIES.length).toBeGreaterThanOrEqual(10);
  });

  it("search: the start of a word finds the country (prefix), whole words only do not", async () => {
    install();
    const prefix = await searchPlaces("Jap", "country", 8, undefined, { match: "prefix" });
    expect(prefix.map((p) => p.label)).toEqual(["Japan"]);
    expect(await searchPlaces("Jap", "country", 8)).toEqual([]);
    const multi = await searchPlaces("united", "country", 8, undefined, { match: "prefix" });
    expect(multi.map((p) => p.label).sort()).toEqual(["United Kingdom", "United States"]);
  });

  it("search: a second word's start finds it too, and a city search does not return countries", async () => {
    install();
    expect((await searchPlaces("United K", "country", 8, undefined, { match: "prefix" })).map((p) => p.label)).toEqual(["United Kingdom"]);
    expect(await searchPlaces("Japan", "city", 8)).toEqual([]);
  });

  it("row read: the id is inside the catalogue and the row is the one asked", async () => {
    install();
    const p = await getPlace(`${GEO}/base/e/osm-r-382313`);
    expect(p).toMatchObject({ id: `${GEO}/base/e/osm-r-382313`, label: "Japan", type: "Country", memberOf: [] });
  });

  it("unknown id: a 404, which the real client reads as an absence (null), never as a row", async () => {
    const f = install();
    expect(await getPlace(`${GEO}/base/e/no-such-place`)).toBeNull();
    const raw = await fetch(`${GEO}/base/e/no-such-place`);
    expect(raw.status).toBe(404);
    expect(await raw.json()).toEqual({ error: "not_found" });
    expect(f.calls).toContain(`${GEO}/base/e/no-such-place`);
  });

  it("a failing row is a failure, not an absence", async () => {
    const f = install();
    f.fail("osm-r-51701");
    await expect(getPlace(`${GEO}/base/e/osm-r-51701`)).rejects.toMatchObject({ status: 502 });
    await expect(getPlace(`${GEO}/base/e/osm-r-51701`)).rejects.toBeInstanceOf(GeoUnavailableError);
  });

  it("add: a city under a country is found, read, and walked up to its country", async () => {
    const f = install();
    f.add({ id: "bergen", label: "Bergen", type: "Municipality", memberOf: "osm-r-2978650" });
    const found = await searchPlaces("Bergen", "city", 8);
    expect(found.map((p) => p.label)).toEqual(["Bergen"]);
    const walk = await resolveAncestry(`${GEO}/base/e/bergen`);
    expect(walk.city?.label).toBe("Bergen");
    expect(walk.country?.label).toBe("Norway");
  });

  it("add with the same address replaces the row", async () => {
    const f = install();
    f.add({ id: "osm-r-382313", label: "Nippon" });
    expect((await getPlace(`${GEO}/base/e/osm-r-382313`))?.label).toBe("Nippon");
  });

  it("follows the origin setters at each request", async () => {
    install();
    setGeoOrigin("https://other.example.test");
    const p = await getPlace("https://other.example.test/base/e/osm-r-382313");
    expect(p?.label).toBe("Japan");
  });

  it("a request that is neither the catalogue's nor the ontology's goes to the next fetch", async () => {
    const f = install();
    const r = await fetch("https://elsewhere.example.test/x");
    expect(await r.text()).toBe("other");
    expect(other).toHaveBeenCalledTimes(1);
    expect(f.calls).toEqual([]);
  });

  it("an empty start has no rows", async () => {
    install(fakeGeo({ rows: [] }));
    expect(await searchPlaces("Japan", "country", 8)).toEqual([]);
  });
});
