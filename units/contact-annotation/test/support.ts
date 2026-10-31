// Shared set-up for the tests. Not shipped (the package files are `src` only).
// The peers `lws-session-bridge`, `vault-origin-rule` and `base-origin` are the REAL ones. `fetch` is a stub of the platform; the credential
// the host supplies is a recording one: its header names the kind (read or write) and the method and URL it was asked to sign.
import { vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { __resetAnnotationCapability } from "../src/contactAnnotation";

export const APEX = "https://platform.example.test";
/** The holder's own vault and its node. */
export const HOME_HOST = "https://hytta.platform.example.test";
export const HOME = `${HOME_HOST}/base`;
/** The person's card lives in another vault, at another node. */
export const THEIRS_HOST = "https://anna.platform.example.test";
export const THEIRS = `${THEIRS_HOST}/base`;
export const PARTY = `${HOME}/e/rita0001`;

export const invalidate = vi.fn();

export function setUp(): void {
  invalidate.mockClear();
  setBaseOrigin(APEX);
  setSystemVaultHosts(["geo.platform.example.test"]);
  setLwsAuth({
    bearerHeaderFor: async () => ({ authorization: "DPoP t", dpop: "bearer" }),
    dpopReadAuth: async (m: string, u: string) => ({ authorization: "DPoP t", dpop: `read ${m} ${u}` }),
    dpopWriteAuth: async (m: string, u: string) => ({ authorization: "DPoP t", dpop: `write ${m} ${u}` }),
    invalidateDpop: invalidate,
    tokenManager: { getSession: async () => ({ principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] }), invalidate: vi.fn() },
  });
  __resetAnnotationCapability();
}

export function tearDown(): void {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  __resetAnnotationCapability();
}

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  keepalive: boolean | undefined;
}

/** Stubs `fetch` with one fixed answer; every request is recorded. */
export function stub(status: number, body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push(record(url, init));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  return calls;
}

export function record(url: string, init: RequestInit = {}): Call {
  return {
    url: String(url),
    method: init.method ?? "GET",
    headers: (init.headers ?? {}) as Record<string, string>,
    body: typeof init.body === "string" ? init.body : undefined,
    keepalive: init.keepalive,
  };
}

/** The wire answer of a read: `note` and `origin` are what the vault holds (null/"" = nothing). */
export function readAnswer(opts: { note?: string | null; origin?: string | null; vault?: string | null; heldParty?: string; others?: { entity: string; text: string }[] } = {}): unknown {
  const note = opts.note ?? null;
  const origin = opts.origin ?? null;
  return {
    me: "p",
    heldParty: opts.heldParty ?? PARTY,
    note,
    origin,
    notes: note ? [{ entity: `${HOME}/e/n1`, text: note }, ...(opts.others ?? [])] : [],
    origins: origin ? [{ entity: `${HOME}/e/o1`, text: origin }] : [],
    noteLoad: note ? "ok" : "empty",
    originLoad: origin ? "ok" : "empty",
    ...(opts.vault === null ? {} : { vault: opts.vault ?? HOME }),
  };
}
