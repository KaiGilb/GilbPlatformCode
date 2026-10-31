// Shared set-up for the tests. Not shipped (the package files are `src` only).
// The peer `lws-records` is the REAL one, over a fake `fetch` and a fake host for the auth seam.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";

export function setUp(): void {
  setBaseOrigin(ORIGIN);
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

/** What a fake PATCH answers: a status and the ETag it serves, or a promise of them (held until the test lets it go). */
export type PatchAnswer = { status: number; etag?: string | null };

/**
 * A fake vault: `GET /lws/r/<id>` answers the record `read(id, n)` gives (its facts and ETag, or 404 for null; n = 1 for the first read of the id);
 * `PATCH` answers `patch(id, n, seen)` (n = 1 for the first patch of the id). Anything else (a vault context read) is 404.
 */
export function fakeVault(opts: {
  read?: (id: string, n: number) => { facts: Record<string, unknown>; etag: string | null } | null;
  patch?: (id: string, n: number, seen: Seen) => PatchAnswer | Promise<PatchAnswer>;
}) {
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
    const id = m[1]!;
    if (method === "GET") {
      const n = (reads.get(id) ?? 0) + 1;
      reads.set(id, n);
      const r = opts.read ? opts.read(id, n) : null;
      if (r === null) return resp(404);
      return resp(200, { body: { "@id": `https://vault.example.test/base/e/${id}`, "@type": "t:Person", ...r.facts }, headers: r.etag === null ? {} : { etag: r.etag } });
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
  return { seen, fetchFake, patches: () => seen.filter((s) => s.method === "PATCH"), reads: () => seen.filter((s) => s.method === "GET") };
}

/** A promise you resolve yourself: holds a fake PATCH in flight. */
export function gate<T = void>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}
