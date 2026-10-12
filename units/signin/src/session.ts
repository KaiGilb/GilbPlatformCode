// `./session`: the session credential a signed-in app holds. Framework-free.
//
// ── Why this entry point exists ──────────────────────────────────────────────────────────────
// Signing a person in and building DPoP proofs is not enough: every app still needs a token
// holder — when to re-mint, how to share one mint between callers, how to read the session
// bridge's answer. Without this entry each app keeps its own copy, and signs its own proofs beside
// this kit's. Here it lives once, and every proof comes from this kit's `dpopHeaders`.
//
// What it holds, in memory only:
//   - one DPoP key (made by `generateDpopKeyPair`, private half non-extractable, or one the host
//     passes in, e.g. a Secure Enclave signer);
//   - the current access token, its expiry, and the session it resolved (principal, landing
//     vault, reachable vaults).
//
// Where a token comes from, in this order:
//   1. `adopt()`: the token verify-code returned (the cookieless path).
//   2. The DPoP session bridge, when the host names its URL (`dpopMintUrl`): a POST that rides the
//      platform's session cookie and returns a token bound to this key. This is what keeps a
//      person signed in across a reload, because the token itself dies with the page.
//
// ⛔ Nothing here names a host. The host passes every URL. (Checked by
// `scripts/check-host-agnostic.mjs`.)
// ⛔ Nothing here signs a DPoP proof itself. `dpopHeaders` in `./dpop` is the one way.

import { dpopHeaders, generateDpopKeyPair, type DpopKey, type DpopPublicJwk } from "./dpop";
import { fetchTransport, type Transport, type TransportResponse } from "./transport";
import { verifySignInCodeHttp, type VerifyHttpBody } from "./http";

/** Re-mint when less than this much of the token's life is left (clock skew and time in flight). */
export const EXPIRY_GUARD_MS = 60_000;

/**
 * Lifetime assumed when a token's expiry cannot be read. Short on purpose: re-mint early rather
 * than trust a token forever. It must exceed {@link EXPIRY_GUARD_MS}, or every token would count
 * as already expired.
 */
export const UNKNOWN_TTL_FALLBACK_MS = 5 * 60_000;

/** The anti-CSRF header the session bridge requires. A wire name: do not rename. */
const CSRF_HEADERS = { "X-Base-Csrf": "1" } as const;

/** The two modes an app reasons about in a reachable vault. */
export type VaultMode = "read" | "write";

/** One vault the signed-in principal can reach, and what it may do there. */
export interface SessionVault {
  vaultId: string;
  modes: VaultMode[];
}

/** The landing vault's coordinates, as the session bridge returns them. */
export interface SessionVaultInfo {
  /** The vault entity URI. */
  entity: string;
  /** The opaque id vault paths are keyed on. */
  id: string;
  /** The vault's chosen name. */
  name: string;
  /** The short WebID alias, when the vault has one. */
  shortWebId?: string;
}

/** The signed-in session an app holds. */
export interface GilbSession {
  principal: string;
  vault: SessionVaultInfo | null;
  /** Every vault the principal reaches. Empty when it holds no grants; never a fallback vault. */
  vaults: SessionVault[];
}

/** One `vaults[]` entry on the wire: `modes` arrives as raw strings. */
export interface WireSessionVault {
  vaultId: string;
  modes?: string[];
}

/** The DPoP session bridge's 200 body. */
export interface DpopTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  cnf?: { jkt?: string };
  principal: string;
  vault?: SessionVaultInfo | null;
  vaults?: WireSessionVault[];
}

/** Thrown on 401 from the bridge, or when there is no token and no bridge: no live sign-in. */
export class NotSignedInError extends Error {
  constructor() {
    super("Your sign-in needs refreshing. Sign in again, then try once more.");
    this.name = "NotSignedInError";
  }
}

/** Thrown on 403 from the bridge: this app's origin is not admitted. A deployment problem. */
export class OriginNotAllowedError extends Error {
  constructor() {
    super("The sign-in service refused this app's address. The app's origin is not on its allowed list.");
    this.name = "OriginNotAllowedError";
  }
}

/**
 * Narrows wire modes to read and write. Any other mode (append, control) is dropped, not passed
 * on as an unknown grant.
 *
 * @param modes the raw mode strings
 * @returns the modes, each at most once
 */
export function narrowVaultModes(modes: string[] | undefined): VaultMode[] {
  const out: VaultMode[] = [];
  for (const m of modes ?? []) {
    if ((m === "read" || m === "write") && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Reads the wire `vaults[]` into the reachable set, dropping an entry with no id.
 *
 * @param vaults the wire entries, or undefined (an older server)
 * @returns the reachable vaults
 */
export function readSessionVaults(vaults: WireSessionVault[] | undefined): SessionVault[] {
  const out: SessionVault[] = [];
  for (const v of vaults ?? []) {
    if (!v?.vaultId) continue;
    out.push({ vaultId: v.vaultId, modes: narrowVaultModes(v.modes) });
  }
  return out;
}

/**
 * When a JWT expires, read from its `exp` claim. The signature is not checked: the server does
 * that. This only decides when to re-mint.
 *
 * @param jwt the access token
 * @param now the current time in epoch ms
 * @returns epoch ms of `exp`, or `now + UNKNOWN_TTL_FALLBACK_MS` when it cannot be read
 */
export function tokenExpiresAt(jwt: string, now: number): number {
  try {
    const seg = jwt.split(".")[1];
    if (!seg) return now + UNKNOWN_TTL_FALLBACK_MS;
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp)
      ? claims.exp * 1000
      : now + UNKNOWN_TTL_FALLBACK_MS;
  } catch {
    return now + UNKNOWN_TTL_FALLBACK_MS;
  }
}

/** Options for {@link SessionCredential}. */
export interface SessionCredentialOptions {
  /**
   * The DPoP session bridge (`POST …/base/auth/session/dpop-token`). Without it the credential
   * holds only adopted tokens and throws {@link NotSignedInError} when the token runs out.
   */
  dpopMintUrl?: string;
  /** Defaults to {@link fetchTransport}. */
  transport?: Transport;
  /** A key the host holds (Secure Enclave, hardware). Defaults to a fresh WebCrypto key. */
  key?: DpopKey;
  /** The clock, in epoch ms. For tests. */
  now?: () => number;
}

interface Minted {
  accessToken: string;
  expiresAt: number;
  /** The binding thumbprint the bridge echoed, or "" for an adopted token. */
  jkt: string;
  session: GilbSession;
}

/**
 * Holds one DPoP key and the current token, and re-mints through the bridge when needed:
 * first use mints; inside the guard band it re-mints; `invalidate()` makes the next use re-mint.
 * Concurrent callers share one mint request.
 */
export class SessionCredential {
  private key: DpopKey | null;
  private keyInflight: Promise<DpopKey> | null = null;
  private minted: Minted | null = null;
  private inflight: Promise<Minted> | null = null;
  /**
   * Bumped by every sign-out (`invalidate(true)`). A mint or key generation that started under an older
   * generation must not store its result: a sign-out during an in-flight mint would otherwise be
   * undone when the mint lands, and with `dropKey` the token would be bound to a key the
   * credential no longer holds.
   */
  private generation = 0;
  private readonly hostKey: boolean;
  private readonly opts: SessionCredentialOptions;

  constructor(opts: SessionCredentialOptions = {}) {
    this.opts = opts;
    this.key = opts.key ?? null;
    this.hostKey = Boolean(opts.key);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** The current session, when a token is held. */
  get session(): GilbSession | null {
    return this.minted?.session ?? null;
  }

  /** The public half of this credential's key: send it as `dpopJwk` to verify-code. */
  async ensurePublicJwk(): Promise<DpopPublicJwk> {
    return (await this.ensureKey()).publicJwk;
  }

  /**
   * Holds a token minted for this credential's key, such as the one verify-code returned.
   *
   * @param accessToken the DPoP-bound token
   * @param session the session it resolves
   * @param expiresAt epoch ms; read from the token's `exp` when omitted
   */
  adopt(accessToken: string, session: GilbSession, expiresAt?: number): void {
    this.minted = {
      accessToken,
      expiresAt: expiresAt ?? tokenExpiresAt(accessToken, this.now()),
      jkt: "",
      session,
    };
  }

  /**
   * Verifies an emailed code with this credential's key, and holds the token it returns.
   *
   * @param origin the sign-in service origin, no trailing slash
   * @param email the mailbox the code was sent to
   * @param code the code from the email
   * @param name a vault name, on first sign-in
   * @param productName words for error messages
   * @returns the verify-code body (`needsVaultName`, `suggestedName`)
   * @throws whatever `verifySignInCodeHttp` throws; {@link NotSignedInError} when no token came
   *   back, or when a sign-out (`invalidate(true)`) happened while the code was being verified
   */
  async signInWithCode(
    origin: string,
    email: string,
    code: string,
    name?: string,
    productName?: string,
  ): Promise<VerifyHttpBody> {
    // A sign-out while the code is on the wire must not be undone when the answer lands: the
    // token would be held after sign-out, bound to a key the credential may no longer hold.
    const gen = this.generation;
    const jwk = await this.ensurePublicJwk();
    const body = await verifySignInCodeHttp(origin, email, code, jwk, name, productName, {
      transport: this.opts.transport,
    });
    if (gen !== this.generation) throw new NotSignedInError();
    if (!body.token || !body.principal) {
      // A vault name is still owed: no token yet, and that is not an error for the caller.
      if (body.needsVaultName) return body;
      throw new NotSignedInError();
    }
    this.adopt(body.token, { principal: body.principal, vault: null, vaults: [] });
    return body;
  }

  /**
   * The `Authorization` and `DPoP` headers for one request. The proof is fresh on every call:
   * the server refuses a reused `jti`, so never cache the result.
   *
   * @param method the HTTP method
   * @param url the absolute URL of the request; `htu` is derived from it
   * @param freshForMs re-mint first unless the token lives at least this long (a long agent turn)
   */
  async authHeaders(method: string, url: string, freshForMs = 0): Promise<{ Authorization: string; DPoP: string }> {
    // Token and key are read under one generation: a sign-out (invalidate) between the two
    // awaits would otherwise pair a pre-sign-out token with a freshly made key.
    const gen = this.generation;
    const { accessToken } = await this.getMinted(freshForMs);
    const key = await this.ensureKey();
    if (gen !== this.generation) throw new NotSignedInError();
    return dpopHeaders(key, accessToken, method, url);
  }

  /** The live session, minting if needed. */
  async getSession(): Promise<GilbSession> {
    return (await this.getMinted()).session;
  }

  /** The thumbprint the bridge echoed for the bound key ("" for an adopted token). */
  async jkt(): Promise<string> {
    return (await this.getMinted()).jkt;
  }

  /**
   * Drops the token so the next use re-mints. On sign-out pass `dropKey`: a new sign-in gets a
   * new key. A key the host passed in is never dropped; the host owns it.
   */
  invalidate(dropKey = false): void {
    this.minted = null;
    // Only a sign-out (dropKey) stops work in progress. A plain invalidate() is the re-mint
    // after a 401: the sign-in is still live, so a mint already under way is the fresh token
    // the caller wants.
    if (!dropKey) return;
    this.generation++;
    this.inflight = null;
    if (!this.hostKey) {
      this.key = null;
      this.keyInflight = null;
    }
  }

  private async ensureKey(): Promise<DpopKey> {
    if (this.key) return this.key;
    const gen = this.generation;
    const pending = (this.keyInflight ??= generateDpopKeyPair());
    const key = await pending;
    if (this.keyInflight === pending) this.keyInflight = null;
    // Keep the key only if no sign-out happened while it was being made.
    if (gen === this.generation && !this.key) this.key = key;
    return this.key ?? key;
  }

  private async getMinted(freshForMs = 0): Promise<Minted> {
    if (this.minted && this.now() < this.minted.expiresAt - Math.max(EXPIRY_GUARD_MS, freshForMs)) {
      return this.minted;
    }
    if (!this.inflight) {
      const pending: Promise<Minted> = this.mint(this.generation).finally(() => {
        if (this.inflight === pending) this.inflight = null;
      });
      this.inflight = pending;
    }
    return this.inflight;
  }

  private async mint(gen: number): Promise<Minted> {
    const url = this.opts.dpopMintUrl;
    if (!url) throw new NotSignedInError();
    const jwk = await this.ensurePublicJwk();
    const send = this.opts.transport ?? fetchTransport;
    const res: TransportResponse = await send(url, {
      method: "POST",
      credentials: "include",
      headers: { ...CSRF_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ dpopJwk: jwk }),
      timeoutMs: 15000,
    });
    if (res.status === 401) throw new NotSignedInError();
    if (res.status === 403) throw new OriginNotAllowedError();
    if (res.status < 200 || res.status > 299) throw new Error(`DPoP token mint failed: HTTP ${res.status}`);
    let body: DpopTokenResponse;
    try {
      body = (await res.json()) as DpopTokenResponse;
    } catch {
      // A 2xx that is not JSON carries no token either.
      throw new Error("DPoP token mint returned no token");
    }
    // A 2xx with no token is not a credential. Refuse it loudly, so a caller never sends
    // `DPoP undefined`.
    if (!body?.access_token || !body.principal) throw new Error("DPoP token mint returned no token");
    const now = this.now();
    const ttl = typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in * 1000
      : null;
    const minted: Minted = {
      accessToken: body.access_token,
      expiresAt: ttl === null ? tokenExpiresAt(body.access_token, now) : now + ttl,
      jkt: body.cnf?.jkt ?? "",
      session: {
        principal: body.principal,
        vault: body.vault ?? null,
        vaults: readSessionVaults(body.vaults),
      },
    };
    // A sign-out (invalidate) happened while this mint was on the wire: drop the result.
    if (gen !== this.generation) throw new NotSignedInError();
    this.minted = minted;
    return minted;
  }
}
