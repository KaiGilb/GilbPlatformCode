// Test-only. An in-memory vault behind the network, at the level of `fetch`: the REAL `lws-records`, `vault-resources` and
// `record-fact-items` run against it. One entity per create (POST /lws/vault/<v>/c), served as the platform serves it (GET
// /lws/r/<id>, a STRONG ETag `"sha256:<64 hex>"` that advances with every write), merge-patch with `null` clearing a key and
// `If-Match` checked (412 on a mismatch), DELETE retracting the entity. Every request is recorded with its body.
import { vi } from "vitest";

export const VAULT = "https://hytta.platform.example.test/base";
export const PERSON_VAULT = VAULT;

interface Entity {
  type: string;
  facts: Record<string, unknown>;
  seq: number;
}
export interface Req {
  method: string;
  url: string;
  path: string;
  body: Record<string, unknown> | null;
  ifMatch: string | null;
}

export const store = new Map<string, Entity>();
export const requests: Req[] = [];
let n = 0;
let seq = 0;
/** Called before a PATCH is applied; a test makes another session write meanwhile, or answers a status. Return a status to refuse. */
export const hooks: { onPatch: ((id: string, nth: number) => number | void) | null; failCreate: boolean; denyRead: Set<string>; delayMs: number } = { onPatch: null, failCreate: false, denyRead: new Set(), delayMs: 0 };
/** Writes in flight now and the most there ever were at once. */
export const flight = { active: 0, max: 0 };
const patchCount = new Map<string, number>();

export const uriOf = (id: string) => `${VAULT}/e/${id}`;
export const etagOf = (s: number) => `"sha256:${s.toString(16).padStart(64, "0")}"`;
const bare = (k: string) => (k.startsWith("a:") ? k.slice(2) : k);

export function reset(): void {
  store.clear();
  requests.length = 0;
  n = 0;
  seq = 0;
  hooks.onPatch = null;
  hooks.failCreate = false;
  hooks.denyRead.clear();
  hooks.delayMs = 0;
  flight.active = 0;
  flight.max = 0;
  patchCount.clear();
}

/** Put a document in the store as ANOTHER writer left it (keys bare or `a:`-prefixed). */
export function seed(type: string, facts: Record<string, unknown>, id?: string): string {
  n += 1;
  const mint = id ?? `06gk${String(n).padStart(22, "0")}`;
  store.set(mint, { type, facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [bare(k), v])), seq: ++seq });
  return mint;
}
/** What the store holds under a key now. */
export const factOf = (id: string, key: string): unknown => store.get(id)?.facts[bare(key)];
export const factsOf = (id: string): Record<string, unknown> => ({ ...(store.get(id)?.facts ?? {}) });

export const writes = (): Req[] => requests.filter((r) => r.method !== "GET");
export const wireNulls = (list: Req[] = writes()): string[] =>
  list.flatMap((r) => Object.entries(r.body ?? {}).filter(([, v]) => v === null).map(([k]) => k)).sort();

const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });

export async function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  const h = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  requests.push({ method, url: String(input), path: url.pathname, body, ifMatch: h["if-match"] ?? null });
  const create = /^\/lws\/vault\/([^/]+)\/c$/.exec(url.pathname);
  if (create && method === "POST") {
    if (hooks.failCreate) return json({ message: "create refused" }, 500);
    const b = body as { type: string; facts: Record<string, unknown> };
    const id = seed(b.type, b.facts);
    return json({ "@id": `${url.origin}/lws/r/${id}` }, 201, { location: `${url.origin}/lws/r/${id}`, etag: etagOf(store.get(id)!.seq) });
  }
  const rec = /^\/lws\/r\/([^/]+)$/.exec(url.pathname);
  if (rec) {
    const id = decodeURIComponent(rec[1]!);
    const e = store.get(id);
    if (method === "GET") {
      if (hooks.denyRead.has(id)) return json({ message: "not served" }, 503);
      if (!e) return json({ error: "NotFound" }, 404);
      return json({ "@id": uriOf(id), "@type": e.type, ...e.facts }, 200, { etag: etagOf(e.seq) });
    }
    if (method === "PATCH") {
      flight.active += 1;
      flight.max = Math.max(flight.max, flight.active);
      try {
        if (hooks.delayMs) await new Promise((r) => setTimeout(r, hooks.delayMs));
        return await patchRec(id, body, h);
      } finally {
        flight.active -= 1;
      }
    }
    if (method === "DELETE") {
      store.delete(id);
      return new Response(null, { status: 204 });
    }
  }
  return json({ error: "not faked" }, 404);
}

async function patchRec(id: string, body: Record<string, unknown> | null, h: Record<string, string>): Promise<Response> {
  const e = store.get(id);
  const nth = (patchCount.get(id) ?? 0) + 1;
  patchCount.set(id, nth);
  const refuse = hooks.onPatch?.(id, nth);
  if (typeof refuse === "number") return json({ message: "refused" }, refuse);
  if (!e) return json({ error: "NotFound" }, 404);
  const cond = h["if-match"];
  if (cond && cond !== etagOf(e.seq)) return json({ message: "precondition failed" }, 412);
  for (const [k, v] of Object.entries(body ?? {})) {
    if (v === null) delete e.facts[bare(k)];
    else e.facts[bare(k)] = v;
  }
  e.seq = ++seq;
  return json({}, 200, { etag: etagOf(e.seq) });
}

export function installFetch(): void {
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
}

/** The store's facts of an entity under the STORED keys (`a:` + the bare key), as the source's tests wrote them. */
export const storedA = (id: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(store.get(id)?.facts ?? {}).map(([k, v]) => [`a:${k}`, v]));
/** The bodies of the writes made to one entity, in order. */
export const patchesTo = (id: string): Record<string, unknown>[] =>
  requests.filter((r) => r.method === "PATCH" && r.path === `/lws/r/${id}`).map((r) => r.body ?? {});
