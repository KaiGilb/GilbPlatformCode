// Shared set-up for the tests. Not shipped. The platform settings the real peers read, and a fake auth seam.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { installFetch, reset } from "./vault";

export const APEX = "https://platform.example.test";
export const PRINCIPAL = "https://id.platform.example.test/base/p/kai";

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["veda.platform.example.test"]);
  setLwsAuth({
    bearerHeaderFor: async () => ({ authorization: "DPoP t" }),
    dpopReadAuth: async () => ({ authorization: "DPoP t", dpop: "p" }),
    dpopWriteAuth: async () => ({ authorization: "DPoP t", dpop: "p" }),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: async () => ({ principal: PRINCIPAL, vault: null, vaults: [] }), invalidate: vi.fn() },
  } as never);
  resetVaultContextCache();
  resetStoredSpellingCache();
  reset();
  installFetch();
}
export function tearDown(): void {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}
