import { thumbprint, mintToken, type Caller } from "./auth";
import { b64url, jsonOfB64url, sha256, sha256Hex, utf8 } from "./bytes";
import { badRequest, empty, json, parseBody, type Core, type Req } from "./http";
import type { RenewFamily } from "./types";

/** src/auth/renewable-sign-in.ts:81, :84. */
export const RENEW_MIN_WINDOW_SEC = 300;
export const RENEW_MAX_WINDOW_SEC = 14 * 24 * 60 * 60;
const ACCESS_TOKEN_TTL_SEC = 7 * 24 * 3600;

/** The one refusal body of the renew route (src/routes/renew-sign-in.ts:27): distinct sentences would say which check failed. */
const refused = (): Response => json(401, { error: "Unauthorized", message: "renewal refused" }, { "cache-control": "no-store" });

/** `rsi1.<family id>.<secret>`; the secret of rotation n is derived, so it needs no store. */
const credentialOf = (f: RenewFamily): string => `rsi1.${f.id}.${b64url(sha256(utf8(`${f.id}:${f.rotation}`)))}`;

/**
 * Starts a renewable sign-in for a verify-code that sent `renew: true`.
 * Mirrors: src/routes/email-auth.ts:457-468 (window default and cap), `startFamily` src/auth/renewable-sign-in.ts:500.
 *
 * @param windowSec the window the client asked for (already checked to be an integer of at least 300), or undefined for the default
 * @returns the family, its credential, and the window the first token is held to
 */
export function startRenewal(core: Core, email: string, jkt: string, windowSec: number | undefined): { renew: string; renewExpiresAt: string; windowSec: number } {
  const window = Math.min(windowSec ?? RENEW_MAX_WINDOW_SEC, RENEW_MAX_WINDOW_SEC);
  const f: RenewFamily = { id: `rsi${core.nextId()}`, email, jkt, windowSec: window, expiresAt: core.o.now() + window * 1000, rotation: 0, ended: false };
  core.s.renewals.set(f.id, f);
  return { renew: credentialOf(f), renewExpiresAt: new Date(f.expiresAt).toISOString(), windowSec: window };
}

/** The refusal for a bad `renewWindowSec` (src/routes/email-auth.ts:462-468), or null. Judged only when `renew` is true. */
export function checkRenewWindow(raw: unknown): Response | null {
  if (raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < RENEW_MIN_WINDOW_SEC) return badRequest("renewWindowSec must be an integer of at least 300 seconds");
  return null;
}

function endFamilies(core: Core, match: (f: RenewFamily) => boolean): void {
  for (const f of core.s.renewals.values()) if (match(f)) f.ended = true;
}

function endSessions(core: Core, jkt: string): void {
  for (const s of core.s.sessions.values()) if (s.jkt === jkt) s.ended = true;
}

/**
 * POST /base/auth/email/renew: rotate a renewable sign-in. Body `{ renew: "rsi1.<id>.<secret>" }`, the proof is the header and carries no `ath`.
 * Mirrors: src/routes/renew-sign-in.ts:99-156 (one 401 body :27; the proof's key must be the family's; answer `{ token, renew, renewExpiresAt, principal }` :150-155;
 * the token lasts at most the new window :140-141); `renewFamily` src/auth/renewable-sign-in.ts:575.
 * A secret that is not the current one is reuse: the family ends and so does every token on its key (the platform's 60 s grace for the previous secret is not faked).
 * Not faked: the Origin admission check, signatures.
 */
export function renew(core: Core, req: Req): Response {
  const proof = req.headers.get("dpop");
  const parts = proof ? proof.split(".") : [];
  const head = parts.length === 3 ? jsonOfB64url(parts[0]!) : null;
  const claims = parts.length === 3 ? jsonOfB64url(parts[1]!) : null;
  if (!head || !claims || head.typ !== "dpop+jwt" || typeof head.jwk !== "object" || head.jwk === null) return refused();
  if (claims.htm !== "POST" || claims.htu !== `https://${req.host}${req.path}`) return refused();
  if ("ath" in claims) return refused(); // the platform refuses a proof that carries `ath` on this route
  if (typeof claims.iat !== "number" || Math.abs(core.o.now() / 1000 - claims.iat) > core.o.proofWindowSeconds) return refused();
  if (typeof claims.jti !== "string" || claims.jti === "") return refused();
  const seen = sha256Hex(claims.jti);
  if (core.s.usedProofs.has(seen)) return refused();
  core.s.usedProofs.add(seen);
  const b = parseBody(req);
  const presented = b.ok && b.value !== null && typeof b.value === "object" && !Array.isArray(b.value) && typeof (b.value as { renew?: unknown }).renew === "string" ? (b.value as { renew: string }).renew : "";
  const m = /^rsi1\.([^.]+)\.([A-Za-z0-9_-]+)$/.exec(presented);
  const family = m ? core.s.renewals.get(m[1]!) : undefined;
  if (!family || family.ended) return refused();
  if (family.jkt !== thumbprint(head.jwk as Record<string, unknown>)) return refused();
  if (family.expiresAt <= core.o.now()) return refused();
  if (presented !== credentialOf(family)) {
    endFamilies(core, (f) => f.id === family.id);
    endSessions(core, family.jkt);
    return refused();
  }
  const person = core.s.people.get(family.email);
  if (!person) return refused();
  family.rotation += 1;
  family.expiresAt = core.o.now() + family.windowSec * 1000; // the window counts from last use (renewFamily, renewable-sign-in.ts:665)
  const ttl = Math.min(ACCESS_TOKEN_TTL_SEC, Math.floor((family.expiresAt - core.o.now()) / 1000)); // renew-sign-in.ts:140-141
  if (ttl < 1) return refused();
  const token = mintToken(core, { principal: person.principal, email: family.email }, family.jkt, ttl).token;
  return json(200, { token, renew: credentialOf(family), renewExpiresAt: new Date(family.expiresAt).toISOString(), principal: person.principal }, { "cache-control": "no-store" });
}

/**
 * POST /base/auth/sign-out: end the device key of the token presented here, and every renewable family of that account and key.
 * Mirrors: src/routes/sign-out.ts:49-103 (credential first; a token without a device key is 400 :58-60; 204 with `cache-control: no-store` :102).
 * After it the token is refused (401) and the family cannot renew. The identity store, the 503 and the issuer check are not faked.
 */
export function signOut(core: Core, req: Req, caller: Caller | null): Response {
  const token = /^DPoP\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim() ?? /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  const session = token !== undefined ? core.s.sessions.get(token) : undefined;
  if (!caller || !session) return badRequest("only a person's sign-in token can end a sign-in here");
  if (session.jkt === null) return badRequest("the sign-in token is not bound to a device key (no cnf.jkt)");
  const jkt = session.jkt;
  endSessions(core, jkt);
  endFamilies(core, (f) => f.jkt === jkt && f.email === session.email);
  return empty(204, { "cache-control": "no-store" });
}
