// Helpers for the live-mode tests: the app on a fresh module registry in live mode, a fake credential, and a fake NETWORK (the only thing faked).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { EMAIL, OTHER_VAULT, PLATFORM, PRINCIPAL, VAULT, reachBody, recordsBody, vaultNode } from "./liveFixtures";

export async function bootLive() {
  vi.resetModules();
  vi.stubEnv("VITE_PLATFORM", "live");
  vi.stubEnv("VITE_PINNED_VAULT", VAULT);
  vi.stubEnv("VITE_PLATFORM_ORIGIN", PLATFORM);
  const { LiveApp } = await import("../src/live/LiveApp");
  const { speed } = await import("../src/speed");
  const { session } = await import("../src/session");
  const { hub, cache } = await import("@kaigilb/gilbplatformcode-speed-kit");
  return { LiveApp, speed, session, hub, cache };
}

/** A credential the sign-in "fills": verifying a code adopts the session the server answered (principal), as `SessionCredential.signInWithCode` does. */
export function fakeCredential(principal = PRINCIPAL) {
  let held: { principal: string; vault: null; vaults: [] } | null = null;
  const invalidate = vi.fn();
  const credential = {
    signInWithCode: vi.fn(async () => { held = { principal, vault: null, vaults: [] }; return { token: "t", principal, needsVaultName: false }; }),
    get session() { return held; },
    async authHeaders(method: string, url: string) { return { Authorization: "DPoP fake-access-token", DPoP: `proof(${method} ${url})` }; },
    async getSession() { return held; },
    invalidate,
  };
  return { credential: credential as unknown as SessionCredential, invalidate, signInWithCode: credential.signInWithCode };
}

export interface NetOptions {
  reach?: ReturnType<typeof reachBody>;
  /** The status of every records answer (default 200). */
  recordsStatus?: number;
  rows?: number;
}

/** The network under `platformFetch`, and the sign-in's transport: both record every URL they are asked. */
export function fakeNet(opts: NetOptions = {}) {
  const urls: string[] = [];
  const headers: Record<string, Headers> = {};
  const signInUrls: string[] = [];
  const reach = opts.reach ?? reachBody([vaultNode(VAULT, "ann"), vaultNode(OTHER_VAULT, "zoe")]);
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const inner = async (url: string, init?: RequestInit): Promise<Response> => {
    urls.push(url);
    headers[url] = new Headers(init?.headers);
    const u = new URL(url);
    if (u.pathname === "/lws/vaults") return json(200, reach);
    if (/^\/lws\/vault\/[^/]+\/records$/.test(u.pathname)) {
      if ((opts.recordsStatus ?? 200) !== 200) return json(opts.recordsStatus!, { error: "unauthorized" });
      const q = u.searchParams;
      if (q.get("since") === "head" || q.get("since")?.startsWith("c")) return json(200, recordsBody(0, { nextCursor: "c-head" }));
      return json(200, recordsBody(opts.rows ?? 3, { nextOffset: opts.rows ?? 3 }));
    }
    return json(404, { error: "no_such_route" });
  };
  const transport = async (url: string) => { signInUrls.push(url); return { status: 200, json: async () => ({}) } as never; };
  return {
    inner: inner as never,
    transport: transport as never,
    urls,
    headers,
    signInUrls,
    records: () => urls.filter((u) => /\/records(\?|$)/.test(u)),
  };
}

/** Render the live app and walk the sign-in card: an email, then six digits. */
export async function liveApp(boot: Awaited<ReturnType<typeof bootLive>>, net = fakeNet(), creds = fakeCredential()) {
  const view = render(<boot.LiveApp makeSession={() => creds.credential} transport={net.transport} inner={net.inner} />);
  const user = userEvent.setup();
  return { ...view, user, net, ...creds };
}
export async function signInLive(user: ReturnType<typeof userEvent.setup>, email = EMAIL) {
  await user.type(await screen.findByTestId("sign-in-email"), email);
  await user.click(screen.getByTestId("sign-in-send-code"));
  await user.type(await screen.findByTestId("sign-in-code"), "123456");
}
export { waitFor };
