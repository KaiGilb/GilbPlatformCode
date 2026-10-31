// A SessionCredential stand-in: it signs every request with a DPoP-shaped pair that names the method and the URL it was asked for, so
// a test can read which request carried which credential. It reports the sign-in's session: the principal, the landing vault and the vault set.
import type { SessionCredential, GilbSession } from "@kaigilb/gilbplatformcode-signin/session";

export function fakeSession(session: GilbSession) {
  const signed: { method: string; url: string }[] = [];
  let sessionReads = 0;
  const credential = {
    async authHeaders(method: string, url: string) {
      signed.push({ method, url });
      return { Authorization: "DPoP fake-access-token", DPoP: `proof(${method} ${url})` };
    },
    async getSession() {
      sessionReads += 1;
      return session;
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
