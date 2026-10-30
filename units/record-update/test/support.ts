// Shared set-up for the tests. Not shipped (the package files are `src` only).
// The peers `lws-records`, `vault-origin-rule` and `record-cache-kit` are the REAL ones, over a fake `fetch` (a fake platform that
// answers per host) and a fake host for the auth seam. Shape taken from the `record-sidecar-save` unit's test/support.ts.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

/** The platform's apex, as the host sets it at start-up. Every vault below is a subdomain of it. */
export const APEX = "https://platform.example.test";
export const VAULT_ORIGIN = "https://geo.platform.example.test";
export const VAULT = `${VAULT_ORIGIN}/base`;
export const OTHER_ORIGIN = "https://other.platform.example.test";

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
  headers: Record<string, string>;
  body: unknown;
}

/**
 * A fake platform. `GET /lws/r/<id>` is answered ONLY at the host that holds the record (`held[id]` = that host's origin); at any
 * other host, the apex included, it is the non-disclosure 404 the platform gives for a record it does not hold there.
 * `PATCH /lws/r/<id>` answers `patch(id, n, seen)` (n = 1 for the first patch of the id), else 200 with ETag `"next-<id>-<n>"`.
 */
export function fakePlatform(opts: {
  held?: Record<string, { origin: string; facts: Record<string, unknown>; etag?: string | null }>;
  patch?: (id: string, n: number, seen: Seen) => { status: number; etag?: string | null } | Promise<{ status: number; etag?: string | null }>;
  read?: (id: string, n: number, seen: Seen) => Response | null | Promise<Response | null>;
} = {}) {
  const seen: Seen[] = [];
  const reads = new Map<string, number>();
  const patches = new Map<string, number>();
  const fetchFake = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const m = /\/lws\/r\/([^/?#]+)/.exec(url);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const entry: Seen = { method, url, headers, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) };
    seen.push(entry);
    if (!m) return resp(404);
    const id = decodeURIComponent(m[1]!);
    if (method === "GET") {
      const n = (reads.get(id) ?? 0) + 1;
      reads.set(id, n);
      if (opts.read) {
        const r = await opts.read(id, n, entry);
        if (r) return r;
      }
      const h = opts.held?.[id];
      if (!h || new URL(url).origin !== h.origin) return resp(404);
      return resp(200, {
        body: { "@id": `${h.origin}/base/e/${id}`, "@type": "t:Person", ...h.facts },
        headers: h.etag === null || h.etag === undefined ? {} : { etag: h.etag },
      });
    }
    if (method === "PATCH") {
      const n = (patches.get(id) ?? 0) + 1;
      patches.set(id, n);
      const a = opts.patch ? await opts.patch(id, n, entry) : { status: 200, etag: `"next-${id}-${n}"` };
      return resp(a.status, { headers: a.etag ? { etag: a.etag } : {} });
    }
    return resp(404);
  });
  vi.stubGlobal("fetch", fetchFake);
  return {
    seen,
    fetchFake,
    reads: () => seen.filter((s) => s.method === "GET"),
    patches: () => seen.filter((s) => s.method === "PATCH"),
    readUrls: () => seen.filter((s) => s.method === "GET").map((s) => s.url),
  };
}

/** A promise you resolve yourself: holds a fake answer in flight. */
export function gate<T = void>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}
