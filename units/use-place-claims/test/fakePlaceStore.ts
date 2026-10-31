// Test-only. An in-memory vault behind the network, at the level of `fetch`, with the WRITE side (create, merge patch, delete) as well as the reads. Adapted from GilbApp `src/lib/mynet/place/fakePlaceStore.ts`
// (commit a703b3ed78e612e2cab77e94876ce9bce109d5a3) through the held notes' copy of it (`held-notes/test/fakePlaceStore.ts`), which dropped the typed list;
// this one brings it back, because the unit lists. The REAL peers (`lws-records`, `lws-vault-sets`, `vault-resources`) run and this file is the platform.
//
//   GET /lws/vault/<vault>/records?type=<bare type>[&offset=n][&include=body]   the typed list, paged by `door.pageSize`
//   GET /lws/r/<id>                                                             one record
// Every request is logged in `calls` with its body; the writes are also kept in `writes`.
//   POST   /lws/vault/<vault>/c   create: { type, facts } -> a new entity (the facts kept under the STORED key, `a:` + the key sent)
//   PATCH  /lws/r/<id>            JSON merge patch: `null` retracts a key; `store.patchArrays` is "replace" (RFC 7396) or "add" (a stored list gains the value)
//   DELETE /lws/r/<id>            retract the entity
// `failCreateAt` makes the n-th POST answer 503 (for the partial-create case); `geoHost` is the catalogue's origin: a write to it is recorded in `geoWrites`.
// `door` makes the list door behave as the platform's can: a small page, never saying `complete`, ignoring `include=body`, or any page at all (`pages`).
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

export const VAULT = "https://hytta.platform.example.test/base";

interface Entity {
  type: string;
  facts: Record<string, unknown>;
  seq: number;
  vault?: string;
}
export const store = new Map<string, Entity>();
export const calls: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
export const writes: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
export const GEO_HOST = "https://geo.platform.example.test";
export const VEDA_HOST = "https://ontology.platform.example.test";
/** The catalogue's rows (the live shapes) and the ontology's grain map, for the reads a change of an address makes (GETs). */
export const GEO_ROWS: Record<string, unknown> = {
  [`${GEO_HOST}/base/e/no`]: { "@id": `${GEO_HOST}/base/e/no`, "@type": "t:Country", label: "Norway" },
  [`${GEO_HOST}/base/e/oslo`]: { "@id": `${GEO_HOST}/base/e/oslo`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO_HOST}/base/e/no` },
  [`${GEO_HOST}/base/e/viken`]: { "@id": `${GEO_HOST}/base/e/viken`, "@type": "t:GeoAdminArea", label: "Viken", memberOf: `${GEO_HOST}/base/e/no` },
  [`${GEO_HOST}/base/e/se`]: { "@id": `${GEO_HOST}/base/e/se`, "@type": "t:Country", label: "Sweden" },
};
const GRAINS: Record<string, string> = { City: "settlement", Country: "country", GeoAdminArea: "administrativeArea", Municipality: "settlement", Town: "settlement" };
/** Every request at the catalogue's origin, of any method (a test of this unit asserts it is empty). */
export const geoRequests = () => calls.filter((c) => c.url.startsWith(GEO_HOST));
export const knobs = { patchArrays: "replace" as "replace" | "add", failCreateAt: 0, creates: 0 };
let n = 0;
let seqNo = 0;

export interface Door {
  pageSize: number;
  /** Never say `complete`; always name the next offset. */
  neverComplete: boolean;
  /** Serve bodies when asked (`include=body`). */
  bodies: boolean;
  /** Replace the whole answer for a page (offset -> wire), for a test that needs a door's odd answer. */
  pages: ((offset: number, types: string[]) => Record<string, unknown> | null) | null;
}
export const door: Door = { pageSize: 100, neverComplete: false, bodies: true, pages: null };

export function resetStore(): void {
  store.clear();
  calls.length = 0;
  writes.length = 0;
  n = 0;
  seqNo = 0;
  door.pageSize = 100;
  door.neverComplete = false;
  door.bodies = true;
  door.pages = null;
  knobs.patchArrays = "replace";
  knobs.failCreateAt = 0;
  knobs.creates = 0;
}

/** Put a document in the store as ANOTHER app wrote it (keys already stored, e.g. `a:claimSubject`). */
export function seed(type: string, storedFacts: Record<string, unknown>, id = `06gk${String(++n).padStart(22, "0")}`, vault = VAULT): string {
  store.set(id, { type, facts: { ...storedFacts }, seq: ++seqNo, vault });
  return id;
}

const wireKey = (k: string) => (k.startsWith("a:") ? k.slice(2) : k);
const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });
const docOf = (id: string, e: Entity) => ({ "@id": `${e.vault ?? VAULT}/e/${id}`, "@type": e.type, ...Object.fromEntries(Object.entries(e.facts).map(([k, v]) => [wireKey(k), v])) });

export async function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  calls.push({ method, url: url.href, body });
  if (method !== "GET") writes.push({ method, url: url.href, body });
  const create = /^\/lws\/vault\/([^/]+)\/c$/.exec(url.pathname);
  if (create && method === "POST") {
    knobs.creates += 1;
    if (knobs.failCreateAt > 0 && knobs.creates === knobs.failCreateAt) return json({ message: "upstream detail: do not show", status: 503 }, 503);
    const b = body as { type: string; facts: Record<string, unknown> };
    const stored: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b.facts)) stored[k.startsWith("a:") ? k : `a:${k}`] = v;
    const id = `06gk${String(++n).padStart(22, "0")}`;
    const vault = decodeURIComponent(create[1]!);
    store.set(id, { type: b.type, facts: stored, seq: ++seqNo, vault });
    return json({ "@id": `${url.origin}/lws/r/${id}` }, 201, { location: `${url.origin}/lws/r/${id}`, etag: `"${seqNo}"` });
  }
  const one = /^\/lws\/r\/([^/]+)$/.exec(url.pathname);
  if (one && method === "PATCH") {
    const id = decodeURIComponent(one[1]!);
    const e = store.get(id);
    if (!e) return json({ error: "NotFound" }, 404);
    for (const [k, v] of Object.entries(body ?? {})) {
      const key = k.startsWith("a:") ? k : `a:${k}`;
      if (v === null) delete e.facts[key];
      else if (knobs.patchArrays === "add" && Array.isArray(e.facts[key])) {
        const have = Array.isArray(e.facts[key]) ? (e.facts[key] as unknown[]) : [e.facts[key]];
        const add = Array.isArray(v) ? v : [v];
        e.facts[key] = [...have, ...add.filter((x) => !have.some((h) => JSON.stringify(h) === JSON.stringify(x)))];
      } else e.facts[key] = v;
    }
    e.seq = ++seqNo;
    return json({}, 200, { etag: `"${e.seq}"` });
  }
  if (one && method === "DELETE") {
    store.delete(decodeURIComponent(one[1]!));
    return new Response(null, { status: 204 });
  }
  if (method !== "GET") return json({ error: "not faked" }, 405);
  if (url.origin === VEDA_HOST && method === "GET") {
    if (url.pathname === "/base/t/GeoRegion/children") return json({ children: Object.keys(GRAINS).map((name) => ({ name, label: name })) });
    const t = /^\/base\/t\/([A-Za-z]+)$/.exec(url.pathname);
    if (t && GRAINS[t[1]!]) return json({ "a:placeGrain": GRAINS[t[1]!] });
  }
  if (url.origin === GEO_HOST && method === "GET" && url.pathname.startsWith("/base/e/")) {
    const row = GEO_ROWS[url.href];
    return row ? json(row) : json({ error: "NotFound" }, 404);
  }
  const list = /^\/lws\/vault\/([^/]+)\/records$/.exec(url.pathname);
  if (list) {
    const vault = decodeURIComponent(list[1]!);
    const types = url.searchParams.getAll("type");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const wantBody = url.searchParams.get("include") === "body";
    if (door.pages) {
      const custom = door.pages(offset, types);
      if (custom) return json(custom);
    }
    const rows = [...store.entries()]
      .filter(([, e]) => (e.vault ?? VAULT) === vault && types.some((t) => e.type === `t:${t}` || e.type === t))
      .sort(([, a], [, b]) => b.seq - a.seq || 0);
    const page = rows.slice(offset, offset + door.pageSize);
    const records = page.map(([id, e]) => ({
      entity: `${e.vault ?? VAULT}/e/${id}`,
      typeUri: e.type,
      updatedAt: new Date(1_000_000 + e.seq * 1000).toISOString(),
      label: null,
      ...(wantBody && door.bodies ? { body: docOf(id, e), etag: `"${e.seq}"` } : {}),
    }));
    const next = offset + page.length;
    return json({
      total: rows.length,
      complete: door.neverComplete ? false : next >= rows.length,
      pageSize: door.pageSize,
      offset,
      returnedRecords: records.length,
      records,
      ...(wantBody ? { nextOffset: door.neverComplete || next < rows.length ? next : null } : {}),
    });
  }
  const rec = /^\/lws\/r\/([^/]+)$/.exec(url.pathname);
  if (rec) {
    const id = decodeURIComponent(rec[1]!);
    const e = store.get(id);
    if (!e) return json({ error: "NotFound" }, 404);
    return json(docOf(id, e), 200, { etag: `"${e.seq}"` });
  }
  void baseOrigin;
  return json({ error: "not faked" }, 404);
}

/** The reads of single records (not listings) the unit under test made. */
export const recordReads = () => calls.filter((c) => /\/lws\/r\//.test(c.url));
export const listReads = () => calls.filter((c) => /\/records\?/.test(c.url));
