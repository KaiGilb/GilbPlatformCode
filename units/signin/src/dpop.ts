// DPoP proofs (RFC 9449) for calls made with a sign-in token. Framework-free, transport-free.
//
// ── Why `htu` is derived, never chosen ────────────────────────────────────────────────────────
// A call to a person's vault is received by THAT VAULT's host, and the server compares the proof's
// `htu` with the host it received. An earlier guide named one identity host for every call, and
// every vault call signed that way was refused: 401 "DPoP proof htu does not match the request URI".
//
// Here `htu` is DERIVED FROM THE URL OF THE REQUEST BEING MADE, so there is no host to choose
// and the trap stops existing. ⛔ Do not add a parameter that lets a caller supply `htu` apart
// from the URL: that parameter is the defect.
//
// What the server compares: `https://` + the host it received + the path, query and fragment
// dropped. The scheme is always https on the server side, so it is forced here too (a dev call
// over http still signs https).
//
// ⚠ One case this cannot fix: a proxy or edge in front of the server that REWRITES the host. The
// server then compares against the rewritten host, which the client never saw. Call the platform
// hosts directly.

/** The public half of a DPoP key: exactly the four members the server thumbprints. */
export interface DpopPublicJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
}

/** A DPoP key held in WebCrypto: the private half signs and never leaves it; the public half is sent. */
export interface DpopWebCryptoKey {
  publicJwk: DpopPublicJwk;
  /** Non-extractable P-256 private key. */
  privateKey: CryptoKey;
}

/**
 * A DPoP key the kit cannot hold: an iOS Secure Enclave key, a hardware token, an HSM. The app
 * signs; the kit builds everything else, including `htu`. (Added in gilb-signin 0.3.0: before it, only a
 * `CryptoKey` was accepted, so a Secure Enclave app could not use the kit.)
 *
 * `sign` receives the JWS signing input, the ASCII bytes of `<header>.<payload>`, UNHASHED. It
 * must sign them with ECDSA P-256 over SHA-256 and return the raw signature: `r` then `s`, 32
 * bytes each, 64 bytes in all.
 *
 * ⚠ iOS: `SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, data)` hashes for you but
 * returns DER (about 70 bytes, starting 0x30), so convert it to raw first. CryptoKit's
 * `SecureEnclave.P256.Signing.PrivateKey.signature(for:).rawRepresentation` is already raw.
 * A signature that is not 64 bytes is refused here, so the mistake shows as a clear error and not
 * as a 401 from the server.
 */
export interface DpopSignerKey {
  publicJwk: DpopPublicJwk;
  sign: (input: Uint8Array) => Promise<Uint8Array>;
}

/** A key a token can be bound to: held in WebCrypto, or held elsewhere and reached through `sign`. */
export type DpopKey = DpopWebCryptoKey | DpopSignerKey;

/** Length in bytes of a raw ES256 signature, `r‖s`. */
const ES256_RAW_SIG_BYTES = 64;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generates a DPoP key pair. The private key is NON-extractable, so a script that steals the
 * token still cannot mint a proof for it. That is the point of the sender constraint.
 *
 * ⚠ The key lives in memory and dies with the page. Persisting it (for example to
 * `localStorage`) changes its security properties and is a platform decision, not an app one.
 *
 * @returns the key pair; send `publicJwk` as `dpopJwk` to verify-code
 */
export async function generateDpopKeyPair(): Promise<DpopWebCryptoKey> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    publicJwk: { kty: jwk.kty as string, crv: jwk.crv as string, x: jwk.x as string, y: jwk.y as string },
    privateKey: pair.privateKey,
  };
}

/**
 * The `htu` the server will compare a proof against, for a request sent to `url`.
 *
 * @param url the absolute URL of the request being made
 * @returns `https://<host of url><path of url>`, query and fragment dropped
 * @throws {TypeError} when `url` is not absolute
 */
export function htuFor(url: string): string {
  const u = new URL(url);
  return `https://${u.host}${u.pathname}`;
}

/**
 * Signs one DPoP proof for one request. Make a fresh proof for every request.
 *
 * @param key the key the token is bound to: a WebCrypto key, or a signer key (Secure Enclave etc.)
 * @param method the HTTP method of the request
 * @param url the absolute URL of the request; `htu` is derived from it
 * @param accessToken the token being presented, when there is one; adds the `ath` claim
 * @returns the compact JWS for the `DPoP` header
 */
export async function dpopProof(
  key: DpopKey,
  method: string,
  url: string,
  accessToken?: string,
): Promise<string> {
  const header = { alg: "ES256", typ: "dpop+jwt", jwk: key.publicJwk };
  const claims: Record<string, unknown> = {
    jti: crypto.randomUUID(),
    htm: method.toUpperCase(),
    htu: htuFor(url),
    iat: Math.floor(Date.now() / 1000),
  };
  if (accessToken) {
    claims.ath = b64url(await crypto.subtle.digest("SHA-256", enc.encode(accessToken)));
  }
  return signJws(key, header, claims);
}

/**
 * Signs one compact ES256 JWS with a DPoP key: the kit's ONE signing path. `dpopProof` uses it; so does
 * the `./machine` entry's client assertion, so no app needs a second signer.
 *
 * @param key a WebCrypto key or a signer key
 * @param header the JWS protected header (must say `alg: "ES256"`)
 * @param claims the JWS payload
 * @returns `<header>.<payload>.<signature>`, base64url
 */
export async function signJws(key: DpopKey, header: Record<string, unknown>, claims: Record<string, unknown>): Promise<string> {
  if (header.alg !== "ES256") throw new TypeError("signJws signs ES256 only");
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const sig = await signInput(key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

/**
 * Signs the JWS signing input with whichever half the key carries, and checks the result is a
 * raw ES256 signature.
 *
 * @param key a WebCrypto key or a signer key
 * @param input the ASCII bytes of `<header>.<payload>`, unhashed
 * @returns the 64-byte raw `r‖s` signature
 * @throws {TypeError} when the key carries neither `sign` nor `privateKey`
 * @throws {Error} when the signature is not 64 bytes (most often DER from iOS)
 */
async function signInput(key: DpopKey, input: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  let sig: Uint8Array;
  if ("sign" in key && typeof key.sign === "function") {
    const out: unknown = await key.sign(input);
    // A bridge may hand back an ArrayBuffer; accept it, refuse anything else.
    if (out instanceof ArrayBuffer) sig = new Uint8Array(out);
    else if (out instanceof Uint8Array) sig = out;
    else throw new TypeError("DpopKey.sign must resolve to a Uint8Array");
  } else if ("privateKey" in key && key.privateKey) {
    // WebCrypto returns raw r||s, which is already the JWS ES256 signature encoding.
    sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, input));
  } else {
    throw new TypeError("DpopKey needs either privateKey (a CryptoKey) or sign (a function)");
  }
  if (sig.length !== ES256_RAW_SIG_BYTES) {
    const der = sig[0] === 0x30 ? " It starts 0x30, so it looks like DER: convert it to raw r||s." : "";
    throw new Error(`DPoP signature must be raw r||s, ${ES256_RAW_SIG_BYTES} bytes; got ${sig.length}.${der}`);
  }
  return sig;
}

/**
 * The two headers every authenticated call carries.
 *
 * @param key the key the token is bound to: a WebCrypto key, or a signer key (Secure Enclave etc.)
 * @param accessToken the token from verify-code
 * @param method the HTTP method of the request
 * @param url the absolute URL of the request
 * @returns `{ Authorization: "DPoP <token>", DPoP: <fresh proof> }`
 */
export async function dpopHeaders(
  key: DpopKey,
  accessToken: string,
  method: string,
  url: string,
): Promise<{ Authorization: string; DPoP: string }> {
  return {
    Authorization: `DPoP ${accessToken}`,
    DPoP: await dpopProof(key, method, url, accessToken),
  };
}
