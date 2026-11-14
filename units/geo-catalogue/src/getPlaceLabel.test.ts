// New. The name of a place without reading the place: the cache first, then the stream of the row read for its `label` field only (the
// transfer cancelled when it is seen), then the row under a ceiling; a 404 and a row too large are `null`.
import { describe, expect, it, vi } from "vitest";
import { GeoUnavailableError, __resetGeoMemoryOnly, getPlace, getPlaceLabel, peekPlace, searchPlaceIds } from "./geoCatalogue";
import { GEO, ROWS, calls, memoryStorage, useWorld } from "../test/world";

useWorld();

/** A response whose body arrives in the given chunks; `state.cancelled` says whether the reader was cancelled and `state.read` how many chunks were pulled. */
function streamed(chunks: string[], status = 200) {
  const state = { cancelled: false, read: 0 };
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= chunks.length) return c.close();
      state.read += 1;
      c.enqueue(enc.encode(chunks[i++]!));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { res: new Response(body, { status }), state };
}
const stub = (make: () => Response) => vi.stubGlobal("fetch", vi.fn(async () => make()));
const GEOMETRY = (n: number) => `"c_geometry":"SRID=4326;MULTIPOLYGON(((${"1.5 2.5,".repeat(n)})))"`;

describe("getPlaceLabel", () => {
  it("a name already known (the tab) is returned with no request", async () => {
    await getPlace(`${GEO}/oslo`);
    calls.length = 0;
    expect(await getPlaceLabel(`${GEO}/oslo`)).toBe("Oslo");
    expect(calls).toHaveLength(0);
  });

  it("the name is found in the first bytes of the row: the stream is cancelled and later chunks are not read", async () => {
    const ID = `${GEO}/small`;
    const { res, state } = streamed([`{"@id":"${ID}","@type":"t:Country","label":"Iceland","license":"x",`, "z".repeat(50_000), "z".repeat(50_000), "z".repeat(50_000)]);
    stub(() => res);
    expect(await getPlaceLabel(ID)).toBe("Iceland");
    expect(state.cancelled).toBe(true);
    expect(state.read).toBeLessThan(4); // the stream may pre-pull one chunk; the 150 KB behind the name is not read
  });

  it("the name sits after a big geometry (alphabetical keys, as the live rows): found, cancelled, and never parsed whole", async () => {
    const ID = `${GEO}/big`;
    const chunks = [`{"@id":"${ID}","@type":"t:Country",`, GEOMETRY(40_000).slice(0, 100_000), GEOMETRY(1).slice(0, 30), `","countryCode":"RU","label":"Russia","license":"ODbL-1.0",`, "z".repeat(100_000), "z".repeat(100_000), "z".repeat(100_000)];
    const { res, state } = streamed(chunks);
    stub(() => res);
    expect(await getPlaceLabel(ID)).toBe("Russia");
    expect(state.cancelled).toBe(true);
  });

  it("a name split across two chunks, with an escape and a multi-byte letter, is read whole", async () => {
    const ID = `${GEO}/split`;
    const { res } = streamed([`{"a":1,"lab`, `el":"Bj\\u00f6rk \\"Land\\" Å`, `ngström","x":2}`]);
    stub(() => res);
    expect(await getPlaceLabel(ID)).toBe('Björk "Land" Ångström');
  });

  it("the name is kept (and only the name): the next call, and a new tab, make no request; the row's type and parents are not invented", async () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    const ID = `${GEO}/kept`;
    const f = vi.fn(async () => streamed([`{"@type":"t:Country","label":"Kept"}`]).res);
    vi.stubGlobal("fetch", f);
    expect(await getPlaceLabel(ID)).toBe("Kept");
    expect(await getPlaceLabel(ID)).toBe("Kept");
    __resetGeoMemoryOnly();
    expect(await getPlaceLabel(ID)).toBe("Kept");
    expect(f).toHaveBeenCalledTimes(1);
    expect(store.getItem("base:geo:lean-rows:v1")).toBeNull();
    expect(peekPlace(ID)).toBeNull();
  });

  it("a row with no label (stream ends) is null, with one request", async () => {
    const f = vi.fn(async () => streamed([`{"@type":"t:City","memberOf":"x"}`]).res);
    vi.stubGlobal("fetch", f);
    expect(await getPlaceLabel(`${GEO}/nameless2`)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a row larger than the ceiling with no name in it is null and the transfer is cancelled", async () => {
    const { res, state } = streamed(["z".repeat(600), "z".repeat(600), "z".repeat(600)]);
    stub(() => res);
    expect(await getPlaceLabel(`${GEO}/huge`, undefined, { maxBytes: 1000 })).toBeNull();
    expect(state.cancelled).toBe(true);
  });

  it("a response that cannot be streamed falls back to getPlace under the ceiling: the name, or null when the row is too large", async () => {
    const make = (len: string) => () => {
      const r = new Response(JSON.stringify({ "@type": "t:City", label: "Fallback" }), { status: 200, headers: { "content-length": len } });
      Object.defineProperty(r, "body", { value: null });
      return r;
    };
    stub(make("50"));
    expect(await getPlaceLabel(`${GEO}/fb`)).toBe("Fallback");
    stub(make("9000000"));
    expect(await getPlaceLabel(`${GEO}/fb-big`)).toBeNull();
  });

  it("a 404 is null; any other status is a failure, not 'no name'", async () => {
    expect(await getPlaceLabel(`${GEO}/nope`)).toBeNull();
    stub(() => new Response("down", { status: 502 }));
    await expect(getPlaceLabel(`${GEO}/down`)).rejects.toBeInstanceOf(GeoUnavailableError);
  });

  it("an address outside the catalogue is refused with no request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(getPlaceLabel("https://evil.example.test/base/e/x")).rejects.toMatchObject({ reason: "not-geo" });
    expect(f).not.toHaveBeenCalled();
  });

  it("two asks at the same time make one request; the request is a credential-less GET", async () => {
    ROWS[`${GEO}/twice`] = { "@id": `${GEO}/twice`, "@type": "t:Country", label: "Twice" };
    try {
      const [a, b] = await Promise.all([getPlaceLabel(`${GEO}/twice`), getPlaceLabel(`${GEO}/twice`)]);
      expect([a, b]).toEqual(["Twice", "Twice"]);
      const mine = calls.filter((c) => c.url === `${GEO}/twice`);
      expect(mine).toHaveLength(1);
      expect([mine[0]!.method, mine[0]!.credentials]).toEqual(["GET", "omit"]);
    } finally {
      delete ROWS[`${GEO}/twice`];
    }
  });
});

describe("search match", () => {
  it("the default request is unchanged; match prefix adds match=prefix to every grain's request", async () => {
    await searchPlaceIds("Osl", "city");
    expect(calls.filter((c) => c.url.includes("/base/search")).every((c) => !c.url.includes("match="))).toBe(true);
    calls.length = 0;
    await searchPlaceIds("Osl", "city", undefined, { match: "prefix" });
    const searches = calls.filter((c) => c.url.includes("/base/search"));
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((c) => c.url.endsWith("&match=prefix"))).toBe(true);
    calls.length = 0;
    await searchPlaceIds("Osl", "city", undefined, { match: "text" });
    expect(calls.some((c) => c.url.includes("match="))).toBe(false);
  });
});
