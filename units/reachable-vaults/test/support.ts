// Test support, not shipped: the platform settings, a fake auth host that records its calls, and a fake fetch that serves `/lws/vaults`.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";

export function fakeAuth(over: Partial<LwsAuthHost> = {}) {
  return {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string): Promise<Record<string, string>> => ({ authorization: "DPoP tok-bearer", dpop: "proof-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string): Promise<Record<string, string>> => ({ authorization: "DPoP tok-read", dpop: "proof-read" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string): Promise<Record<string, string>> => ({ authorization: "DPoP tok-write", dpop: "proof-write" })),
    invalidateDpop: vi.fn(),
    tokenManager: {
      getSession: vi.fn(async () => ({ principal: "https://id.platform.example.test/base/p/ann", vault: null, vaults: [] })),
      invalidate: vi.fn(),
    },
    ...over,
  } satisfies LwsAuthHost;
}

/** Sets the base origin, the system hosts and a fake auth host; returns the auth host. */
export function setUp(over: Partial<LwsAuthHost> = {}) {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts(["id.platform.example.test"]);
  const auth = fakeAuth(over);
  setLwsAuth(auth);
  return auth;
}

export function tearDown(): void {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  vi.unstubAllGlobals();
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export interface Seen {
  url: string;
  init: RequestInit | undefined;
}

/** Stubs `fetch` with a function that answers each request with `answer`, and returns the list of requests seen. */
export function stubFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response>): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    seen.push({ url, init });
    return answer(url, init);
  });
  return seen;
}
