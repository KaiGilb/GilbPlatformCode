// `./machine`: a machine agent's sign-in. Framework-free; runs in a worker runtime and in node.
//
// ── Why this entry point exists ──────────────────────────────────────────────────────────────
// A worker (a job worker, a waiting-list function) signs in as its OWN registered client, not as
// a person. Apps that needed it built the contract by hand and copied the DPoP code. Here it lives
// once, and every signature comes from this kit's `signJws` (the same path `dpopProof` uses): one
// way to sign.
//
// THE PLATFORM CONTRACT (the platform's machine-token route, as read 2026-10-10):
//   token      POST <id origin>/base/oauth/token, x-www-form-urlencoded: grant_type=client_credentials,
//              client_assertion_type=…:jwt-bearer, client_assertion, scope. A DPoP proof is required; the token is
//              bound to the proof key. Answers { access_token, token_type: "DPoP", expires_in, scope }; no refresh.
//   assertion  ES256 JWS, iss = sub = clientId, aud = the token URL in its htu form, iat, exp ≤ 300 s, jti once.
//
// ⛔ Names no host: the caller passes the identity origin. ⛔ The private key is imported non-extractable.

import { dpopHeaders, dpopProof, htuFor, signJws, type DpopKey, type DpopPublicJwk } from "./dpop";
import { fetchTransport, type Transport } from "./transport";

/** The platform's own minter uses 60 s; its verifier accepts up to 300 s. */
export const ASSERTION_LIFETIME_S = 60;
/** A held token is dropped this long before it expires, so it never dies in flight. */
export const MACHINE_EXPIRY_GUARD_MS = 30_000;
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/** A refusal from the token endpoint. `status` 0 means no answer arrived. */
export class MachineTokenError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`machine token refused (HTTP ${status}): ${detail}`);
    this.name = "MachineTokenError";
    this.status = status;
  }
}

/**
 * Imports a machine agent's private P-256 JWK (held as a worker secret). Non-extractable once imported.
 *
 * @param jwkText the JWK as JSON text: kty EC, crv P-256, x, y, d
 * @returns the key, or null when the text is not such a JWK
 */
export async function importMachineKey(jwkText: string): Promise<DpopKey | null> {
  let jwk: Record<string, unknown>;
  try { jwk = JSON.parse(jwkText) as Record<string, unknown>; } catch { return null; }
  const { kty, crv, x, y, d } = jwk ?? {};
  if (kty !== "EC" || crv !== "P-256" || typeof x !== "string" || typeof y !== "string" || typeof d !== "string") return null;
  try {
    const privateKey = await crypto.subtle.importKey("jwk", { kty, crv, x, y, d, ext: false }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const publicJwk: DpopPublicJwk = { kty, crv, x, y };
    return { publicJwk, privateKey };
  } catch {
    return null;
  }
}

/**
 * The private_key_jwt client assertion for one token call.
 *
 * @param key the key registered for clientId
 * @param clientId the registered client id (iss and sub)
 * @param tokenUrl the token endpoint; `aud` is its htu form
 * @param nowMs the clock
 */
export async function clientAssertion(key: DpopKey, clientId: string, tokenUrl: string, nowMs = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return signJws(key, { alg: "ES256", typ: "JWT" }, { iss: clientId, sub: clientId, aud: htuFor(tokenUrl), iat, exp: iat + ASSERTION_LIFETIME_S, jti: crypto.randomUUID() });
}

export interface MachineCredentialOptions {
  /** The identity origin, e.g. the platform's id host. No trailing slash. */
  idOrigin: string;
  clientId: string;
  key: DpopKey;
  /** Default "base.write": the platform's default, base.read, makes every create a 403. */
  scope?: string;
  transport?: Transport;
  now?: () => number;
}

/**
 * Holds one machine token and re-mints it when it nears expiry. `authHeaders` returns `Authorization` + a fresh
 * `DPoP` proof per request, from the same `dpopHeaders` the session entry uses. Concurrent callers share one mint.
 */
export class MachineCredential {
  private held: { token: string; expiresAt: number } | null = null;
  private inflight: Promise<string> | null = null;
  constructor(private readonly o: MachineCredentialOptions) {}

  private now(): number { return (this.o.now ?? Date.now)(); }

  /** The two headers for one request. Never cache them: each proof is single-use. */
  async authHeaders(method: string, url: string): Promise<{ Authorization: string; DPoP: string }> {
    return dpopHeaders(this.o.key, await this.token(), method, url);
  }

  /** Drops the held token (on a 401 from a call), so the next use mints again. */
  invalidate(): void { this.held = null; }

  private async token(): Promise<string> {
    if (this.held && this.now() < this.held.expiresAt - MACHINE_EXPIRY_GUARD_MS) return this.held.token;
    this.inflight ??= this.mint().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async mint(): Promise<string> {
    const url = `${this.o.idOrigin}/base/oauth/token`;
    const send = this.o.transport ?? fetchTransport;
    const DPoP = await dpopProof(this.o.key, "POST", url);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: await clientAssertion(this.o.key, this.o.clientId, url, this.now()),
      scope: this.o.scope ?? "base.write",
    }).toString();
    let res;
    try {
      res = await send(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP }, body, timeoutMs: 15000 });
    } catch {
      throw new MachineTokenError(0, "unreachable");
    }
    if (res.status < 200 || res.status > 299) throw new MachineTokenError(res.status, "the token endpoint refused the client");
    const j = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof j?.access_token !== "string" || !j.access_token) throw new MachineTokenError(res.status, "no token in the answer");
    const ttl = typeof j.expires_in === "number" && Number.isFinite(j.expires_in) ? j.expires_in * 1000 : 60_000;
    this.held = { token: j.access_token, expiresAt: this.now() + ttl };
    return j.access_token;
  }
}
