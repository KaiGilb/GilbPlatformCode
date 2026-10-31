// Test-only. An in-memory vault behind the network, at the level of `fetch`. Adapted from GilbApp (private repo `KaiGilb/GilbApp`,
// commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/place/fakePlaceStore.ts`, where the same store sat behind module mocks of
// the app's record client. Here the REAL peers (`lws-records`, `lws-vault-sets`, `vault-resources`) run and this file is the platform: `fakeFetch`
// turns each request into a call of the store functions below and the answer back into a response. The store functions are the source's, kept as
// `vi.fn` spies, so a test asserts and overrides them as before (`createRecord`, `readRecord`, `patchRecord`, `deleteRecord`, `findByAttribute`).
//
// The store keeps what a vault keeps: one entity per create, the facts under the STORED key (`a:` + the slug the door is handed), served back under
// the framed WIRE key (one `a:` taken off, as the platform frames them), merge-patch with `null` clearing a key, DELETE retracting the entity,
// and the per-person find (`GET /base/find-by-attribute`) over the store(s) behind the host asked.
// Changes from the source file: the hosts are `*.platform.example.test`; `BASE_ORIGIN` is `baseOrigin()`; `fakeFetch` and the spies' call
// arguments are new (the spies get the arguments the source's mocks got); the typed list (`listVaultRecordsPage`) is dropped (nothing here lists).
import { vi } from "vitest";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

export const VAULT = "https://hytta.platform.example.test/base";

interface Entity {
  type: string;
  facts: Record<string, unknown>;
  seq: number;
  /** The vault the entity is held in (the store keeps entities per vault). */
  vault?: string;
}

export const store = new Map<string, Entity>();
let n = 0;
let writeSeq = 0;

/** A bare uuidv7-base32-shaped id: ascending in mint order, as the platform's are. */
function mint(): string {
  n += 1;
  return `06gk${String(n).padStart(22, "0")}`;
}

export function resetStore(): void {
  store.clear();
  n = 0;
  writeSeq = 0;
  createRecord.mockReset().mockImplementation(createImpl);
  patchRecord.mockReset().mockImplementation(patchImpl);
  deleteRecord.mockReset().mockImplementation(deleteImpl);
  readRecord.mockReset().mockImplementation(readImpl);
  findByAttribute.mockReset().mockImplementation(findImpl);
  topology.storeOfHost = null;
}

/** Put a document in the store as ANOTHER app wrote it (keys already stored, e.g. `a:claimSubject`). */
export function seed(type: string, storedFacts: Record<string, unknown>, id = mint(), vault = VAULT): string {
  store.set(id, { type, facts: { ...storedFacts }, seq: ++writeSeq, vault });
  return id;
}

const wireKey = (k: string) => (k.startsWith("a:") ? k.slice(2) : k);

const createImpl = async (vault: string, type: string, facts: Record<string, unknown>) => {
  const stored: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) stored[`a:${k}`] = v;
  const id = mint();
  store.set(id, { type, facts: stored, seq: ++writeSeq, vault });
  return { id, etag: `"${writeSeq}"` };
};
export const createRecord = vi.fn(createImpl);

const readImpl = async (id: string, at: string | null) => {
  void at;
  const e = store.get(id);
  if (!e) return null;
  const served: Record<string, unknown> = {};
  const facts: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.facts)) {
    served[wireKey(k)] = v;
    facts[wireKey(k)] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return {
    id,
    entityUri: `${e.vault ?? VAULT}/e/${id}`,
    typeUri: e.type,
    facts,
    servedKeys: Object.keys(facts),
    etag: `"${e.seq}"`,
    served: { facts: served, context: undefined, etag: `"${e.seq}"` },
  };
};
export const readRecord = vi.fn(readImpl as (id: string, at: string | null) => Promise<Awaited<ReturnType<typeof readImpl>> | null>);

const patchImpl = async (id: string, patch: Record<string, unknown>, at: string | null) => {
  void at;
  const e = store.get(id);
  if (!e) throw new Error(`404 ${id}`);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete e.facts[`a:${k}`];
    else e.facts[`a:${k}`] = v;
  }
  e.seq = ++writeSeq;
  return { etag: `"${e.seq}"` };
};
export const patchRecord = vi.fn(patchImpl);

const deleteImpl = async (id: string, at: string | null) => {
  void at;
  store.delete(id);
};
export const deleteRecord = vi.fn(deleteImpl);

/** The master's answers: a term name's spelling is the name itself (as the live master binds them). */
export const attributeSpelling = vi.fn(async (name: string) => name);
export const typeSpelling = vi.fn(async (name: string) => `t:${name}`);
export const MASTER_LABELS: Readonly<Record<string, string>> = {
  addressLine1: "Address 1",
  addressLine2: "Address 2",
  postalCode: "Postal Code",
};
export const attributeLabel = vi.fn(async (name: string) => MASTER_LABELS[name] ?? null);

/**
 * TWO STORES, as production runs them: each host names the store of the process that answers at it, and a vault's host names the store that
 * holds it. The find-by-attribute route has no crossing, so a find answers ONLY from the store of the host it was asked at.
 * `null` (the default) = one store holds every vault, as a dev rig does.
 */
export const topology: { storeOfHost: Record<string, string> | null } = { storeOfHost: null };

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The platform's per-person find (`GET /base/find-by-attribute`): every entity whose stored value under `attr` EQUALS `value` (a reference
 * `{"@id"}` matched exactly, or one element of a stored list), in every vault the answering store holds (the fake reader may read them all),
 * as entity URIs, paged by `limit` (the platform's cap is 200) and `offset`. `origin` is the host asked.
 */
const findImpl = async (attr: string, value: unknown, page: { limit?: number; offset?: number } = {}, origin?: string) => {
  const want = JSON.stringify(value);
  const hit = (v: unknown) => (Array.isArray(v) ? v.some((x) => JSON.stringify(x) === want) : JSON.stringify(v) === want);
  const map = topology.storeOfHost;
  const asked = map ? (map[hostOf(origin ?? baseOrigin())] ?? "no store") : null;
  const ids = [...store.entries()]
    .filter(([, e]) => asked === null || map![hostOf(e.vault ?? VAULT)] === asked)
    .filter(([, e]) => hit(e.facts[attr]))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, e]) => `${e.vault ?? VAULT}/e/${id}`);
  const limit = Math.min(page.limit ?? 200, 200);
  const offset = page.offset ?? 0;
  return { count: ids.length, ids: ids.slice(offset, offset + limit) };
};
export const findByAttribute = vi.fn(findImpl);

/** Every request the fake store answered, by door (counted before and after). */
export function requestCount(): { find: number; read: number; list: number; write: number } {
  return {
    find: findByAttribute.mock.calls.length,
    read: readRecord.mock.calls.length,
    list: 0,
    write: createRecord.mock.calls.length + patchRecord.mock.calls.length + deleteRecord.mock.calls.length,
  };
}

const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });
const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [wireKey(k), v]));

/** The network: each request is one call of the store function behind its door; a thrown error is a 503 that carries its message. */
export async function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  try {
    const create = /^\/lws\/vault\/([^/]+)\/c$/.exec(url.pathname);
    if (create && method === "POST") {
      const b = body as { type: string; facts: Record<string, unknown> };
      const { id, etag } = await createRecord(decodeURIComponent(create[1]!), b.type, strip(b.facts));
      return json({ "@id": `${url.origin}/lws/r/${id}` }, 201, { location: `${url.origin}/lws/r/${id}`, etag: etag ?? "" });
    }
    const rec = /^\/lws\/r\/([^/]+)$/.exec(url.pathname);
    if (rec) {
      const id = decodeURIComponent(rec[1]!);
      if (method === "GET") {
        const r = await readRecord(id, url.origin);
        if (r === null) return json({ error: "NotFound" }, 404);
        return json({ "@id": r.entityUri, "@type": r.typeUri, ...(r.served?.facts ?? {}) }, 200, { etag: r.etag ?? "" });
      }
      if (method === "PATCH") {
        const { etag } = await patchRecord(id, strip(body ?? {}), url.origin);
        return json({}, 200, { etag: etag ?? "" });
      }
      if (method === "DELETE") {
        await deleteRecord(id, url.origin);
        return new Response(null, { status: 204 });
      }
    }
    if (url.pathname === "/base/find-by-attribute" && method === "GET") {
      const limit = url.searchParams.get("limit");
      const offset = url.searchParams.get("offset");
      const r = await findByAttribute(
        url.searchParams.get("attr") ?? "",
        JSON.parse(url.searchParams.get("value") ?? "null"),
        { ...(limit != null ? { limit: Number(limit) } : {}), ...(offset != null ? { offset: Number(offset) } : {}) },
        url.origin,
      );
      return json(r);
    }
    return json({ error: "not faked" }, 404);
  } catch (e) {
    return json({ message: e instanceof Error ? e.message : String(e) }, 503);
  }
}
