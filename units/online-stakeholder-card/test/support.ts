// Shared set-up for the tests, not shipped (the package files are `src` only): the platform settings and a fake host for the auth seam.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export const ORIGIN = "https://platform.example.test";
export const ONTOLOGY = "https://ontology.example.test";
export const SYSTEM_HOSTS = ["ontology.platform.example.test", "geo.platform.example.test", "life.platform.example.test", "id.platform.example.test", "kaizen.platform.example.test"];

/** A host whose every header-forming member answers a DPoP pair and records its arguments. */
export function fakeAuth() {
  return {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP tok-bearer", dpop: "proof-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "proof" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "proof" })),
    invalidateDpop: vi.fn(),
    tokenManager: {
      getSession: vi.fn(async () => ({ principal: "https://id.platform.example.test/base/p/ann", vault: null, vaults: [] })),
      invalidate: vi.fn(),
    },
  } satisfies LwsAuthHost;
}

/** Sets the platform settings and a fake auth host; returns the auth host. */
export function setUp() {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts(SYSTEM_HOSTS);
  setTermOrigin(ONTOLOGY);
  const auth = fakeAuth();
  setLwsAuth(auth);
  return auth;
}

export function tearDown(): void {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetTermOrigin();
}
