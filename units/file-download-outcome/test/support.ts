// Shared set-up for the tests. Not shipped (the package files are `src` only). The peers are the real ones; the auth seam is a
// fake host, and `fetch` is a fake.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";
export const VAULT_HOST = "https://mona.platform.example.test";

export function fakeAuth(over: Partial<LwsAuthHost> = {}) {
  const host = {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "Bearer b-tok" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP d-tok", dpop: "proof" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP w-tok", dpop: "proof" })),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: vi.fn(async () => ({ principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] })), invalidate: vi.fn() },
  };
  return Object.assign(host, over) as typeof host;
}

export function setUp(over: Partial<LwsAuthHost> = {}) {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts(["ontology.platform.example.test"]);
  const host = fakeAuth(over);
  setLwsAuth(host);
  return host;
}
export function tearDown(): void {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}

export interface Reply {
  status: number;
  headers?: Record<string, string>;
  bytes?: number;
  empty?: boolean;
  body?: string;
  blobType?: string;
}
export function reply(r: Reply): Response {
  const headers = new Headers(r.headers ?? { "content-type": "image/png" });
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers,
    blob: async () => (r.empty ? new Blob([]) : new Blob([new Uint8Array(r.bytes ?? 64)], { type: r.blobType ?? "image/png" })),
    text: async () => r.body ?? "{}",
    body: { cancel: async () => undefined },
  } as unknown as Response;
}
