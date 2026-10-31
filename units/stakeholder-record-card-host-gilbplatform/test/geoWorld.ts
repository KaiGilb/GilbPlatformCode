// What the held card's work place needs of the platform beyond `test/world.ts`: the place catalogue (rows, the search by kind of place) at `GEO`, and the
// ontology's map of which kinds of place are a city, a region or a country, at `ONTOLOGY`. Rows are the live shapes (GilbGeo, read 2026-10-16): Oslo is a
// municipality in Norway, the Oslo township is in the United States with its parent written as a compact `{ "@id": "base:e/..." }`. Only GETs are answered;
// every request is logged in `world.calls` (so a test reads that nothing but a GET ever went to the catalogue), and `down` makes a row answer 502.
import { GEO, ONTOLOGY, type World } from "./world";

export const OSLO = `${GEO}/base/e/osm-r-oslo`;
export const OSLO_TOWNSHIP = `${GEO}/base/e/osm-r-oslo-township`;
export const NORWAY_ROW = `${GEO}/base/e/osm-r-norway`;
export const US_ROW = `${GEO}/base/e/osm-r-us`;
export const GONE = `${GEO}/base/e/osm-r-gone`;

const ROWS: Record<string, unknown> = {
  [OSLO]: { "@id": OSLO, "@type": "t:Municipality", label: "Oslo", memberOf: NORWAY_ROW },
  [OSLO_TOWNSHIP]: { "@id": OSLO_TOWNSHIP, "@type": "t:Municipality", label: "Oslo Township", memberOf: { "@id": "base:e/osm-r-us" } },
  [NORWAY_ROW]: { "@id": NORWAY_ROW, "@type": "t:Country", label: "Norway" },
  [US_ROW]: { "@id": US_ROW, "@type": "t:Country", label: "United States" },
};
const GRAIN: Record<string, string> = { City: "settlement", Country: "country", GeoAdminArea: "administrativeArea", Municipality: "settlement", Town: "settlement" };
const SEARCH: Record<string, string[]> = { "Municipality|Oslo": [OSLO, OSLO_TOWNSHIP] };

export interface GeoWorld {
  fetch: typeof fetch;
  /** Rows that answer 502. */
  down: Set<string>;
}

export function geoWorld(world: World, next: typeof fetch): GeoWorld {
  const down = new Set<string>();
  const log = (method: string, url: string) => world.calls.push({ method, url, headers: {}, body: null });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === `${ONTOLOGY}/base/t/GeoRegion/children`) {
      log(method, url);
      return json(200, { children: Object.keys(GRAIN).map((name) => ({ name, label: name })) });
    }
    const type = /^(.*)\/base\/t\/([A-Za-z]+)$/.exec(url);
    if (type && type[1] === ONTOLOGY && GRAIN[type[2]!]) {
      log(method, url);
      return json(200, { "a:placeGrain": GRAIN[type[2]!] });
    }
    if (url.startsWith(`${GEO}/`)) {
      log(method, url);
      if (method !== "GET") return json(405, { error: "the catalogue is read only" });
      const s = /\/base\/search\?(.*)$/.exec(url);
      if (s) {
        const q = new URLSearchParams(s[1]);
        const ids = SEARCH[`${q.get("type")}|${q.get("q")}`] ?? [];
        return json(200, { total: { kind: "exact", value: ids.length }, count: ids.length, ids });
      }
      if (down.has(url)) return json(502, "down");
      const row = ROWS[url];
      return row ? json(200, row) : json(404, { error: "NotFound" });
    }
    return next(input, init);
  };
  return { fetch: f as typeof fetch, down };
}
