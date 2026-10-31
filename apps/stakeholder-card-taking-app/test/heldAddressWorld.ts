// What the held card's Address section needs of the app's test world: the ontology's answers for the address terms and for the kinds of place, a small place catalogue (Oslo and
// Norway, a town in the United States and the United States; the live shapes), and, for the record that "+ Add your own" makes: two addresses in two countries and the claims they
// are made of, about that record, in Ann's vault. The wrapper watches for the create of the person and, when the platform has answered it, seeds the claims. Every request to the
// catalogue is logged in `catalogueCalls` (method and address), so a test reads that nothing but a GET went there. Fakes only.
import { GEO, HOST, ONTOLOGY, P, type World } from "./world";

export const OSLO = `${GEO}/base/e/osm-r-oslo`;
export const NORWAY_ROW = `${GEO}/base/e/osm-r-norway`;
export const TOWN = `${GEO}/base/e/osm-r-springfield`;
export const US_ROW = `${GEO}/base/e/osm-r-us`;
const ROWS: Record<string, unknown> = {
  [OSLO]: { "@id": OSLO, "@type": "t:Municipality", label: "Oslo", memberOf: NORWAY_ROW },
  [NORWAY_ROW]: { "@id": NORWAY_ROW, "@type": "t:Country", label: "Norway" },
  [TOWN]: { "@id": TOWN, "@type": "t:Town", label: "Springfield", memberOf: US_ROW },
  [US_ROW]: { "@id": US_ROW, "@type": "t:Country", label: "United States" },
};
const GRAIN: Record<string, string> = { City: "settlement", Country: "country", GeoAdminArea: "administrativeArea", Municipality: "settlement", Town: "settlement" };
const ATTRS = ["placeClaimLabel", "streetLine", "memberOf", "claimSubject", "claimPlace", "detailOf", "addressLine1", "addressLine2", "postalCode"];
const TYPES = ["PlaceClaim", "SelfAssertedFieldClaim"];
const esc = (s: string) => s.replace(/[.]/g, "\\.");

/** Every request the catalogue was asked, in order. */
export const catalogueCalls: { method: string; url: string }[] = [];

export function withHeldAddressesOnNewRecord(next: typeof fetch, worldOf: () => World): typeof fetch {
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.startsWith(`${GEO}/`)) {
      catalogueCalls.push({ method, url });
      if (method !== "GET") return Response.json({ error: "the catalogue is read only" }, { status: 405 });
      const row = ROWS[url];
      return row ? Response.json(row) : Response.json({ error: "NotFound" }, { status: 404 });
    }
    if (url === `${ONTOLOGY}/base/t/GeoRegion/children`) return Response.json({ children: Object.keys(GRAIN).map((name) => ({ name, label: name })) });
    const grain = new RegExp(`^${esc(ONTOLOGY)}/base/t/([A-Za-z]+)$`).exec(url);
    if (grain && GRAIN[grain[1]!]) return Response.json({ "a:placeGrain": GRAIN[grain[1]!] });
    const a = new RegExp(`^${esc(ONTOLOGY)}/base/a/([A-Za-z0-9]+)$`).exec(url);
    if (a && ATTRS.includes(a[1]!)) return Response.json({ "@id": url, "a:predicateAttribute": `a:${a[1]}` });
    const t = new RegExp(`^${esc(ONTOLOGY)}/base/t/([A-Za-z0-9]+)$`).exec(url);
    if (t && TYPES.includes(t[1]!)) return Response.json({ "@id": url, "a:typeAttribute": `t:${t[1]}` });
    const res = await next(input, init);
    if (method === "POST" && url === `${HOST}/lws/vault/${encodeURIComponent(P)}/c` && res.ok) {
      const body = JSON.parse(String(init?.body)) as { type?: string };
      const loc = res.headers.get("location") ?? ((await res.clone().json()) as { "@id"?: string })["@id"] ?? "";
      if (body.type === "t:Person" && loc) {
        const world = worldOf();
        const subject = `${HOST}/base/e/${loc.slice(loc.lastIndexOf("/") + 1)}`;
        const claim = (label: string, street: string, places: string[], postal?: string) => {
          const c = world.platform.seed(P, "t:PlaceClaim", { "a:claimSubject": { "@id": subject }, "a:placeClaimLabel": label });
          const field = (facts: Record<string, unknown>) => world.platform.seed(P, "t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": c }, ...facts });
          field({ "a:streetLine": street });
          if (postal) field({ "a:postalCode": postal });
          for (const p of places) field({ "a:claimPlace": { "@id": p } });
        };
        claim("home", "Storgata 1", [OSLO, NORWAY_ROW], "0155");
        claim("cabin", "Main St 5", [TOWN, US_ROW]);
      }
    }
    return res;
  };
  return f as typeof fetch;
}
