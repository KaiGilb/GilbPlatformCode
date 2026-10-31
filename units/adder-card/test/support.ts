// Shared set-up for the tests. Not shipped (the package files are `src` only).
// The peers `lws-records`, `plan-self-source` (the own-card finding), `own-card`, `vault-profile-photo` (the self-card door) and
// `vault-origin-rule` are the REAL ones, over a fake `fetch`: a fake platform with one landing vault whose own card, when there is
// one, sits at its derived address, and whose idempotent `POST /lws/vault/<vault>/selfcard` door makes it (201) or answers it (200).
// Shape taken from the provider's `adderCard` tests; nothing else of their world is needed.
import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-vault-profile-photo";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";

export const BASE = "https://example.test";
export const HOST = "https://holder.example.test";
/** The person's own (landing) vault and the entity of it. */
export const P = `${HOST}/base/pann`;
export const P_ENTITY = `${HOST}/base/e/annvault`;
export const PRINCIPAL = "https://id.example.test/base/p/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const vault = (over: Partial<ReachableVault> = {}): ReachableVault => ({
  vaultId: P,
  entity: P_ENTITY,
  name: "Ann",
  parent: null,
  parentAmbiguous: false,
  modes: ["read", "write"],
  represents: null,
  isLandingVault: true,
  ...over,
});

export const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function resp(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export async function setUp(options: { ownCard?: boolean } = {}) {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLwsAuth();
  resetVaultContextCache();
  resetStoredSpellingCache();
  setBaseOrigin(BASE);
  setSystemVaultHosts([]);
  setSystemHostLabels(["id"]);
  setLwsAuth({
    bearerHeaderFor: async () => ({ authorization: "DPoP fake-access-token" }),
    dpopReadAuth: async (_m?: string, url?: string) => ({ authorization: "DPoP fake-access-token", dpop: `proof(GET ${url})` }),
    dpopWriteAuth: async (m: string, url: string) => ({ authorization: "DPoP fake-access-token", dpop: `proof(${m} ${url})` }),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: async () => ({ principal: PRINCIPAL, vault: null, vaults: [] }), invalidate: vi.fn() },
  } as never);
  const root = vaultRootOf(P)!;
  const derivedId = await selfCardIdForVault(root);
  const cardUri = `${root}/e/${derivedId}`;
  const entities = new Map<string, { type: string; facts: Record<string, unknown> }>();
  const calls: Call[] = [];
  let card: { type: string; facts: Record<string, unknown> } | null = options.ownCard === false ? null : { type: "t:Person", facts: { "a:name": "Ann Ward" } };
  const fetchFake = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
    calls.push({ method, url, headers, body: typeof init.body === "string" ? init.body : null });
    const u = new URL(url);
    if (u.origin !== HOST) return resp(404, { error: "not served here" });
    const selfcard = /^\/lws\/vault\/([^/]+)\/selfcard$/.exec(u.pathname);
    if (selfcard && method === "POST") {
      if (decodeURIComponent(selfcard[1]!) !== P) return resp(403, { error: "Forbidden" });
      const adopted = card !== null;
      const sent = JSON.parse(String(init.body ?? "{}")) as { facts?: Record<string, unknown> };
      card = card ?? { type: "t:Person", facts: sent.facts ?? {} };
      const loc = `${HOST}/lws/r/${derivedId}`;
      return resp(adopted ? 200 : 201, { "@id": loc }, { location: loc });
    }
    const rec = /^\/lws\/r\/([^/]+)$/.exec(u.pathname);
    if (rec && method === "GET") {
      const id = decodeURIComponent(rec[1]!);
      if (id === derivedId && card) return resp(200, { "@id": cardUri, "@type": card.type, ...card.facts }, { etag: '"c1"' });
      const e = entities.get(id);
      if (e) return resp(200, { "@id": `${root}/e/${id}`, "@type": e.type, ...e.facts }, { etag: '"e1"' });
      return resp(404);
    }
    return resp(404);
  });
  vi.stubGlobal("fetch", fetchFake);
  return {
    fetchFake,
    calls,
    derivedId,
    cardUri,
    get hasCard() {
      return card !== null;
    },
    requests: (method: string, url: RegExp) => calls.filter((c) => c.method === method && url.test(c.url)),
    cardReads: () => calls.filter((c) => c.method === "GET" && c.url.endsWith(`/lws/r/${derivedId}`)).length,
  };
}
export type World = Awaited<ReturnType<typeof setUp>>;

export function tearDown(): void {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}
