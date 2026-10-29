// A small vault behind a fake `fetch`: it serves the records it is given at the addresses the platform clients ask, keeps what a PATCH
// changes, and logs every request (method, URL, headers, body) in the order it came. An address it does not serve answers 404.
// Not a model of the platform: only the few reads and the one write the cards make in the tests.
// It also answers the platform's batch read of main tags (`POST <origin>/base/tag/masters`, body `{ vault, targetEntities }`, answer
// `{ masterTags: [{ targetEntity, tagString, tagKnown }] }`) for the records it serves at that origin. That is a READ made with POST: it
// is kept in `tagReads` and is not in `log`, `created` or `requests(...)`, so it is never counted as a write.

import { recordFromServed, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";

export const ORIGIN = "https://platform.example.test";
export const ONTOLOGY = "https://ontology.platform.example.test";
/** The vault the records live in: the address of a record up to its `/e/`. */
export const VAULT = `${ORIGIN}/base`;

export const entityUriOf = (id: string) => `${VAULT}/e/${id}`;

export interface ServedRecord {
  id: string;
  /** The record's own address when it is not `entityUriOf(id)` (a record held by another host). */
  uri?: string;
  /** The `@type`, as `t:Name`. */
  type: string;
  /** The facts as stored (the served document minus its frame). */
  facts: Record<string, unknown>;
  version: number;
  /** The record's MAIN tag as the platform would answer it. Absent: the record has none (`tagKnown: false`). */
  mainTag?: string;
}

export interface LoggedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

const etagOf = (r: ServedRecord) => `"v${r.version}"`;
const uriOf = (r: ServedRecord) => r.uri ?? entityUriOf(r.id);

function docOf(r: ServedRecord): Record<string, unknown> {
  return { "@id": uriOf(r), "@type": r.type, ...r.facts };
}

/** Whether record `r` holds `attr = value` the way `find-by-attribute` asks: a link is `{"@id"}`, a tag is the text. */
function holds(r: ServedRecord, attr: string, value: string): boolean {
  const slug = attr.startsWith("a:") ? attr.slice(2) : attr;
  const fact = r.facts[slug];
  if (fact === undefined) return false;
  if (value.startsWith("{")) {
    const want = (JSON.parse(value) as { "@id"?: string })["@id"];
    const have = Array.isArray(fact) ? fact : [fact];
    return have.some((f) => typeof f === "object" && f !== null && (f as { "@id"?: string })["@id"] === want);
  }
  return fact === value;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export interface FakeVaultOptions {
  /** The relations `GET /base/e/<id>/relations` serves for a record id, as the wire spells them (`{ relation, role, type, members }`). */
  relations?: Record<string, unknown[]>;
}

export function createFakeVault(initial: ServedRecord[] = [], options: FakeVaultOptions = {}) {
  const records = new Map<string, ServedRecord>(initial.map((r) => [r.id, { ...r }]));
  const log: LoggedRequest[] = [];
  const unserved: string[] = [];
  /** The records a POST made, in order. */
  const created: ServedRecord[] = [];
  /** The batch reads of main tags (`POST /base/tag/masters`), in order. Reads, not writes: not in `log`. */
  const tagReads: LoggedRequest[] = [];

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
    const body = typeof init?.body === "string" ? init.body : null;
    const u = new URL(url);
    if (method === "POST" && u.pathname === "/base/tag/masters") {
      tagReads.push({ method, url, headers, body });
      const asked = (JSON.parse(body ?? "{}") as { targetEntities?: string[] }).targetEntities ?? [];
      const here = [...records.values()].filter((r) => new URL(uriOf(r)).origin === u.origin);
      const masterTags = asked.map((targetEntity) => {
        const r = here.find((x) => uriOf(x) === targetEntity);
        return r?.mainTag ? { targetEntity, tagString: r.mainTag, tagKnown: true } : { targetEntity, tagString: null, tagKnown: false };
      });
      return json(200, { masterTags });
    }
    log.push({ method, url, headers, body });

    const relOf = /^\/base\/e\/([^/]+)\/relations$/.exec(u.pathname);
    if (method === "GET" && relOf) return json(200, { member: relOf[1], relations: options.relations?.[relOf[1]!] ?? [] });
    if (method === "GET" && u.pathname === "/base/find-by-attribute") {
      const attr = u.searchParams.get("attr") ?? "";
      const value = u.searchParams.get("value") ?? "";
      const ids = [...records.values()].filter((r) => holds(r, attr, value)).map(uriOf);
      return json(200, { count: ids.length, ids });
    }
    if (method === "POST" && /^\/lws\/vault\/[^/]+\/c$/.test(u.pathname)) {
      const made = JSON.parse(body ?? "{}") as { type: string; facts: Record<string, unknown> };
      const id = `made${created.length + 1}`;
      const facts: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(made.facts)) facts[k.startsWith("a:") ? k.slice(2) : k] = v;
      const r: ServedRecord = { id, type: made.type, facts, version: 1 };
      records.set(id, r);
      created.push(r);
      return json(201, {}, { location: `${ORIGIN}/lws/r/${id}`, etag: etagOf(r) });
    }
    const rec = /^\/lws\/r\/([^/]+)$/.exec(u.pathname);
    if (rec) {
      const r = records.get(rec[1]!);
      if (!r || new URL(uriOf(r)).origin !== u.origin) return json(404, { error: "not found" });
      if (method === "GET") return json(200, docOf(r), { etag: etagOf(r) });
      if (method === "PATCH") {
        const match = headers["if-match"];
        if (match && match !== etagOf(r)) return json(412, { error: "stale" });
        const patch = JSON.parse(body ?? "{}") as Record<string, unknown>;
        for (const [k, v] of Object.entries(patch)) {
          const slug = k.startsWith("a:") ? k.slice(2) : k;
          if (v === null) delete r.facts[slug];
          else r.facts[slug] = v;
        }
        r.version += 1;
        return json(200, {}, { etag: etagOf(r) });
      }
    }
    unserved.push(`${method} ${url}`);
    return json(404, { error: "not served here" });
  }

  /** A record as the card client reads it: what `GET /lws/r/<id>` serves, with its ETag. */
  function recordOf(id: string): BaseRecord {
    const r = records.get(id);
    if (!r) throw new Error(`the fake vault holds no record ${id}`);
    return recordFromServed(id, docOf(r), etagOf(r));
  }

  return {
    records,
    recordOf,
    log,
    created,
    tagReads,
    unserved,
    fetch: handle as typeof fetch,
    requests(method: string, pattern: RegExp) {
      return log.filter((r) => r.method === method && pattern.test(r.url));
    },
  };
}
