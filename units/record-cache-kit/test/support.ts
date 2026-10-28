// Shared set-up for the tests: the platform settings, and a fake host for the auth seam that records what the client asked it.
// Not shipped (the package files are `src` only).
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";
export const SYSTEM_HOSTS = ["ontology.platform.example.test", "geo.platform.example.test", "life.platform.example.test", "id.platform.example.test", "kaizen.platform.example.test"];

/** A host whose every header-forming member answers a DPoP pair and records its arguments. */
export function fakeHost() {
  return {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP tok-bearer", dpop: "proof-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok-read", dpop: "proof-read" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok-dpop", dpop: "proof-xyz" })),
    invalidateDpop: vi.fn(),
    tokenManager: {
      getSession: vi.fn(async () => ({ principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] })),
      invalidate: vi.fn(),
    },
  } satisfies LwsAuthHost;
}
export type FakeHost = ReturnType<typeof fakeHost>;

/** Sets the platform settings and a fake host; returns the host. */
export function setUp(origin: string = ORIGIN): FakeHost {
  setBaseOrigin(origin);
  setSystemVaultHosts(SYSTEM_HOSTS);
  const host = fakeHost();
  setLwsAuth(host);
  return host;
}

export function tearDown(): void {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}

/** A fetch Response stand-in with a real Headers bag. */
export function resp(status: number, opts: { body?: unknown; headers?: Record<string, string> } = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(opts.headers ?? {}),
    json: async () => opts.body,
    text: async () => (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? "")),
  } as unknown as Response;
}
