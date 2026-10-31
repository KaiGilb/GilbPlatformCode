// Shared set-up for the tests. Not shipped (the package files are `src` only). The platform settings the real peers read, a fake auth seam
// whose proof names the request it was made for (`dpop: htu=<origin><path>`), and ONE `fetch` that answers both servers the unit talks to:
// the ontology master (`ONTOLOGY`, the catalogue fixtures) and the platform's vaults (`fakeFetch` of test/fakePlaceStore.ts).
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { fakeFetch } from "./fakePlaceStore";
import { masterFetch, type MasterOver } from "./masterFetch";

/** The platform's apex, as the host sets it at start-up. Every vault below is a subdomain of it. */
export const APEX = "https://platform.example.test";
/** The ontology master's origin (`masterFetch` serves it). */
export const ONTOLOGY = "https://ontology.example.test";
export const TOKEN = "tok-test";
export const PRINCIPAL = "https://id.platform.example.test/base/p/kai";

const proofFor = (url: string) => {
  const u = new URL(url);
  return `htu=${u.origin}${u.pathname}`;
};

export function setUp(): void {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["ontology.example.test", "id.platform.example.test"]);
  setTermOrigin(ONTOLOGY);
  setLwsAuth({
    bearerHeaderFor: async () => ({ authorization: `DPoP ${TOKEN}` }),
    dpopReadAuth: async (_m: string, url: string) => ({ authorization: `DPoP ${TOKEN}`, dpop: proofFor(url) }),
    dpopWriteAuth: async (_m: string, url: string) => ({ authorization: `DPoP ${TOKEN}`, dpop: proofFor(url) }),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: async () => ({ principal: PRINCIPAL, vault: null, vaults: [] }), invalidate: vi.fn() },
  } as never);
  resetVaultContextCache();
  resetStoredSpellingCache();
}

/** Stubs the global `fetch`: the master's host goes to `masterFetch`, every other host to the vault store. Returns the master's request log. */
export function stubNetwork(over: MasterOver = {}): { log: string[]; fetchSpy: ReturnType<typeof vi.fn> } {
  const m = masterFetch(over);
  const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    return new URL(url).origin === ONTOLOGY ? m.fetchImpl(url, init) : fakeFetch(input, init);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return { log: m.log, fetchSpy };
}

export function tearDown(): void {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetTermOrigin();
}
