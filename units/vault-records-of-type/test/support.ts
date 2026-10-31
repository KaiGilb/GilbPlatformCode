// Shared set-up for the tests. Not shipped (the package files are `src` only). The platform settings the real peers read, and a fake auth seam.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { fakeFetch } from "./fakePlaceStore";

export const APEX = "https://platform.example.test";
export const TOKEN = "tok-test";
export const PRINCIPAL = "https://id.platform.example.test/base/p/kai";
const proofFor = (url: string) => {
  const u = new URL(url);
  return `htu=${u.origin}${u.pathname}`;
};

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["veda.platform.example.test"]);
  setLwsAuth({
    bearerHeaderFor: async () => ({ authorization: `DPoP ${TOKEN}` }),
    dpopReadAuth: async (_m: string, url: string) => ({ authorization: `DPoP ${TOKEN}`, dpop: proofFor(url) }),
    dpopWriteAuth: async (_m: string, url: string) => ({ authorization: `DPoP ${TOKEN}`, dpop: proofFor(url) }),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: async () => ({ principal: PRINCIPAL, vault: null, vaults: [] }), invalidate: vi.fn() },
  } as never);
  resetVaultContextCache();
  resetStoredSpellingCache();
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
}
export function tearDown(): void {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}
