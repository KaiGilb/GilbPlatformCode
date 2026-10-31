// Shared set-up for the tests. Not shipped (the package files are `src` only).
// Shape taken from `record-detail-reads` `test/support.ts` (a fake platform that answers a record only at the host that holds it),
// cut to reads and extended with the served `@id` and `@type`, which the own-card test looks at. The peers `lws-records`,
// `vault-origin-rule`, `own-card` and `plan-self-source` are the REAL ones, over a fake `fetch` and a fake host for the auth seam.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetSystemHostLabels, setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { resetMyNetProfileUrl, setMyNetProfileUrl } from "../src/myNetProfileUrl";

/** The platform's apex, as the host sets it at start-up. Every vault below is a subdomain of it. */
export const APEX = "https://platform.example.test";
export const PROFILE_URL = "https://profile.example.test/mynet/profile";
/** The holder's landing vault (his seat), a nested organisation vault, a nested person vault and one shared with him. */
export const P = "https://t1kai.platform.example.test/vault";
export const ORG = "https://t1org.platform.example.test/vault";
export const KID = "https://t1kid.platform.example.test/vault";
export const THREE = "https://t1three.platform.example.test/vault";
export const PERSON = "https://ontology.platform.example.test/base/t/Person";
export const ORGANIZATION = "https://ontology.platform.example.test/base/t/Organization";
/** The entity of the landing vault, where the profile pointer is read. */
export const P_ENTITY = `${P}/e/t1kai-vault`;

export const row = (vaultId: string, over: Partial<ReachableVault> = {}): ReachableVault =>
  ({ vaultId, entity: `${vaultId}/e/${new URL(vaultId).hostname.split(".")[0]}-vault`, name: vaultId, parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: false, ...over }) as ReachableVault;
export const LANDING = row(P, { isLandingVault: true, represents: PERSON, name: "t1kai", entity: P_ENTITY });
export const ORG_CHILD = row(ORG, { parent: { entity: P, vaultId: P }, represents: ORGANIZATION, name: "t1org" });
export const KID_CHILD = row(KID, { parent: { entity: P, vaultId: P }, represents: PERSON, name: "t1kid" });
export const SHARED = row(THREE, { represents: PERSON, name: "t1three" });
export const ALL = [LANDING, ORG_CHILD, KID_CHILD, SHARED];

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["ontology.platform.example.test"]);
  setSystemHostLabels(["id", "ontology"]);
  setMyNetProfileUrl(PROFILE_URL);
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
  vi.restoreAllMocks();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetSystemHostLabels();
  resetMyNetProfileUrl();
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

/** A record the fake platform holds: where it lives, the address it serves itself under, its type and its facts. */
export interface Held {
  origin: string;
  /** The served `@id`; defaults to `<origin>/vault/e/<id>`. */
  atId?: string;
  type?: string;
  facts?: Record<string, unknown>;
}

/**
 * A fake platform. `GET /lws/r/<id>` is answered ONLY at the host that holds the record (`held[id].origin`); at any other host,
 * the apex included, it is the non-disclosure 404. `read(id, n)` may answer instead (a status or a held promise) to put a read in
 * flight or to fail it; return null to fall through to `held`.
 */
export type ReadHook = (id: string, n: number) => Response | null | Promise<Response | null>;

export function fakePlatform(opts: { held?: Record<string, Held>; read?: ReadHook } = {}) {
  const seen: { method: string; url: string }[] = [];
  const reads = new Map<string, number>();
  const fetchFake = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    seen.push({ method, url });
    const m = /\/lws\/r\/([^/?#]+)/.exec(url);
    if (!m || method !== "GET") return resp(404);
    const id = decodeURIComponent(m[1]!);
    const n = (reads.get(id) ?? 0) + 1;
    reads.set(id, n);
    if (opts.read) {
      const r = await opts.read(id, n);
      if (r) return r;
    }
    const h = opts.held?.[id];
    if (!h || new URL(url).origin !== h.origin) return resp(404);
    return resp(200, { body: { "@id": h.atId ?? `${h.origin}/vault/e/${id}`, "@type": h.type ?? "t:Person", ...(h.facts ?? {}) }, headers: { etag: `"e-${id}"` } });
  });
  vi.stubGlobal("fetch", fetchFake);
  return {
    seen,
    fetchFake,
    reads: () => seen.filter((s) => s.method === "GET" && /\/lws\/r\//.test(s.url)),
    readUrls: () => seen.filter((s) => s.method === "GET" && /\/lws\/r\//.test(s.url)).map((s) => s.url),
    readCount: (id: string) => reads.get(id) ?? 0,
  };
}

/** A promise you resolve yourself: holds a fake answer in flight. */
export function gate<T = void>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}
