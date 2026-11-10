import { b64url, jsonOfB64url, sha256, sha256Hex, utf8 } from "./bytes";
import { unauthorized, type Core, type Req } from "./http";
import type { Session } from "./types";

/** "floor": /lws and /files; "strict": /base/vault, /base/authz, /base/consent; "none": the sign-in family, which takes no credential. */
export type RowAuth = "floor" | "strict" | "none";
export interface Caller {
  principal: string;
  email: string;
}
export type Outcome =
  | { caller: Caller | null; response: null; proof: { ok: boolean; reason?: string } }
  | { caller: null; response: Response; proof: { ok: false; reason: string } };

/** RFC 7638 thumbprint of an EC public key: what a token's `cnf.jkt` is. */
export function thumbprint(jwk: { kty?: unknown; crv?: unknown; x?: unknown; y?: unknown }): string {
  return b64url(sha256(utf8(`{"crv":${JSON.stringify(jwk.crv)},"kty":${JSON.stringify(jwk.kty)},"x":${JSON.stringify(jwk.x)},"y":${JSON.stringify(jwk.y)}}`)));
}

/** A JWT-shaped token the fake recognises by lookup. Mirrors the claims the platform's verifier needs (src/auth/verify.ts:375-389). */
export function mintToken(core: Core, who: Caller, jkt: string | null): Session {
  const iat = Math.floor(core.o.now() / 1000);
  const exp = iat + 7 * 24 * 3600; // 7 days: src/config/index.ts:643
  const head = b64url(utf8(JSON.stringify({ alg: "none", typ: "JWT" })));
  const body = b64url(utf8(JSON.stringify({ iss: core.o.origin, sub: who.principal, iat, exp, ...(jkt ? { cnf: { jkt } } : {}), n: core.s.sessions.size })));
  const token = `${head}.${body}.fake`;
  const session: Session = { token, principal: who.principal, email: who.email, jkt, exp };
  core.s.sessions.set(token, session);
  return session;
}

const refuse = (reason: string, note?: string): Outcome => ({ caller: null, response: unauthorized(reason, note), proof: { ok: false, reason } });

function checkToken(core: Core, token: string): Session | string {
  const s = core.s.sessions.get(token);
  if (!s) return "Invalid access token: this token was not issued by the fake platform";
  if (s.exp <= Math.floor(core.o.now() / 1000)) return "Invalid access token: expired";
  return s;
}

/**
 * The credential check. Claims are checked, signatures are not (no real crypto).
 *  - "strict": `Authorization: DPoP <token>` and a `DPoP` header on every route, else 401 (stricter than the platform on /lws and /files).
 *  - "platform": /lws and /files ride the Bearer floor: no header is anonymous, a `DPoP` token without a proof is accepted
 *    (src/auth/bearer-principal.ts:107-184); strict rows refuse no/Bearer credentials with 401 (src/auth/principal.ts:145-158,233-249).
 * Proof claims, each refused with 401 as src/auth/verify.ts does: htm :442, htu :446, ath :464/:469, iat window :150, jti :169/:175, key binding :422.
 */
export async function authenticate(core: Core, req: Req, rowAuth: RowAuth): Promise<Outcome> {
  if (rowAuth === "none") return { caller: null, response: null, proof: { ok: false, reason: "no credential needed" } };
  const authz = req.headers.get("authorization");
  const proofHeader = req.headers.get("dpop");
  const strictMode = core.o.dpop === "strict";
  if (strictMode && (!authz || !/^DPoP\s+\S/i.test(authz) || !proofHeader)) {
    return refuse("A DPoP-bound call needs `Authorization: DPoP <token>` and a `DPoP` proof header (fake-platform strict mode).", "strict-dpop");
  }
  if (!authz) {
    if (rowAuth === "strict") return refuse("This route requires an authenticated caller (no token presented)");
    return { caller: null, response: null, proof: { ok: false, reason: "no credential: anonymous" } };
  }
  const dpop = /^DPoP\s+(.+)$/i.exec(authz);
  const bearer = /^Bearer\s+(.+)$/i.exec(authz);
  if (!dpop && !bearer) return refuse("Unsupported Authorization scheme (expected Bearer or DPoP)");
  const token = (dpop ?? bearer)![1]!.trim();
  const session = checkToken(core, token);
  if (typeof session === "string") return refuse(session);
  // The principal is the person's CURRENT acting principal: a first vault adopts its own address as the principal (src/routes/email-auth.ts:510-517), the token stays valid.
  const caller: Caller = { principal: core.s.people.get(session.email)?.principal ?? session.principal, email: session.email };
  if (!dpop || !proofHeader) {
    if (rowAuth === "strict") return refuse("This route requires a DPoP proof with the token");
    return { caller, response: null, proof: { ok: false, reason: "no proof (accepted on the Bearer floor)" } };
  }
  const parts = proofHeader.split(".");
  const head = parts.length === 3 ? jsonOfB64url(parts[0]!) : null;
  const claims = parts.length === 3 ? jsonOfB64url(parts[1]!) : null;
  if (!head || !claims || head.typ !== "dpop+jwt" || typeof head.jwk !== "object" || head.jwk === null) return refuse("Invalid DPoP proof: not a dpop+jwt carrying a jwk");
  if (claims.htm !== req.method) return refuse("DPoP proof htm does not match the request method");
  if (claims.htu !== `https://${req.host}${req.path}`) return refuse("DPoP proof htu does not match the request URI");
  const ath = typeof claims.ath === "string" ? claims.ath : null;
  if (ath === null || ath !== b64url(sha256(utf8(token)))) return refuse(ath === null ? "DPoP proof ath claim is malformed" : "DPoP proof ath does not match the presented access token");
  const iat = claims.iat;
  if (typeof iat !== "number") return refuse("DPoP proof has no iat");
  if (Math.abs(core.o.now() / 1000 - iat) > core.o.proofWindowSeconds) return refuse("DPoP proof iat is outside the freshness window");
  const jti = claims.jti;
  if (typeof jti !== "string" || jti === "") return refuse("DPoP proof has no jti (replay protection requires it)");
  const seen = sha256Hex(jti);
  if (core.s.usedProofs.has(seen)) return refuse("DPoP proof has already been used (replay rejected)");
  if (session.jkt !== null && session.jkt !== thumbprint(head.jwk as Record<string, unknown>)) return refuse("DPoP proof key does not match the token's bound key (cnf.jkt)");
  core.s.usedProofs.add(seen);
  return { caller, response: null, proof: { ok: true } };
}
