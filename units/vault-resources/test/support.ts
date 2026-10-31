// Shared set-up for the tests. Not shipped (the package files are `src` only).
// The peers `lws-records`, `vault-origin-rule` and `lws-vault-sets` are the REAL ones, over a fake `fetch`: a fake platform that keeps
// each vault's entities at that vault's own host and answers a request only at the host that holds the entity (the platform's
// non-disclosure 404 anywhere else, the apex included). Shape taken from the `record-update` unit's test/support.ts.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";

/** The platform's apex, as the host sets it at start-up. Every vault below is a subdomain of it. */
export const APEX = "https://platform.example.test";
export const ORIGIN_A = "https://geo.platform.example.test";
export const ORIGIN_B = "https://other.platform.example.test";
/** A vault's namespace: its origin plus `/base`. */
export const VAULT_A = `${ORIGIN_A}/base`;
export const VAULT_B = `${ORIGIN_B}/base`;

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["ontology.platform.example.test"]);
  setLwsAuth({
    bearerHeaderFor: async () => ({ authorization: "DPoP t", dpop: "p" }),
    dpopReadAuth: async () => ({ authorization: "DPoP t", dpop: "p" }),
    dpopWriteAuth: async () => ({ authorization: "DPoP t", dpop: "p" }),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: async () => ({ principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] }), invalidate: vi.fn() },
  });
  resetVaultContextCache();
  resetStoredSpellingCache();
}
export function tearDown(): void {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}

export function resp(status: number, opts: { body?: unknown; headers?: Record<string, string> } = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(opts.headers ?? {}),
    json: async () => opts.body,
    text: async () => (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? "")),
  } as unknown as Response;
}

export interface Seen {
  method: string;
  url: string;
  origin: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Entity {
  type: string;
  facts: Record<string, unknown>;
  etag: string;
}

/**
 * A fake platform. Entities live at `store.get(origin).get(id)`. `POST /lws/vault/<namespace>/c` mints `n1`, `n2`, ... at the
 * namespace's own host; `GET`, `PATCH` (merge patch: `null` clears) and `DELETE` of `/lws/r/<id>` answer ONLY at the host that holds it.
 * `slow` delays a GET (for the concurrency tests); `failGet` makes a GET answer that status.
 */
export function fakePlatform(opts: { slow?: (id: string) => Promise<void>; failGet?: (id: string) => number | null } = {}) {
  const seen: Seen[] = [];
  const store = new Map<string, Map<string, Entity>>();
  let minted = 0;
  let inFlight = 0;
  let peak = 0;
  const at = (origin: string) => {
    let m = store.get(origin);
    if (!m) store.set(origin, (m = new Map()));
    return m;
  };
  const fetchFake = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const entry: Seen = { method, url, origin: u.origin, headers, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) };
    seen.push(entry);
    if (method === "POST" && /\/lws\/vault\/.+\/c$/.test(u.pathname)) {
      const id = `n${++minted}`;
      const body = entry.body as { type: string; facts: Record<string, unknown> };
      at(u.origin).set(id, { type: body.type, facts: { ...body.facts }, etag: `"v1-${id}"` });
      return resp(201, { headers: { location: `${u.origin}/lws/r/${id}`, etag: `"v1-${id}"` } });
    }
    const m = /\/lws\/r\/([^/?#]+)/.exec(u.pathname);
    if (!m) return resp(404);
    const id = decodeURIComponent(m[1]!);
    const held = at(u.origin).get(id);
    if (method === "GET") {
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        if (opts.slow) await opts.slow(id);
        const fail = opts.failGet?.(id);
        if (fail) return resp(fail);
        if (!held) return resp(404);
        return resp(200, { body: { "@id": `${u.origin}/base/e/${id}`, "@type": held.type, ...held.facts }, headers: { etag: held.etag } });
      } finally {
        inFlight--;
      }
    }
    if (!held) return resp(404);
    if (method === "PATCH") {
      for (const [k, v] of Object.entries(entry.body as Record<string, unknown>)) {
        if (v === null) delete held.facts[k];
        else held.facts[k] = v;
      }
      held.etag = `"v2-${id}-${Math.random().toString(36).slice(2, 6)}"`;
      return resp(200, { headers: { etag: held.etag } });
    }
    if (method === "DELETE") {
      at(u.origin).delete(id);
      return resp(204);
    }
    return resp(405);
  });
  vi.stubGlobal("fetch", fetchFake);
  return {
    seen,
    fetchFake,
    at,
    peak: () => peak,
    of: (method: string) => seen.filter((s) => s.method === method),
  };
}
