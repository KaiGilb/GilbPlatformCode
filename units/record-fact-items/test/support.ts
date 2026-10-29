// Shared set-up for the tests. Not shipped (the package files are `src` only).
// The peer `lws-records` is the REAL one, over a fake `fetch` and a fake host for the auth seam.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";
export const TAG = `"sha256:${"0123456789abcdef".repeat(4)}"`;

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

/**
 * A fake vault: `GET /lws/r/<id>` answers the record `read(id)` gives (its facts and ETag, or 404 for null); `PATCH` answers
 * `patch(id, n)` (the status, n = 1 for the first patch of the id); anything else (a vault context read) is 404.
 */
export function fakeVault(opts: {
  read: (id: string, n: number) => { facts: Record<string, unknown>; etag: string | null } | null;
  patch?: (id: string, n: number) => number;
}) {
  const seen: Seen[] = [];
  const reads = new Map<string, number>();
  const patches = new Map<string, number>();
  const fetchFake = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const m = /\/lws\/r\/([^/?#]+)/.exec(url);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    seen.push({ method, url, headers, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    if (!m) return resp(404);
    const id = m[1]!;
    if (method === "GET") {
      const n = (reads.get(id) ?? 0) + 1;
      reads.set(id, n);
      const r = opts.read(id, n);
      if (r === null) return resp(404);
      return resp(200, { body: { "@id": `https://vault.example.test/base/e/${id}`, "@type": "t:Person", ...r.facts }, headers: r.etag === null ? {} : { etag: r.etag } });
    }
    if (method === "PATCH") {
      const n = (patches.get(id) ?? 0) + 1;
      patches.set(id, n);
      const status = opts.patch ? opts.patch(id, n) : 200;
      return resp(status, { headers: { etag: `"next-${n}"` } });
    }
    return resp(404);
  });
  vi.stubGlobal("fetch", fetchFake);
  return { seen, fetchFake, patches: () => seen.filter((s) => s.method === "PATCH"), reads: () => seen.filter((s) => s.method === "GET") };
}
