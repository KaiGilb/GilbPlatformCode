// New. The fence and the way a read is made. Every case here is a decision of this unit and not of GilbApp, which fetched whatever address it
// was handed and sent the browser's default credentials. "Failed first" is stated per test in the README.
import { describe, expect, it, vi } from "vitest";
import { GeoUnavailableError, getPlace, peekPlace, resolveAncestry, searchPlaces, searchPlacesInCountryDetailed } from "./geoCatalogue";
import { GEO, GEO_ORIGIN, ROWS, calls, callsTo, failIds, memoryStorage, useWorld } from "../test/world";

useWorld();

const OUTSIDE = [
  "https://evil.example/x",
  "https://evil.example/base/e/osm-r-1",
  "http://geo.example.test/base/e/x", // same host, other scheme
  "https://user:pw@geo.example.test/base/e/x", // a sign-in part in the address
  "https://geo.example.test:8443/base/e/x", // same host, other port
  "https://geo.example.test.evil.example/base/e/x",
  "https://geo.example.test@evil.example/base/e/x",
  "base:e/x", // a compact id is not an address; `getPlace` is handed absolute ones
  "/base/e/x",
  "osm-r-1",
  "",
  "javascript:alert(1)",
];
// M-K1 (Kai-Zen): a test of the fence by `includes` or by a text prefix would let these through.
const SMUGGLED = [
  `https://evil.example/?u=${GEO}/oslo`,
  `https://evil.example/#${GEO}/oslo`,
  `https://evil.example/${GEO}/oslo`,
  `https://evil.example/base/e/x?next=${GEO_ORIGIN}`,
  `${GEO_ORIGIN}.evil.example/base/e/x`,
  `${GEO_ORIGIN}@evil.example/base/e/x`,
];

describe("an address outside the catalogue is never requested", () => {
  it.each([...OUTSIDE, ...SMUGGLED])("getPlace(%j): no request at all, and a failed-read outcome that says why", async (id) => {
    const err = await getPlace(id).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(GeoUnavailableError);
    expect((err as GeoUnavailableError).reason).toBe("not-geo");
    expect((err as GeoUnavailableError).status).toBeNull();
    expect(calls).toEqual([]); // the world's fetch log is empty
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("the message names no address, and is not the 'could not be reached' sentence", async () => {
    const err = (await getPlace("https://evil.example/secret-path").catch((e: unknown) => e)) as GeoUnavailableError;
    expect(err.message).not.toContain("evil");
    expect(err.message).not.toContain("secret-path");
    expect(err.message).toMatch(/not in the place catalogue/);
    expect(err.message).not.toMatch(/could not be reached/);
  });

  it("a failed read is still 'unreachable': the two reasons stay apart", async () => {
    const err = (await getPlace(`${GEO}/no-such-502`).catch((e: unknown) => e)) as GeoUnavailableError | null;
    // the double answers 404 for an unknown row: that is an absence, not an error
    expect(err).toBeNull();
    failIds.add(`${GEO}/oslo`);
    const failed = (await getPlace(`${GEO}/oslo`).catch((e: unknown) => e)) as GeoUnavailableError;
    expect(failed).toBeInstanceOf(GeoUnavailableError);
    expect(failed.reason).toBe("unreachable");
    expect(failed.status).toBe(502);
  });

  it.each([...OUTSIDE, ...SMUGGLED])("peekPlace(%j) is null and asks nobody", (id) => {
    expect(peekPlace(id)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("an address outside the catalogue is not served from the lean copy either", async () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    store.setItem("base:geo:lean-rows:v1", JSON.stringify({ "https://evil.example/x": { l: "Planted", t: "City", m: [], s: Date.now() } }));
    expect(peekPlace("https://evil.example/x")).toBeNull();
    await expect(getPlace("https://evil.example/x")).rejects.toMatchObject({ reason: "not-geo" });
    expect(calls).toEqual([]);
  });

  it("the walk up from a row does not follow a parent outside the catalogue: no request, the rung above stays unreached", async () => {
    const ROW = `${GEO}/odd-city`;
    ROWS[ROW] = { "@id": ROW, "@type": "t:City", label: "Odd", memberOf: ["https://evil.example/base/e/no", `${GEO}/no`] };
    try {
      const found = await resolveAncestry(ROW);
      expect(found.city?.id).toBe(ROW);
      expect(found.country?.id).toBe(`${GEO}/no`); // the in-catalogue parent still leads on
      expect(callsTo("https://evil.example")).toEqual([]);
    } finally {
      delete ROWS[ROW];
    }
  });

  it("a row whose own @id names another host keeps the address it was asked at", async () => {
    const ROW = `${GEO}/liar`;
    ROWS[ROW] = { "@id": "https://evil.example/base/e/liar", "@type": "t:City", label: "Liar" };
    try {
      expect((await getPlace(ROW))?.id).toBe(ROW);
    } finally {
      delete ROWS[ROW];
    }
  });

  it("a search or a walk started from an outside address fails the same way and makes no request to it", async () => {
    await expect(resolveAncestry("https://evil.example/x")).rejects.toMatchObject({ reason: "not-geo" });
    expect(callsTo("https://evil.example")).toEqual([]);
  });
});

describe("a read of the catalogue is one anonymous GET", () => {
  it("getPlace of a catalogue row: exactly one request, a GET to the catalogue, credentials omitted, no body", async () => {
    const place = await getPlace(`${GEO}/oslo`);
    expect(place?.label).toBe("Oslo");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", url: `${GEO}/oslo`, credentials: "omit" });
    expect(calls[0]!.body).toBeUndefined();
  });

  it("a search: every request to the catalogue is a GET with credentials omitted", async () => {
    await searchPlaces("Oslo", "city", 8);
    const geo = callsTo(GEO_ORIGIN);
    expect(geo.length).toBeGreaterThan(0);
    for (const c of geo) {
      expect(c.method).toBe("GET");
      expect(c.credentials).toBe("omit");
      expect(c.body).toBeUndefined();
    }
    expect(geo.some((c) => c.url.startsWith(`${GEO_ORIGIN}/base/search?q=Oslo&type=`))).toBe(true);
  });

  it("a walk and a country-pinned search: still only GETs, none to a host but the catalogue and the ontology", async () => {
    await resolveAncestry(`${GEO}/manchester`);
    await searchPlacesInCountryDetailed("Stockholm", "city", `${GEO}/se`, 8);
    for (const c of calls) {
      expect(c.method).toBe("GET");
      expect(c.url.startsWith(GEO_ORIGIN) || c.url.startsWith("https://ontology.example.test")).toBe(true);
    }
  });

  it("the ontology reads do not carry the catalogue's credential setting (they are the source's plain GETs)", async () => {
    await searchPlaces("London", "city", 8);
    const veda = callsTo("https://ontology.example.test");
    expect(veda.length).toBeGreaterThan(0);
    for (const c of veda) expect(c.method).toBe("GET");
  });
});
