// Shared set-up for the tests. Not shipped (the package files are `src` only).
// Shape taken from `record-detail-reads` `test/support.ts`. The peers `lws-records`, `lws-vault-sets`, `vault-origin-rule` are the
// REAL ones, over a fake `fetch`: a fake platform in which every host is a store of its own. `GET /base/find-by-attribute` answers
// ONLY from the store of the host asked (no crossing, as on the platform), paged by `limit` and `offset` (20 by default, 400 for a
// paged call when `refusePaging` is set); `GET /lws/r/<id>` answers a record at any host unless the id is in `unreadable`.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const APEX = "https://platform.example.test";
export const VAULT_B = "https://hytta.platform.example.test";
export const VAULT_A = "https://olda.platform.example.test";
export const SYSTEM = "https://geo.platform.example.test";
export const NORWAY = `${SYSTEM}/base/e/osm-r-2978650`;

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["geo.platform.example.test"]);
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

export function resp(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
  } as unknown as Response;
}

/** `n` child entity URIs in `origin`'s vault, from `from`. */
export const kids = (origin: string, from: number, n: number, seg = "base"): string[] => Array.from({ length: n }, (_, i) => `${origin}/${seg}/e/kommune-${from + i}`);

export interface FindSeen {
  origin: string;
  attr: string | null;
  value: unknown;
  limit: string | null;
  offset: string | null;
}

export function fakePlatform(opts: {
  /** origin -> parent entity URI -> the children that store holds (entity URIs). */
  stores?: Record<string, Record<string, string[]>>;
  /** parent URI -> the total the find reports (default: the number of children in that store). */
  counts?: Record<string, number>;
  unreadable?: string[];
  refusePaging?: boolean;
  /** the facts a read child serves besides its title; default: `a:memberOf` -> the parent asked about is unknown, so none. */
  childFacts?: (id: string) => Record<string, unknown>;
} = {}) {
  const finds: FindSeen[] = [];
  const reads: { id: string; url: string; origin: string }[] = [];
  const fetchFake = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/base/find-by-attribute") {
      const value = JSON.parse(u.searchParams.get("value") ?? "null");
      const seen: FindSeen = { origin: u.origin, attr: u.searchParams.get("attr"), value, limit: u.searchParams.get("limit"), offset: u.searchParams.get("offset") };
      finds.push(seen);
      const paged = seen.limit !== null || seen.offset !== null;
      if (paged && opts.refusePaging) return resp(400, "unknown param");
      const parent = typeof value === "object" && value ? (value as { "@id"?: string })["@id"] : undefined;
      const all = (parent && opts.stores?.[u.origin]?.[parent]) || [];
      const limit = seen.limit === null ? 20 : Number(seen.limit);
      const offset = seen.offset === null ? 0 : Number(seen.offset);
      return resp(200, { count: (parent && opts.counts?.[parent]) ?? all.length, ids: all.slice(offset, offset + limit) });
    }
    const m = /^\/lws\/r\/([^/]+)$/.exec(u.pathname);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      reads.push({ id, url, origin: u.origin });
      if (opts.unreadable?.includes(id)) return resp(403, "no");
      return resp(200, { "@id": `${u.origin}/base/e/${id}`, "@type": "t:Municipality", title: id, ...(opts.childFacts?.(id) ?? {}) });
    }
    return resp(404);
  });
  vi.stubGlobal("fetch", fetchFake);
  return { finds, reads, fetchFake, all: () => fetchFake.mock.calls.map((c) => String(c[0])) };
}
