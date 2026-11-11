// What a 401 from the platform means. The platform answers 401 with a JSON body {"error","message"}.
// Two kinds share the status, and only one of them is "your sign-in ran out".
//
// The sentences, read from GilbPlatform src/auth/verify.ts (AuthError, answered as 401):
//
//   SIGN IN AGAIN (the token is the fault):
//     verify.ts:146  "Malformed access token: ..."
//     verify.ts:154  "Untrusted token issuer: ... is not in the trusted-issuer allow-list"
//     verify.ts:185  "Invalid access token: ..."            (signature, iss, aud, alg, exp)
//     verify.ts:266  "Access token has no subject (sub) principal"
//     verify.ts:271  "Access token has no issuer (iss)"
//     verify.ts:278  "Access token is not DPoP-bound (no cnf.jkt)"
//     verify.ts:309  "DPoP proof key does not match the token's bound key (cnf.jkt)"
//                    (the token was bound to another key: a fresh mint binds the key in hand)
//
//   THE REQUEST IS WRONG (the token may be fine; dropping it fixes nothing):
//     verify.ts:300  "Invalid DPoP proof: ..."               (typ, embedded jwk, signature)
//     verify.ts:316  "DPoP proof htm does not match the request method"
//     verify.ts:319  "DPoP proof htu does not match the request URI"
//     verify.ts:323  "DPoP proof has no iat"
//     verify.ts:327  "DPoP proof iat is outside the freshness window"
//     verify.ts:338  "DPoP proof ath claim is malformed"
//     verify.ts:342  "DPoP proof ath does not match the presented access token"
//     verify.ts:352  "DPoP proof has no jti (replay protection requires it)"
//     verify.ts:357  "DPoP proof has already been used (replay rejected)"
//     bearer-principal.ts:118  "Unsupported Authorization scheme (expected Bearer or DPoP)"
//
// A body that is missing, not JSON or has no message is treated as "sign in again", as before.

/** The sentence a platform 401 body carries, or undefined when there is none. Accepts the parsed body or its text. */
export function platformSentenceOf(body: unknown): string | undefined {
  let value = body;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const m = (value as { message?: unknown }).message;
  return typeof m === "string" && m.trim() !== "" ? m.trim() : undefined;
}

/**
 * True when the 401 sentence names a fault in the request's DPoP proof (htu, htm, iat, jti, ath, the proof itself, or an
 * unsupported scheme), not in the token. The token is kept. The one proof sentence about the token is the key mismatch
 * (verify.ts:309), which means sign in again.
 *
 * @param sentence the platform's message, or undefined when there was none
 */
export function isRequestFault(sentence: string | undefined): boolean {
  if (!sentence) return false;
  if (/does not match the token's bound key/i.test(sentence)) return false;
  return /^(Invalid )?DPoP proof\b/i.test(sentence) || /^Unsupported Authorization scheme/i.test(sentence);
}

/** Thrown when a 401 names a fault in the request, not in the sign-in. The token is still held and still good. */
export class RequestRefusedError extends Error {
  /** The platform's own sentence. */
  readonly platformSentence: string;
  readonly status = 401;
  constructor(platformSentence: string) {
    super(`The platform refused this request: ${platformSentence}`);
    this.name = "RequestRefusedError";
    this.platformSentence = platformSentence;
  }
}
