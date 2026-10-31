// Test-only. An in-memory vault behind the network, at the level of `fetch`, READ side only. Adapted from GilbApp `src/lib/mynet/place/fakePlaceStore.ts`
// (commit a703b3ed78e612e2cab77e94876ce9bce109d5a3) through the held notes' copy of it (`held-notes/test/fakePlaceStore.ts`), which dropped the typed list;
// this one brings it back, because the unit lists. The REAL peers (`lws-records`, `lws-vault-sets`, `vault-resources`) run and this file is the platform.
//
//   GET /lws/vault/<vault>/records?type=<bare type>[&offset=n][&include=body]   the typed list, paged by `door.pageSize`
//   GET /lws/r/<id>                                                             one record
// Every request is logged in `calls`; a request with any method but GET is also kept in `writes` (a test of a read-only unit asserts it is empty).
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
export const calls: { method: string; url: string }[] = [];
export const writes: { method: string; url: string }[] = [];
let n = 0;
let seqNo = 0;

export interface Door {
  pageSize: number;
  /** Never say `complete`; always name the next offset. */
  neverComplete: boolean;
  /** Serve bodies when asked (`include=body`). */
  bodies: boolean;
  /** Replace the whole answer for a page (offset -> wire), for a test that needs a door's odd answer. */
  pages: ((offset: number) => Record<string, unknown> | null) | null;
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
  calls.push({ method, url: url.href });
  if (method !== "GET") {
    writes.push({ method, url: url.href });
    return json({ error: "this fake is read only" }, 405);
  }
  const list = /^\/lws\/vault\/([^/]+)\/records$/.exec(url.pathname);
  if (list) {
    const vault = decodeURIComponent(list[1]!);
    const types = url.searchParams.getAll("type");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const wantBody = url.searchParams.get("include") === "body";
    if (door.pages) {
      const custom = door.pages(offset);
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
