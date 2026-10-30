// Shared set-up for the tests: the platform settings and a fake host for the auth seam. Not shipped (the package files are `src` only).
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";

export function fakeAuth() {
  return {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP tok-bearer", dpop: "proof-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t", dpop: "p" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tw", dpop: "pw" })),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: vi.fn(async () => ({ principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] })), invalidate: vi.fn() },
  } satisfies LwsAuthHost;
}
export type FakeAuth = ReturnType<typeof fakeAuth>;

export function setUp(): FakeAuth {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts(["id.platform.example.test"]);
  const auth = fakeAuth();
  setLwsAuth(auth);
  return auth;
}

export function tearDown(): void {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
}

/** A record as `readRecord` answers it. */
export function rec(id: string, facts: Record<string, string>, entityUri = `https://home.example.test/base/e/${id}`) {
  return { id, entityUri, typeUri: "t:Person", facts, opaqueFacts: [] as string[], etag: `"sha256:${id}"` } as never;
}

/** A host with the two members, and what they were asked. */
export function fakeHost(keys: readonly string[] = ["profilePhoto", "hasPhoto"]) {
  const noted: Array<[string, boolean]> = [];
  return {
    noted,
    photoReadKeys: vi.fn(async () => keys),
    noteVaultPicture: (v: string, has: boolean) => {
      noted.push([v, has]);
    },
  };
}

/** An in-memory `localStorage` (the unit reads and writes it; a test host provides one). */
export function installLocalStorage(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  });
  return m;
}
