// Shared set-up for the tests. Not shipped. The peers `lws-session-bridge`, `vault-origin-rule` and `base-origin` are the REAL ones; `fetch` is the
// test kit's stand-in for `GET /base/source-name` (test/addedByTestkit.ts, the source's own kit). The credential is a recording one.
import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { __resetAddedByForTest } from "../src/addedBy";

export const APEX = "https://platform.example.test";
export const ANNA = "https://anna.platform.example.test/base/e/vsc-anna";
export const BO = "https://bo.platform.example.test/base/e/vsc-bo";
export const HYTTA = "https://hytta.platform.example.test";
export const itemAt = (host: string, id: string) => `${host}/base/e/${id}`;

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["geo.platform.example.test"]);
  setLwsAuth({
    bearerHeaderFor: async (url: string) => ({ authorization: `Bearer for ${url}` }),
    dpopReadAuth: async () => ({}),
    dpopWriteAuth: async () => ({}),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: async () => ({ principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] }), invalidate: vi.fn() },
  });
  __resetAddedByForTest();
}

export function tearDown(): void {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  __resetAddedByForTest();
}

export const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
