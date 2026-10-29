// COPIED UNCHANGED from units/plan-card-hosts-gilbplatform/test/fakeSession.ts (a unit's test fake cannot be imported by path: its bare imports
// resolve from the unit's folder, which has no node_modules here). If the unit's copy changes, copy it again.
// A SessionCredential stand-in: it signs every request with a DPoP-shaped pair that names the method and the URL it was asked for, so
// a test can read which request carried which credential. It holds one vault with the read and write modes.
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

export const PRINCIPAL = "https://id.platform.example.test/base/p/kai";

export interface FakeSessionOptions {
  vaults?: { vaultId: string; modes: ("read" | "write")[] }[];
}

export function fakeSession(opts: FakeSessionOptions = {}) {
  const signed: { method: string; url: string }[] = [];
  let sessionReads = 0;
  const credential = {
    async authHeaders(method: string, url: string) {
      signed.push({ method, url });
      return { Authorization: "DPoP fake-access-token", DPoP: `proof(${method} ${url})` };
    },
    async getSession() {
      sessionReads += 1;
      return {
        principal: PRINCIPAL,
        vault: null,
        vaults: opts.vaults ?? [],
      };
    },
    invalidate() {},
  };
  return {
    session: credential as unknown as SessionCredential,
    signed,
    get sessionReads() {
      return sessionReads;
    },
  };
}
