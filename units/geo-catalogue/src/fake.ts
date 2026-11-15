// New (0.1.2, not GilbApp's): a small fixed GilbGeo for an app's fake mode and for tests, from the app's own `fakeGeo.ts` (PictureRecords run 10).
// It is a separate entry (`/fake`), not part of the main one: the real client never imports it.
// ⚠ IT IS A STAND-IN, NOT THE CATALOGUE. It answers the four request shapes this unit makes and nothing else.
import { geoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

/** One place of the fake catalogue. `id` is a full address inside the catalogue or a bare name (`osm-r-51701`), which is put after `<origin>/base/e/`. */
export interface FakeGeoRow {
  readonly id: string;
  readonly label: string;
  /** The catalogue's bare type name (`Country`, `City`, `Municipality`, `GeoAdminArea`, `Town`). Default `Country`. */
  readonly type?: string;
  /** The row this one is a member of (a full address or a bare name), as the catalogue's `memberOf`. */
  readonly memberOf?: string;
}

export interface FakeGeoOptions {
  /** The catalogue's origin. Default: read at each request from `geoOrigin()`, so `setGeoOrigin` works as it does for the real client. */
  readonly origin?: string;
  /** The ontology's origin. Default: read at each request from `termOrigin()`. */
  readonly termOrigin?: string;
  /** Rows to start with. Default {@link FAKE_COUNTRIES}. `[]` starts empty. */
  readonly rows?: readonly FakeGeoRow[];
}

/**
 * Fifteen countries. Every id was read live from GilbGeo on 2026-11-15: the search `type=Country&q=<name>` returned it and the row read at that
 * id answered with that country's label (read-only GETs).
 */
export const FAKE_COUNTRIES: readonly FakeGeoRow[] = Object.freeze([
  { id: "osm-r-51701", label: "Switzerland" },
  { id: "osm-r-382313", label: "Japan" },
  { id: "osm-r-51477", label: "Germany" },
  { id: "osm-r-148838", label: "United States" },
  { id: "osm-r-62149", label: "United Kingdom" },
  { id: "osm-r-2978650", label: "Norway" },
  { id: "osm-r-52822", label: "Sweden" },
  { id: "osm-r-2202162", label: "France" },
  { id: "osm-r-1311341", label: "Spain" },
  { id: "osm-r-365331", label: "Italy" },
  { id: "osm-r-1428125", label: "Canada" },
  { id: "osm-r-80500", label: "Australia" },
  { id: "osm-r-304716", label: "India" },
  { id: "osm-r-59470", label: "Brazil" },
  { id: "osm-r-114686", label: "Mexico" },
].map((r) => Object.freeze(r)));

/** The ontology's children of `GeoRegion` and the grain of each, in the order the ontology serves them (as the unit's own test world). */
const GRAIN_OF: Readonly<Record<string, string>> = { City: "settlement", Country: "country", GeoAdminArea: "administrativeArea", Municipality: "settlement", Town: "settlement" };
const LABEL_OF: Readonly<Record<string, string>> = { City: "City", Country: "Country", GeoAdminArea: "Geo Admin Area", Municipality: "Municipality", Town: "Town" };
const PAGE_SIZE = 20;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export interface FakeGeo {
  /** The fake as a `fetch`: the catalogue's and the ontology's requests are answered, everything else goes to `next`. Put it where the real `fetch` is. */
  fetch(next: typeof fetch): typeof fetch;
  /** The catalogue and ontology addresses asked so far, in order. */
  readonly calls: string[];
  /** Add a row (or replace the row with the same address). */
  add(row: FakeGeoRow): void;
  /** Make a read of this row answer 502 (a failure, not an absence). */
  fail(id: string): void;
  /** The answer to one address, or `null` when it is neither the catalogue's nor the ontology's. */
  answer(url: string): Response | null;
}

export function fakeGeo(opts: FakeGeoOptions = {}): FakeGeo {
  const geo = () => opts.origin ?? geoOrigin();
  const term = () => opts.termOrigin ?? termOrigin();
  const idOf = (id: string) => (/^https?:\/\//.test(id) ? id : `${geo()}/base/e/${id}`);
  const added: FakeGeoRow[] = [...(opts.rows ?? FAKE_COUNTRIES)];
  const failing = new Set<string>();
  const calls: string[] = [];
  const rows = () => added.map((r) => ({ ...r, address: idOf(r.id), type: r.type ?? "Country" }));

  function answer(url: string): Response | null {
    const u = new URL(url);
    if (u.origin === new URL(geo()).origin && u.pathname === "/base/search") {
      const q = (u.searchParams.get("q") ?? "").trim().toLowerCase();
      const type = u.searchParams.get("type");
      const prefix = u.searchParams.get("match") === "prefix";
      const all = rows().filter(
        (r) =>
          q !== "" &&
          r.type === type &&
          r.label.toLowerCase().split(/\s+/).some((w, i, ws) => (prefix ? w.startsWith(q) || ws.slice(i).join(" ").startsWith(q) : w === q)),
      );
      const hits = all.slice(0, PAGE_SIZE);
      return json({
        total: { kind: "exact", value: all.length }, count: hits.length, ids: hits.map((h) => h.address),
        hits: hits.map((h) => ({ entity: h.address, label: h.label, typeUri: null, does: null })),
        pageSize: PAGE_SIZE, next: null, complete: all.length <= PAGE_SIZE,
      });
    }
    if (u.origin === new URL(geo()).origin && u.pathname.startsWith("/base/e/")) {
      const address = `${u.origin}${u.pathname}`;
      if (failing.has(address)) return json({ error: "upstream_down" }, 502);
      const r = rows().find((x) => x.address === address);
      if (!r) return json({ error: "not_found" }, 404);
      return json({ "@id": r.address, "@type": `t:${r.type}`, label: r.label, ...(r.memberOf ? { memberOf: idOf(r.memberOf) } : {}) });
    }
    if (u.origin === new URL(term()).origin && u.pathname === "/base/t/GeoRegion/children") {
      return json({
        type: `${term()}/base/t/GeoRegion`,
        children: Object.keys(GRAIN_OF).map((name) => ({ term: `${term()}/base/t/${name}`, name, label: LABEL_OF[name], kind: "type" })),
        complete: true,
      });
    }
    const g = u.origin === new URL(term()).origin ? /^\/base\/t\/([A-Za-z]+)$/.exec(u.pathname) : null;
    if (g) {
      const grain = GRAIN_OF[g[1]!];
      return grain ? json({ "@id": `${term()}/base/t/${g[1]}`, "a:placeGrain": grain }) : json({ error: "not_found" }, 404);
    }
    return null;
  }

  return {
    calls,
    add(row) {
      const at = added.findIndex((r) => idOf(r.id) === idOf(row.id));
      if (at >= 0) added[at] = row;
      else added.push(row);
    },
    fail: (id) => void failing.add(idOf(id)),
    answer,
    fetch(next) {
      return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        let a: Response | null = null;
        try {
          a = answer(url);
        } catch {
          a = null; // not an address: not ours
        }
        if (!a) return next(input, init);
        calls.push(url);
        return a;
      }) as typeof fetch;
    },
  };
}
