// `./session`: the session credential a signed-in app holds. Framework-free.
//
// ── Why this entry point exists ──────────────────────────────────────────────────────────────
// Signing a person in and building DPoP proofs is not enough: every app still needs a token
// holder — when to re-mint, how to share one mint between callers, how to read the session
// bridge's answer. Without this entry each app keeps its own copy, and signs its own proofs beside
// this kit's. Here it lives once, and every proof comes from this kit's `dpopHeaders`.
//
// What it holds:
//   - one DPoP key (made by `generateDpopKeyPair`, private half non-extractable, or one the host
//     passes in, e.g. a Secure Enclave signer);
//   - the current access token, its expiry, and the session it resolved (principal, landing
//     vault, reachable vaults). On the cookieless path the reachable vaults are not in the token
//     response: they are read from `GET /lws/vaults` ({@link REACHABLE_VAULTS_PATH}).
//   - on the cookieless path, the same key and token in {@link SessionStore}, plus the renewal
//     credential when verify-code issued one. A reload calls `restore()`. A token that still has
//     its guard is adopted with no request. A token inside the guard, or already expired, is
//     renewed when the stored credential is still in date. The private key is stored as a
//     CryptoKey, never exported. A host-passed key is never stored.
//
// Where a token comes from, in this order:
//   1. `restore()`: the record the store kept from an earlier page. A live token is adopted and
//      no request is made. A token inside the expiry guard or already expired is renewed instead
//      of cleared when the record holds a renewal credential that is still in date. That renew
//      is the only request `restore` makes. A wrong version, a malformed record (no `publicKeyId`,
//      or one that is not the stored public key's `x.y`), or a key pair whose halves do not match
//      is dropped. A sign-in this credential already holds is left as it is.
//   2. `adopt()`: the token verify-code returned (the cookieless path). verify-code returns no
//      vault list. The session-cookie bridge below is first-party only, so a third-party app
//      cannot learn its vaults from either answer. `signInWithCode` therefore reads
//      `GET /lws/vaults` on the same origin the code was verified at, with a DPoP proof and no
//      cookies.
//   3. Renewal (`POST {origin}/base/auth/email/renew`), when a renewal credential is held and the
//      access token is inside the guard (or `renew()` is called). The proof carries no access
//      token. The answer replaces the token and the credential. The old credential is spent.
//   4. The DPoP session bridge, when the host names its URL (`dpopMintUrl`): a POST that rides the
//      platform's session cookie and returns a token bound to this key, and the vault list with
//      it. That re-mint is what keeps a first-party page signed in across a reload. Those pages
//      store nothing here, and they never send a renewal. A third-party page cannot use the bridge.
//
// ⛔ Nothing here names a host. The host passes every URL. (Checked by
// `scripts/check-host-agnostic.mjs`.)
// ⛔ Nothing here signs a DPoP proof itself. `dpopHeaders` in `./dpop` signs a request that
//    carries a token. Renewal has no token on the request, so that call uses `dpopProof` with
//    no access token: the platform refuses a proof that carries `ath`.

import { dpopHeaders, dpopProof, generateDpopKeyPair, type DpopKey, type DpopPublicJwk, type DpopWebCryptoKey } from "./dpop";
import { fetchTransport, type Transport, type TransportResponse } from "./transport";
import { verifySignInCodeHttp, type VerifyHttpBody } from "./http";
import {
  indexedDbSessionStore,
  SESSION_DB_NAME,
  STORED_SESSION_VERSION,
  type SessionStore,
  type StoredSession,
} from "./sessionStore";

export { indexedDbSessionStore, SESSION_DB_NAME, SESSION_OBJECT_STORE, SESSION_RECORD_KEY, STORED_SESSION_VERSION } from "./sessionStore";
export type { SessionStore, StoredSession } from "./sessionStore";

/** Re-mint when less than this much of the token's life is left (clock skew and time in flight). */
export const EXPIRY_GUARD_MS = 60_000;

/** Shortest renewal window verify-code will accept, in seconds. */
export const RENEW_WINDOW_MIN_SEC = 300;

/** Longest renewal window, in seconds. 14 days. Also the window sent when the app does not choose one. */
export const RENEW_WINDOW_MAX_SEC = 1_209_600;

/** `POST {origin}/base/auth/email/renew`. A wire path: do not rename. */
export const RENEW_SIGN_IN_PATH = "/base/auth/email/renew";

/** `POST {origin}/base/auth/sign-out`. A wire path: do not rename. */
export const SIGN_OUT_PATH = "/base/auth/sign-out";

/**
 * How long `signOut` waits for the server before it clears the local sign-in anyway.
 * The server call is best-effort. A hang must not leave the person signed in on this device.
 */
export const SIGN_OUT_BOUND_MS = 3_000;

/**
 * How long a store call the credential is waiting on may take. Past this, the call is a storage
 * failure: the in-memory sign-in stays, and a load that timed out is not treated as an empty
 * record (the record is left in place). Sign-in does not wait on a save at all.
 */
export const STORE_TIMEOUT_MS = 400;

/** Fixed input for the restore pair check. Not a secret, and not sent anywhere. */
const STORED_PAIR_CHALLENGE = new TextEncoder().encode("gilb-signin-pair-check");

/**
 * Turns yielded so a store op that is already running can finish when it settles on its own.
 * A store that never settles is not waited on: the loop ends either way.
 */
const STORE_FLUSH_TURNS = 12;

/**
 * Lifetime assumed when a token's expiry cannot be read. Short on purpose: re-mint early rather
 * than trust a token forever. It must exceed {@link EXPIRY_GUARD_MS}, or every token would count
 * as already expired.
 */
export const UNKNOWN_TTL_FALLBACK_MS = 5 * 60_000;

/** The anti-CSRF header the session bridge requires. A wire name: do not rename. */
const CSRF_HEADERS = { "X-Base-Csrf": "1" } as const;

/** `GET /lws/vaults`, the reachable-vault list. A wire path: do not rename. */
export const REACHABLE_VAULTS_PATH = "/lws/vaults";

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
  /**
   * A plain-English sentence when the vault list could not be read, or is only partial.
   * Absent when the list is whole.
   */
  vaultsProblem?: string;
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
 * Thrown when a renewal did not reach a recorded answer. The sign-in is still held.
 * The credential was not spent, so the next attempt may send it.
 */
export class RenewalUnavailableError extends Error {
  constructor() {
    super("The sign-in could not be renewed just now. It is still in place. Try again.");
    this.name = "RenewalUnavailableError";
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
  /** A key the host holds (Secure Enclave, hardware). Defaults to a fresh WebCrypto key. Never stored. */
  key?: DpopKey;
  /**
   * Where a cookieless sign-in is kept across a reload. Omit it and, when `dpopMintUrl` is also
   * omitted and `globalThis.indexedDB` exists, the credential uses
   * `indexedDbSessionStore(SESSION_DB_NAME)`. `false` stores nothing.
   *
   * When `dpopMintUrl` is set, this option is ignored and nothing is stored, including when a
   * `store` is passed as well. That page re-mints from the session cookie (first-party), which
   * is the behaviour it already had.
   */
  store?: SessionStore | false;
  /** The clock, in epoch ms. For tests. */
  now?: () => number;
  /**
   * Ask verify-code for a renewal credential. Defaults to true when this credential stores
   * (cookieless). Ignored, and never sent, when `dpopMintUrl` is set, when `store` is false,
   * or when `key` is a host-held key. `false` turns renewal off on a credential that stores.
   */
  renew?: boolean;
  /**
   * How long the renewal stays valid, in seconds. An integer from {@link RENEW_WINDOW_MIN_SEC}
   * to {@link RENEW_WINDOW_MAX_SEC}. Anything else throws {@link TypeError} from the constructor.
   * Omitted, the client asks for {@link RENEW_WINDOW_MAX_SEC} (14 days).
   */
  renewWindowSec?: number;
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
  /**
   * Set by sign-out. `restore` on this same instance must not adopt a record the sign-out
   * was meant to delete, even when the delete has not landed yet.
   */
  private signedOut = false;
  /**
   * Bumped when a sign-in or `adopt` starts. `restore` captures it and compares after every
   * await, the same way `generation` is used for sign-out: a sign-in that started while the
   * load was in flight is not overwritten by the record the load returns.
   */
  private signInSerial = 0;
  /** `signInWithCode` calls in flight. `restore` will not adopt over one. */
  private signInsInFlight = 0;
  /**
   * Set by a fresh sign-in (`adopt` / verify-code) until that sign-in's record has been
   * written. Later saves, and a credential that `restore` adopted, are update-only.
   */
  private canCreateRecord = false;
  /** Public CryptoKey paired with `this.key`, so a save does not import it again. */
  private publicCryptoKey: CryptoKey | null = null;
  /**
   * `x.y` of this credential's public key. Set once when the key pair is made or
   * restored, and passed to an update-only save. Not recomputed inside a transaction.
   */
  private publicKeyId: string | null = null;
  /** Bumped whenever the held session changes, so a save writes the latest one. */
  private epoch = 0;
  /** The epoch last settled with the store (written, or deliberately not written). */
  private lastWrittenEpoch = 0;
  private draining = false;
  /** The drain stopped because the DPoP key did not exist yet. The next key pokes it. */
  private waitingForKey = false;
  /** Store ops in order. A sign-out's clear is queued behind a save already in this chain. */
  private tail: Promise<void> = Promise.resolve();
  private restoreInflight: Promise<GilbSession | null> | null = null;
  /** One renewal at a time on this credential. A second caller waits for it. */
  private renewInflight: Promise<RenewAttempt> | null = null;
  /** The renewal credential currently held. It is sent at most once. */
  private renewCredential: string | null = null;
  /** The server's `renewExpiresAt` text, kept so the store round-trips it. */
  private renewExpiresAt: string | null = null;
  /** Epoch ms of {@link renewExpiresAt}. Null when no credential is held. */
  private renewExpiresAtMs: number | null = null;
  /** Sign-in origin, no trailing slash. The renew URL and the cross-tab lock use it. */
  private renewOrigin: string | null = null;
  /**
   * Vault list to keep when a renewal replaces the token and `minted` is null
   * (restore of an expired token, or a plain `invalidate`). Not a sign-in by itself.
   */
  private carriedSession: GilbSession | null = null;
  /**
   * While greater than zero, the store drain does not write. Renewal holds this across
   * its own save so a stale record cannot land on top of the rotated credential.
   */
  private storeHeld = 0;
  private readonly hostKey: boolean;
  private readonly store: SessionStore | null;
  private readonly opts: SessionCredentialOptions;

  constructor(opts: SessionCredentialOptions = {}) {
    if (opts.renewWindowSec !== undefined) assertRenewWindowSec(opts.renewWindowSec);
    this.opts = opts;
    this.key = opts.key ?? null;
    this.hostKey = Boolean(opts.key);
    this.store = selectStore(opts);
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
   * @returns a promise that resolves once the token is held. The save is started and its
   *   failure is swallowed. The promise does not wait for a store call that fails to settle,
   *   and it does not reject: a storage failure leaves the in-memory sign-in in place.
   *   A token already inside {@link EXPIRY_GUARD_MS} is held in memory and not written.
   */
  adopt(accessToken: string, session: GilbSession, expiresAt?: number): Promise<void> {
    this.signInSerial++;
    this.signedOut = false;
    // A new token may create or replace the record. Later updates from this hold are not creates.
    this.canCreateRecord = true;
    this.minted = {
      accessToken,
      expiresAt: expiresAt ?? tokenExpiresAt(accessToken, this.now()),
      jkt: "",
      session,
    };
    this.markDirty();
    return this.flushStore();
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
   *   or while the vault list (`GET /lws/vaults`) was being read
   */
  signInWithCode(
    origin: string,
    email: string,
    code: string,
    name?: string,
    productName?: string,
  ): Promise<VerifyHttpBody> {
    // Counted before the first await so `restore` during verify-code does not adopt a stored
    // key over the key this call is binding the token to. The save is started, not awaited:
    // a store that never settles must not block the sign-in the caller is waiting on.
    this.signInsInFlight++;
    this.signInSerial++;
    return this.signInWithCodeBody(origin, email, code, name, productName).finally(() => {
      this.signInsInFlight--;
      return this.flushStore();
    });
  }

  private async signInWithCodeBody(
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
      ...(this.renewalWanted()
        ? { renew: true as const, renewWindowSec: this.opts.renewWindowSec ?? RENEW_WINDOW_MAX_SEC }
        : {}),
    });
    if (gen !== this.generation) throw new NotSignedInError();
    if (!body.token || !body.principal) {
      // A vault name is still owed: no token yet, and that is not an error for the caller.
      if (body.needsVaultName) return body;
      throw new NotSignedInError();
    }
    // Set before `adopt` starts the save, so the first record carries the credential.
    // A sign-in that was not issued one drops whatever this credential held before.
    this.rememberRenewal(origin, body.renew, body.renewExpiresAt);
    this.adopt(body.token, { principal: body.principal, vault: null, vaults: [] });
    // verify-code carries no vault list, and the cookie bridge is first-party only.
    // A list problem stays signed in; a sign-out while that read is on the wire still rejects.
    await this.loadReachableVaults(origin);
    return body;
  }

  /**
   * Reads the reachable vaults from `GET {origin}/lws/vaults` onto the held session.
   * Never throws for a list problem: the sign-in has succeeded and stays signed in, and
   * {@link GilbSession.vaultsProblem} says what happened (absent when the list is whole).
   * `principal` and `vault` are left as they were.
   *
   * @param origin the origin the token was verified at. Trailing slashes are removed once,
   *   so the path is not joined onto a doubled slash.
   * @returns the session this read built. Stored on the held token only when that token is
   *   still the one the read started with.
   * @throws {@link NotSignedInError} when no token is held at the start (nothing is sent), or
   *   when a sign-out (`invalidate(true)`) landed while the proof was built or while this read
   *   was on the wire (nothing is stored)
   */
  loadReachableVaults(origin: string): Promise<GilbSession> {
    // The vault-list save is started and not awaited. A store that never settles must not
    // block the caller. The list is still applied to the held session before this resolves.
    return this.loadReachableVaultsBody(origin).finally(() => this.flushStore());
  }

  private async loadReachableVaultsBody(origin: string): Promise<GilbSession> {
    if (!this.minted) throw new NotSignedInError();
    const gen = this.generation;
    // The token this call found. A proof failure is judged against it: a sign-out bumps the
    // generation, a plain invalidate() or a newer sign-in only replaces the token.
    const startedToken = this.minted.accessToken;
    const startedSession = this.minted.session;
    const url = `${origin.replace(/\/+$/, "")}${REACHABLE_VAULTS_PATH}`;
    const send = this.opts.transport ?? fetchTransport;
    let res: TransportResponse;
    let proof: { Authorization: string; DPoP: string };
    // One proof per request: the server refuses a reused `jti`. Building it re-mints inside
    // the 60 s guard. With no bridge that throws, and the sign-in has already succeeded.
    try {
      proof = await this.authHeaders("GET", url);
    } catch {
      if (gen !== this.generation) throw new NotSignedInError();
      return this.storeVaultList(gen, startedToken, startedSession, undefined, "Could not read your vault list: your sign-in runs out too soon. Sign in again.");
    }
    if (gen !== this.generation) throw new NotSignedInError();
    // authHeaders may have re-minted. The list was signed with the token held now.
    const readToken = this.minted?.accessToken ?? startedToken;
    const readSession = this.minted?.session ?? startedSession;
    try {
      res = await send(url, {
        method: "GET",
        credentials: "omit",
        headers: { ...proof, Accept: "application/ld+json, application/json" },
        timeoutMs: 15000,
      });
    } catch {
      return this.storeVaultList(gen, readToken, readSession, undefined, "Could not reach your vault list. The browser blocked the request or the network failed.");
    }
    if (gen !== this.generation) throw new NotSignedInError();
    if (res.status < 200 || res.status > 299) {
      return this.storeVaultList(gen, readToken, readSession, undefined, `Could not read your vault list (HTTP ${res.status}).`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return this.storeVaultList(gen, readToken, readSession, undefined, "The vault list answer could not be read.");
    }
    if (gen !== this.generation) throw new NotSignedInError();
    const raw = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { vaults?: unknown; complete?: unknown; incompletePeers?: unknown })
      : null;
    if (!raw || !Array.isArray(raw.vaults)) {
      return this.storeVaultList(gen, readToken, readSession, undefined, "The vault list answer could not be read.");
    }
    const list = readSessionVaults(raw.vaults as WireSessionVault[]);
    if (raw.complete === false) {
      const peers = typeof raw.incompletePeers === "number" && Number.isFinite(raw.incompletePeers)
        ? raw.incompletePeers
        : "some";
      return this.storeVaultList(gen, readToken, readSession, list, `Your vault list may be incomplete: ${peers} store(s) did not answer.`);
    }
    return this.storeVaultList(gen, readToken, readSession, list);
  }

  /**
   * Writes the vault list onto the held session when the held access token is still the one
   * this read started with. Otherwise stores nothing and returns the session this read built.
   * A sign-out that bumped the generation stores nothing and throws.
   *
   * @param accessToken the token this read was signed with
   * @param prior the session of that token, used when it is no longer the one held
   * @param vaults the replacement list; omit to keep the list already held
   * @param problem the sentence to show; omit when the list is whole (clears any previous one)
   */
  private storeVaultList(gen: number, accessToken: string, prior: GilbSession, vaults: SessionVault[] | undefined, problem?: string): GilbSession {
    if (gen !== this.generation) throw new NotSignedInError();
    const held = this.minted;
    const base = held && held.accessToken === accessToken ? held.session : prior;
    const session: GilbSession = {
      principal: base.principal,
      vault: base.vault,
      vaults: vaults ?? base.vaults,
    };
    if (problem !== undefined) session.vaultsProblem = problem;
    if (held && held.accessToken === accessToken) {
      held.session = session;
      // The stored record follows the held session, including a list problem.
      this.markDirty();
    }
    return session;
  }

  /**
   * The `Authorization` and `DPoP` headers for one request. The proof is fresh on every call:
   * the server refuses a reused `jti`, so never cache the result.
   *
   * When the held token is inside the guard and a renewal credential is held, this renews
   * first, on the same path a cookie-bridge re-mint uses. A 401 from that renew ends the
   * sign-in and throws {@link NotSignedInError}. A network error or a 5xx throws
   * {@link RenewalUnavailableError} and keeps the sign-in.
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
   *
   * The store follows. The returned promise settles that write, or gives up after
   * {@link STORE_TIMEOUT_MS}, and does not reject. The in-memory drop has already happened
   * when this returns to the caller. Sign-out waits at most that long for the delete it
   * started in this turn.
   *
   * Sign-out deletes the stored record. The delete is started before this returns, so a page
   * that closes immediately still has a delete transaction queued when the database is already
   * open. IndexedDB commits asynchronously. If the browser discards the document before the
   * commit, the record can remain. A save transaction created before the delete runs first and
   * the delete then removes its record, when both stay queued. A save that starts its
   * transaction after the delete, and then the page is discarded before the follow-up delete
   * runs, can leave a record. That follow-up runs when the save finishes, which does not
   * happen if the page is already gone.
   *
   * A plain `invalidate()` keeps the in-memory key and drops the stored token. The key stays
   * in the record with an empty token, so the rejected token is not restored. `restore()`
   * treats that record as not a session, clears it, and returns null.
   */
  invalidate(dropKey = false): Promise<void> {
    // Only a sign-out (dropKey) stops work in progress. A plain invalidate() is the re-mint
    // after a 401: the sign-in is still live, so a mint already under way is the fresh token
    // the caller wants. The renewal credential stays, so the next use can renew it.
    if (!dropKey) {
      this.carriedSession = this.minted?.session ?? this.carriedSession;
      this.minted = null;
      this.epoch++;
      const key = this.key;
      if (this.store && isWebCryptoKey(key)) this.dropStoredToken(key);
      else this.enqueueClear();
      return this.tailSettled();
    }
    this.minted = null;
    this.generation++;
    this.signedOut = true;
    this.canCreateRecord = false;
    this.carriedSession = null;
    this.clearRenewal();
    this.epoch++;
    this.inflight = null;
    this.renewInflight = null;
    if (!this.hostKey) {
      this.key = null;
      this.keyInflight = null;
      this.publicCryptoKey = null;
      this.publicKeyId = null;
    }
    // Start the delete in this turn, then queue another behind any save already in `tail`.
    // The caller waits for that chain for at most STORE_TIMEOUT_MS.
    this.startClearNow();
    this.enqueueClear();
    return this.tailSettled();
  }

  /**
   * Adopts a stored sign-in, or returns null when there is nothing to adopt.
   * Concurrent calls share one load.
   *
   * A token that still has more than {@link EXPIRY_GUARD_MS} of life is adopted and no request
   * is made. A token inside that guard, or already expired, is renewed when the record holds a
   * renewal credential whose `renewExpiresAt` is still in the future. That is the only request
   * this method makes. A network error or a 5xx from that renew throws {@link RenewalUnavailableError}
   * and leaves the record in place. A 401 clears it and returns null.
   *
   * Absent, wrong version, malformed (including a missing `publicKeyId`, or one that is not
   * the stored public key's `x.y`), a key pair whose halves do not match, or a token that
   * cannot be used and cannot be renewed: the store is cleared and the result is null. A storage
   * failure, including a load that does not settle within {@link STORE_TIMEOUT_MS}, also returns
   * null and does not clear the record. The in-memory credential is left as it was.
   *
   * When this credential already holds a token, or a sign-in / `adopt` is in flight or starts
   * while the load is in flight, nothing is adopted, written, or cleared. The result is the
   * held session, or null when the sign-in has not produced a token yet.
   *
   * A sign-out (`invalidate(true)`) that lands while the load is in flight wins: nothing is
   * adopted and the store is cleared.
   */
  restore(): Promise<GilbSession | null> {
    if (!this.store) return Promise.resolve(null);
    // A held token, or a verify-code still on the wire: do not load, and do not touch the store.
    if (this.minted || this.signInsInFlight > 0) {
      return Promise.resolve(this.minted?.session ?? null);
    }
    if (!this.restoreInflight) {
      const pending = this.doRestore().finally(() => {
        if (this.restoreInflight === pending) this.restoreInflight = null;
      });
      this.restoreInflight = pending;
    }
    return this.restoreInflight;
  }

  private async ensureKey(): Promise<DpopKey> {
    if (this.key) return this.key;
    const gen = this.generation;
    const pending = (this.keyInflight ??= generateDpopKeyPair());
    const key = await pending;
    if (this.keyInflight === pending) this.keyInflight = null;
    // Keep the key only if no sign-out happened while it was being made.
    if (gen === this.generation && !this.key) {
      this.key = key;
      this.publicCryptoKey = null;
      this.publicKeyId = publicKeyIdFromJwk(key.publicJwk);
      // `adopt` may have run before the key existed. A token is stored only with its key.
      if (this.minted && this.store && !this.signedOut) this.pokeIfDirty();
    }
    return this.key ?? key;
  }

  private async getMinted(freshForMs = 0): Promise<Minted> {
    if (this.minted && this.tokenIsLive(this.minted.expiresAt, freshForMs)) {
      return this.minted;
    }
    // Same moment the cookie bridge would re-mint. A held renewal credential is used instead,
    // including after a plain invalidate() dropped the token and kept the key.
    if (this.renewalIsLive()) {
      const result = await this.renewNow();
      if (this.minted && this.tokenIsLive(this.minted.expiresAt, freshForMs)) return this.minted;
      if (result.ok) {
        if (this.minted) return this.minted;
        throw new NotSignedInError();
      }
      if (result.kind === "superseded" && this.minted) return this.minted;
      if (result.kind === "transient") throw new RenewalUnavailableError();
      throw new NotSignedInError();
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
      // First-party only: the session-cookie bridge. A third-party page must not send it.
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
    this.signedOut = false;
    this.minted = minted;
    return minted;
  }

  /**
   * Gives a store op that is already queued a few event-loop turns to finish.
   * Returns without waiting once those turns are spent, so a call that never settles
   * cannot hold sign-in, adopt, or a vault-list read. Never rejects.
   */
  private async flushStore(): Promise<void> {
    if (!this.store) return;
    for (let i = 0; i < STORE_FLUSH_TURNS; i++) {
      const tail = this.tail;
      const settled = await new Promise<boolean>((resolve) => {
        let done = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (value: boolean) => {
          if (done) return;
          done = true;
          if (timer !== undefined) clearTimeout(timer);
          resolve(value);
        };
        tail.then(() => finish(true), () => finish(true));
        timer = setTimeout(() => finish(false), 0);
      });
      if (settled && this.tail === tail) return;
    }
  }

  /**
   * Waits until the queued store ops have finished, or {@link STORE_TIMEOUT_MS} has passed.
   * Never rejects. A timeout leaves the chain running and returns.
   */
  private async tailSettled(): Promise<void> {
    if (!this.store) return;
    for (;;) {
      const tail = this.tail;
      const waited = await this.bounded(tail.then(() => undefined, () => undefined));
      if (!waited.ok) return;
      if (this.tail === tail) return;
    }
  }

  /** A store call, or a storage failure when it throws, rejects, or exceeds {@link STORE_TIMEOUT_MS}. */
  private bounded<T>(work: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: { ok: true; value: T } | { ok: false }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false }), STORE_TIMEOUT_MS);
      work.then(
        (value) => finish({ ok: true, value }),
        () => finish({ ok: false }),
      );
    });
  }

  /** Runs a store call. A synchronous throw becomes a rejection, same as a failed promise. */
  private invokeStore(run: () => Promise<void>): Promise<void> {
    try {
      return Promise.resolve(run());
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private tokenIsLive(expiresAt: number, freshForMs = 0): boolean {
    return this.now() < expiresAt - Math.max(EXPIRY_GUARD_MS, freshForMs);
  }

  private markDirty(): void {
    if (!this.store || this.signedOut) return;
    this.epoch++;
    this.waitingForKey = false;
    this.poke();
  }

  private pokeIfDirty(): void {
    if (!this.store || this.epoch === this.lastWrittenEpoch) return;
    this.waitingForKey = false;
    this.poke();
  }

  /** One drain at a time. A change that lands during it is written before the drain finishes. */
  private poke(): void {
    if (!this.store || this.draining || this.storeHeld > 0) return;
    this.draining = true;
    void this.enqueue(async () => {
      try {
        await this.drain();
      } finally {
        this.draining = false;
        if (!this.waitingForKey && this.store && this.epoch !== this.lastWrittenEpoch) this.poke();
      }
    });
  }

  private async drain(): Promise<void> {
    while (this.store && this.epoch !== this.lastWrittenEpoch) {
      const epoch = this.epoch;
      const gen = this.generation;
      const outcome = await this.writeCurrent(gen, epoch);
      if (outcome === "pending-key") {
        this.waitingForKey = true;
        return;
      }
      // Renewal is writing the rotated record itself. Stop, and let it poke when it releases.
      if (outcome === "held") return;
      this.waitingForKey = false;
      if (outcome === "retry") continue;
      if (this.epoch === epoch) this.lastWrittenEpoch = epoch;
    }
  }

  /**
   * Writes the held session, or skips it.
   * A token inside the guard is not written, and a previous record is cleared so a reload
   * cannot restore a session this credential no longer holds.
   */
  private async writeCurrent(gen: number, epoch: number): Promise<"saved" | "skip" | "pending-key" | "retry" | "held"> {
    if (!this.store || this.generation !== gen || this.signedOut) return "skip";
    if (this.storeHeld > 0) return "held";
    if (this.epoch !== epoch) return "retry";
    const minted = this.minted;
    if (!minted) return "skip";
    if (!isWebCryptoKey(this.key)) return this.key ? "skip" : "pending-key";
    const key = this.key;
    if (!this.tokenIsLive(minted.expiresAt)) {
      // A fresh sign-in that we will not store must not leave the previous record.
      // An update-only credential does not delete: the record may now be another tab's.
      if (this.canCreateRecord) {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
      }
      return this.epoch === epoch ? "skip" : "retry";
    }
    let publicKey: CryptoKey;
    try {
      publicKey = await this.cachedPublicKey(key);
    } catch {
      return "skip";
    }
    // Exported here, before the store call. The transaction only compares this string.
    const exportedId = await publicKeyIdOf(publicKey);
    if (this.generation !== gen || this.signedOut) return "skip";
    if (this.epoch !== epoch || this.minted !== minted) return "retry";
    const held = this.minted;
    if (!held || !exportedId) return "skip";
    if (this.publicKeyId === null) this.publicKeyId = exportedId;
    const samePublicKeyId = this.publicKeyId;
    if (samePublicKeyId !== exportedId) return "skip";
    const record: StoredSession = {
      version: STORED_SESSION_VERSION,
      keyPair: { publicKey, privateKey: key.privateKey },
      publicKeyId: exportedId,
      accessToken: held.accessToken,
      expiresAt: held.expiresAt,
      session: copySession(held.session),
      ...this.renewalRecordFields(),
    };
    const create = this.canCreateRecord;
    const pending = this.invokeStore(() =>
      create ? this.store!.save(record) : this.store!.saveIfSameKey(record, samePublicKeyId),
    );
    const saved = await this.bounded(pending);
    if (!saved.ok) {
      // The call may still land after the timeout. A sign-out that won in the meantime
      // deletes again so the late write does not put the record back.
      void pending.then(() => {
        void this.afterWrite(gen, epoch, create);
      }, () => undefined);
      return "skip";
    }
    await this.afterWrite(gen, epoch, create);
    if (this.generation !== gen || this.signedOut) return "skip";
    if (this.epoch !== epoch) return "retry";
    return "saved";
  }

  /**
   * After a write that landed: a fresh sign-in becomes update-only when this write is still
   * the latest one. A sign-out that won deletes again, so the write does not resurrect it.
   */
  private async afterWrite(gen: number, epoch: number, create: boolean): Promise<void> {
    if (this.generation !== gen || this.signedOut) {
      if (!this.minted || this.signedOut) {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
      }
      return;
    }
    // A newer adopt bumped the epoch and may still need to create. Don't disarm it.
    if (create && this.epoch === epoch) this.canCreateRecord = false;
  }

  private async cachedPublicKey(key: DpopWebCryptoKey): Promise<CryptoKey> {
    if (this.publicCryptoKey) return this.publicCryptoKey;
    const publicKey = await importDpopPublicKey(key.publicJwk);
    if (this.key === key) this.publicCryptoKey = publicKey;
    return publicKey;
  }

  /** Keeps the key in the store and removes the token. Queued behind a save already in flight. */
  private dropStoredToken(key: DpopWebCryptoKey): void {
    const gen = this.generation;
    const privateKey = key.privateKey;
    const jwk = key.publicJwk;
    void this.enqueue(async () => {
      if (this.generation !== gen || this.signedOut) return;
      // A newer live token landed. Its own save writes the record.
      if (this.minted && this.tokenIsLive(this.minted.expiresAt)) return;
      let publicKey = this.publicCryptoKey;
      try {
        if (!publicKey) publicKey = await importDpopPublicKey(jwk);
      } catch {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
        return;
      }
      if (this.generation !== gen || this.signedOut) {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
        return;
      }
      if (this.minted && this.tokenIsLive(this.minted.expiresAt)) return;
      // Same export as a normal save: outside the transaction, before the store call.
      const exportedId = await publicKeyIdOf(publicKey);
      if (this.generation !== gen || this.signedOut) {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
        return;
      }
      if (this.minted && this.tokenIsLive(this.minted.expiresAt)) return;
      if (!exportedId) {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
        return;
      }
      if (this.publicKeyId === null) this.publicKeyId = exportedId;
      const samePublicKeyId = this.publicKeyId;
      if (samePublicKeyId !== exportedId) return;
      // Empty token and empty principal: not a session. `restore` clears it.
      const record: StoredSession = {
        version: STORED_SESSION_VERSION,
        keyPair: { publicKey, privateKey },
        publicKeyId: exportedId,
        accessToken: "",
        expiresAt: 0,
        session: { principal: "", vault: null, vaults: [] },
      };
      const epoch = this.epoch;
      const create = this.canCreateRecord;
      const pending = this.invokeStore(() =>
        create ? this.store!.save(record) : this.store!.saveIfSameKey(record, samePublicKeyId),
      );
      const saved = await this.bounded(pending);
      if (!saved.ok) {
        void pending.then(() => {
          if (this.generation !== gen || this.signedOut) {
            void this.bounded(this.invokeStore(() => this.store!.clear())).then(() => undefined, () => undefined);
            return;
          }
          if (create && this.epoch === epoch) this.canCreateRecord = false;
        }, () => undefined);
        return;
      }
      if (this.generation !== gen || this.signedOut) {
        await this.bounded(this.invokeStore(() => this.store!.clear()));
        return;
      }
      if (create && this.epoch === epoch) this.canCreateRecord = false;
    });
  }

  /** Deletes the record after anything already queued, unless a newer sign-in is now held. */
  private enqueueClear(): void {
    if (!this.store) return;
    const gen = this.generation;
    void this.enqueue(async () => {
      if (this.generation !== gen) return;
      if (this.minted && !this.signedOut) return;
      await this.bounded(this.invokeStore(() => this.store!.clear()));
    });
  }

  /** Starts the delete before yielding, when the store's `clear` does. Failures are swallowed. */
  private startClearNow(): void {
    const store = this.store;
    if (!store) return;
    try {
      const pending = store.clear();
      void pending.then(() => undefined, () => undefined);
    } catch {
      // A sync throw is the same as a rejected clear: the queued clear tries once more.
    }
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    // `run` never rejects, so a caller that does not await it is not an unhandled rejection.
    const run = this.tail.then(() => op()).then(() => undefined, () => undefined);
    this.tail = run;
    return run;
  }

  private async doRestore(): Promise<GilbSession | null> {
    const store = this.store;
    if (!store) return null;
    const gen = this.generation;
    const serial = this.signInSerial;
    // A plain invalidate or a sign-in save may still be queued. Load what it left,
    // not the record it is about to replace. A store op that does not settle is a
    // storage failure: return null and do not clear (the record may still be good).
    for (;;) {
      const tail = this.tail;
      const waited = await this.bounded(tail.then(() => undefined, () => undefined));
      if (!waited.ok) return null;
      if (this.tail === tail) break;
    }
    const stopped = await this.restoreStopped(store, gen, serial);
    if (stopped) return stopped.session;
    const loaded = await this.bounded(store.load());
    // Timeout or a thrown load: not "no record". Leave whatever is stored.
    if (!loaded.ok) return null;
    const stoppedAfterLoad = await this.restoreStopped(store, gen, serial);
    if (stoppedAfterLoad) return stoppedAfterLoad.session;
    const record = storedSessionRecord(loaded.value);
    if (!record) {
      await this.bounded(this.invokeStore(() => store.clear()));
      return null;
    }
    const matches = await keyPairMatches(record.keyPair.privateKey, record.keyPair.publicKey);
    const stoppedAfterPair = await this.restoreStopped(store, gen, serial);
    if (stoppedAfterPair) return stoppedAfterPair.session;
    if (!matches) {
      await this.bounded(this.invokeStore(() => store.clear()));
      return null;
    }
    let jwk: DpopPublicJwk | null = null;
    try {
      jwk = await publicJwkOf(record.keyPair.publicKey);
    } catch {
      jwk = null;
    }
    const publicKeyId = jwk ? publicKeyIdFromJwk(jwk) : null;
    const stoppedAfterJwk = await this.restoreStopped(store, gen, serial);
    if (stoppedAfterJwk) return stoppedAfterJwk.session;
    // Missing id was already refused. This refuses an id that is not the stored public key.
    if (!jwk || !publicKeyId || publicKeyId !== record.publicKeyId) {
      await this.bounded(this.invokeStore(() => store.clear()));
      return null;
    }
    // No await between this check and the adopt, so a sign-out cannot land in between.
    // A sign-out's own delete is already running; clearing again here would be that await.
    if (gen !== this.generation || this.signedOut) return null;
    if (this.minted || this.signInsInFlight > 0 || serial !== this.signInSerial) {
      return this.minted?.session ?? null;
    }
    const renewal = readStoredRenewal(record, this.now());
    const tokenLive = this.tokenIsLive(record.expiresAt);
    if (!tokenLive && !renewal) {
      await this.bounded(this.invokeStore(() => store.clear()));
      return null;
    }
    // The clear above is the only await on the dead-token path. A sign-out or a sign-in
    // that landed during it wins: do not install the key over it.
    if (!tokenLive) {
      if (gen !== this.generation || this.signedOut) return null;
      if (this.minted || this.signInsInFlight > 0 || serial !== this.signInSerial) {
        // `this.session`, not `this.minted?.session`: the check above already narrowed
        // `minted` to null for the type checker, and a sign-in during the clear can hold one.
        return this.session;
      }
    }
    // Adopted from the store: a later save must not create the record again.
    this.canCreateRecord = false;
    this.publicCryptoKey = record.keyPair.publicKey;
    this.publicKeyId = publicKeyId;
    this.key = { publicJwk: jwk, privateKey: record.keyPair.privateKey };
    if (renewal) this.installRenewal(renewal);
    else this.clearRenewal();
    if (!tokenLive) {
      // The only request restore makes: the access token is inside the guard or expired,
      // and the renewal credential is still in date.
      this.carriedSession = copySession(record.session);
      const result = await this.renewNow();
      if (gen !== this.generation || this.signedOut) return null;
      if (serial !== this.signInSerial || this.signInsInFlight > 0) return this.session;
      if (result.ok) return result.session;
      if (result.kind === "transient") throw new RenewalUnavailableError();
      if (result.kind === "superseded") return this.session;
      return null;
    }
    const session = copySession(record.session);
    this.minted = {
      accessToken: record.accessToken,
      expiresAt: record.expiresAt,
      jkt: "",
      session,
    };
    return session;
  }

  /**
   * Null when this restore may still adopt. Otherwise the session to return, and this
   * restore adopts nothing and writes nothing.
   *
   * Sign-out wins: the stored record is cleared and the result is null. A sign-in that
   * started after `serial` was captured, or a token already held, keeps that session
   * (or null when the sign-in has not produced a token yet) and does not clear.
   *
   * @param clearOnSignOut when false, a sign-out is not cleared from here. The adopt
   *   that follows must not await a store call.
   */
  private async restoreStopped(
    store: SessionStore,
    gen: number,
    serial: number,
    clearOnSignOut = true,
  ): Promise<{ session: GilbSession | null } | null> {
    if (gen !== this.generation || this.signedOut) {
      if (clearOnSignOut) await this.bounded(this.invokeStore(() => store.clear()));
      return { session: null };
    }
    if (this.minted || this.signInsInFlight > 0 || serial !== this.signInSerial) {
      return { session: this.minted?.session ?? null };
    }
    return null;
  }

  /**
   * Renews the held sign-in. An app calls this on start-up or when the page becomes visible,
   * so the 14-day window moves forward from last use. Also used by {@link authHeaders} and
   * {@link restore} when the access token is inside the guard.
   *
   * One flight per credential. Across tabs, the flight runs inside
   * `navigator.locks` (`gilb-signin-renew:` plus the origin) when that API exists. Inside the
   * lock the store is re-read. A different credential for this same key means another tab
   * already rotated: that record is adopted and the platform is not called. The credential
   * this tab holds is never sent twice.
   *
   * A 401 ends the sign-in (the store is cleared, the token and the credential are dropped,
   * `session` is null) and this returns null. A network error or a 5xx keeps everything and
   * throws {@link RenewalUnavailableError}. A sign-out that starts while this is in flight
   * wins: the answer is not stored.
   *
   * With no `navigator.locks`, two tabs can both present the same credential. The platform
   * then ends the sign-in, and the tab that presented it second is signed out.
   *
   * @returns the session after renewal, the session already held when nothing needed renewing,
   *   or null when the sign-in is over
   */
  async renew(): Promise<GilbSession | null> {
    if (!this.renewalIsLive()) {
      return this.minted && this.tokenIsLive(this.minted.expiresAt) ? this.session : null;
    }
    const result = await this.renewNow();
    if (result.ok) return result.session;
    if (result.kind === "transient") throw new RenewalUnavailableError();
    if (result.kind === "superseded") return this.session;
    return null;
  }

  /**
   * Ends the sign-in on the server, then locally. The local clear always runs, including when
   * the server call fails, is refused, or does not finish within {@link SIGN_OUT_BOUND_MS}.
   *
   * The server call is `POST {origin}/base/auth/sign-out` with `Authorization: DPoP <token>`
   * and a fresh `DPoP` proof. No token held means the server is not called.
   *
   * @param origin the sign-in service origin, no trailing slash required
   * @returns whether the server recorded the sign-out (HTTP 204)
   */
  async signOut(origin: string): Promise<{ serverSignedOut: boolean }> {
    const serverSignedOut = await this.tryServerSignOut(origin);
    await this.invalidate(true);
    return { serverSignedOut };
  }

  /** True when this credential stores and the app did not turn renewal off. */
  private renewalWanted(): boolean {
    return this.store !== null && this.opts.renew !== false;
  }

  /** A credential that can still be presented: held, in date, and we still have its key. */
  private renewalIsLive(): boolean {
    return this.renewCredential !== null
      && this.renewOrigin !== null
      && this.renewExpiresAtMs !== null
      && this.key !== null
      && this.now() < this.renewExpiresAtMs;
  }

  private clearRenewal(): void {
    this.renewCredential = null;
    this.renewExpiresAt = null;
    this.renewExpiresAtMs = null;
    this.renewOrigin = null;
  }

  private installRenewal(renewal: StoredRenewal): void {
    this.renewCredential = renewal.renew;
    this.renewExpiresAt = renewal.renewExpiresAt;
    this.renewExpiresAtMs = renewal.expiresAtMs;
    this.renewOrigin = renewal.origin;
  }

  /**
   * Keeps a verify-code renewal, or drops any previous one when this sign-in was not issued one.
   * Called before `adopt` starts the save.
   */
  private rememberRenewal(origin: string, renew: unknown, renewExpiresAt: unknown): void {
    this.clearRenewal();
    if (!this.renewalWanted()) return;
    if (typeof renew !== "string" || renew.length === 0) return;
    if (typeof renewExpiresAt !== "string") return;
    const expiresAtMs = Date.parse(renewExpiresAt);
    if (!Number.isFinite(expiresAtMs)) return;
    this.installRenewal({
      renew,
      renewExpiresAt,
      expiresAtMs,
      origin: normaliseOrigin(origin),
    });
  }

  private renewalRecordFields(): { renew: string; renewExpiresAt: string; origin: string } | Record<string, never> {
    if (!this.renewCredential || !this.renewExpiresAt || !this.renewOrigin) return {};
    return {
      renew: this.renewCredential,
      renewExpiresAt: this.renewExpiresAt,
      origin: this.renewOrigin,
    };
  }

  /**
   * One renewal. Callers share {@link renewInflight}. The body runs under the cross-tab lock
   * when `navigator.locks` exists.
   */
  private renewNow(): Promise<RenewAttempt> {
    if (this.renewInflight) return this.renewInflight;
    if (!this.renewOrigin || !this.renewalIsLive()) return Promise.resolve({ ok: false, kind: "none" });
    const gen = this.generation;
    const serial = this.signInSerial;
    const origin = this.renewOrigin;
    const pending = this.withRenewLock(origin, () => this.renewLocked(gen, serial)).finally(() => {
      if (this.renewInflight === pending) this.renewInflight = null;
    });
    this.renewInflight = pending;
    return pending;
  }

  private withRenewLock<T>(origin: string, run: () => Promise<T>): Promise<T> {
    let locks: LockManager | null = null;
    try {
      locks = globalThis.navigator?.locks ?? null;
    } catch {
      locks = null;
    }
    if (!locks || typeof locks.request !== "function") return run();
    // The DOM callback type is `() => T`, so a promise-returning callback is typed as
    // `Promise<Promise<T>>`. The lock API holds until that promise settles and resolves
    // to its value.
    return locks.request(`gilb-signin-renew:${origin}`, () => run()) as Promise<T>;
  }

  /**
   * Holds the store drain, re-reads the record, and either adopts another tab's rotation
   * or posts this tab's credential. The post and the save both finish before the lock
   * (when there is one) is released. A sign-out that bumped the generation is not sent
   * a credential, and its answer is not stored.
   */
  private async renewLocked(gen: number, serial: number): Promise<RenewAttempt> {
    this.storeHeld++;
    try {
      await this.tailFinished();
      if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
      const heldRenew = this.renewCredential;
      const heldKeyId = this.publicKeyId;
      if (!heldRenew || !this.renewOrigin || !this.key) return { ok: false, kind: "none" };
      const rotated = await this.rotationFromStore(gen, serial, heldRenew, heldKeyId);
      if (rotated) return rotated;
      if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
      return await this.postRenew(gen, serial, heldRenew);
    } finally {
      this.storeHeld--;
      if (!this.signedOut && this.store && this.epoch !== this.lastWrittenEpoch) this.poke();
    }
  }

  /** Another tab's record, or null when this tab should post the credential it holds. */
  private async rotationFromStore(
    gen: number,
    serial: number,
    heldRenew: string,
    heldKeyId: string | null,
  ): Promise<RenewAttempt | null> {
    if (!this.store || !heldKeyId) return null;
    const loaded = await this.bounded(this.store.load());
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    if (!loaded.ok || !loaded.value) return null;
    const stored = loaded.value;
    if (stored.publicKeyId !== heldKeyId) return null;
    if (typeof stored.renew !== "string" || stored.renew.length === 0) return null;
    if (stored.renew === heldRenew) return null;
    // Different credential, same key: the other tab rotated. Never post ours.
    return this.adoptRotatedRecord(gen, serial, stored);
  }

  private adoptRotatedRecord(gen: number, serial: number, record: StoredSession): RenewAttempt {
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    const renewal = readStoredRenewal(record, this.now());
    if (!renewal) return { ok: false, kind: "transient" };
    if (typeof record.accessToken !== "string" || record.accessToken.length === 0) return { ok: false, kind: "transient" };
    if (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return { ok: false, kind: "transient" };
    if (!isGilbSession(record.session)) return { ok: false, kind: "transient" };
    this.installRenewal(renewal);
    this.carriedSession = null;
    this.canCreateRecord = false;
    this.minted = {
      accessToken: record.accessToken,
      expiresAt: record.expiresAt,
      jkt: "",
      session: copySession(record.session),
    };
    // The store already holds this record. Do not write it again.
    this.epoch++;
    this.lastWrittenEpoch = this.epoch;
    return { ok: true, session: this.minted.session };
  }

  private async postRenew(gen: number, serial: number, credential: string): Promise<RenewAttempt> {
    const origin = this.renewOrigin;
    const key = this.key;
    if (!origin || !key) return { ok: false, kind: "none" };
    const url = `${origin}${RENEW_SIGN_IN_PATH}`;
    let proof: string;
    try {
      // No access token: the platform refuses a proof that carries `ath`.
      proof = await dpopProof(key, "POST", url);
    } catch {
      if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
      return { ok: false, kind: "transient" };
    }
    // A sign-out that landed while the proof was built must not be followed by the POST.
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    const send = this.opts.transport ?? fetchTransport;
    let res: TransportResponse;
    try {
      res = await send(url, {
        method: "POST",
        credentials: "omit",
        headers: { DPoP: proof, "Content-Type": "application/json" },
        body: JSON.stringify({ renew: credential }),
        timeoutMs: 15000,
      });
    } catch {
      if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
      return { ok: false, kind: "transient" };
    }
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    if (res.status === 401) {
      await this.invalidate(true);
      return { ok: false, kind: "unauthorized" };
    }
    if (res.status < 200 || res.status > 299) return { ok: false, kind: "transient" };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    const parsed = parseRenewed(body);
    if (!parsed) {
      // The server answered 200, so the credential we sent may be spent. Drop it.
      // Presenting it again would end the sign-in.
      await this.invalidate(true);
      return { ok: false, kind: "unauthorized" };
    }
    return this.commitRenewal(gen, serial, parsed);
  }

  /**
   * Adopts the rotated token and credential, and writes them before the caller releases
   * the lock. The record is built before the save awaits. A sign-out or a newer sign-in
   * that wins during the save is not left stored.
   */
  private async commitRenewal(gen: number, serial: number, next: RenewedBody): Promise<RenewAttempt> {
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    const prior = this.minted?.session ?? this.carriedSession;
    const session: GilbSession = prior
      ? { ...copySession(prior), principal: next.principal }
      : { principal: next.principal, vault: null, vaults: [] };
    const expiresAtMs = Date.parse(next.renewExpiresAt);
    const minted: Minted = {
      accessToken: next.token,
      expiresAt: tokenExpiresAt(next.token, this.now()),
      jkt: "",
      session,
    };
    // No await between the stop-check above and these writes.
    this.installRenewal({
      renew: next.renew,
      renewExpiresAt: next.renewExpiresAt,
      expiresAtMs,
      origin: this.renewOrigin ?? "",
    });
    this.carriedSession = null;
    this.minted = minted;
    const epoch = ++this.epoch;
    const saved = await this.saveRenewedRecord(gen, serial, epoch, minted);
    if (saved === "signed-out") return { ok: false, kind: "signed-out" };
    if (saved === "superseded") return { ok: false, kind: "superseded" };
    if (this.renewStopped(gen, serial)) return this.stoppedRenewAttempt(gen);
    return { ok: true, session: minted.session };
  }

  /**
   * Update-only save of the rotated record. A sign-out after the write deletes it again.
   * A newer sign-in is left to its own save.
   */
  private async saveRenewedRecord(
    gen: number,
    serial: number,
    epoch: number,
    minted: Minted,
  ): Promise<"saved" | "signed-out" | "superseded" | "skipped"> {
    if (!this.store || !isWebCryptoKey(this.key)) return "skipped";
    let publicKey: CryptoKey;
    try {
      publicKey = await this.cachedPublicKey(this.key);
    } catch {
      return this.renewStopped(gen, serial) ? this.stoppedSave(gen) : "skipped";
    }
    const exportedId = await publicKeyIdOf(publicKey);
    if (this.generation !== gen || this.signedOut) return "signed-out";
    if (this.signInSerial !== serial) return "superseded";
    if (!exportedId || !this.minted || this.minted.accessToken !== minted.accessToken) return "superseded";
    if (this.publicKeyId === null) this.publicKeyId = exportedId;
    if (this.publicKeyId !== exportedId) return "skipped";
    const fields = this.renewalRecordFields();
    if (!("renew" in fields)) return "skipped";
    const record: StoredSession = {
      version: STORED_SESSION_VERSION,
      keyPair: { publicKey, privateKey: this.key.privateKey },
      publicKeyId: exportedId,
      accessToken: minted.accessToken,
      expiresAt: minted.expiresAt,
      session: copySession(minted.session),
      ...fields,
    };
    const samePublicKeyId = this.publicKeyId;
    // Not the 400 ms store cap. The lock (when there is one) stays held until this
    // settles, so another tab cannot read the spent credential.
    const pending = this.invokeStore(() => this.store!.saveIfSameKey(record, samePublicKeyId));
    let landed = true;
    try {
      await pending;
    } catch {
      landed = false;
    }
    if (this.generation !== gen || this.signedOut) {
      if (landed) await this.bounded(this.invokeStore(() => this.store!.clear()));
      return "signed-out";
    }
    if (this.signInSerial !== serial || this.minted?.accessToken !== minted.accessToken) return "superseded";
    if (!landed) return "skipped";
    if (this.epoch === epoch) this.lastWrittenEpoch = epoch;
    this.canCreateRecord = false;
    return "saved";
  }

  private renewStopped(gen: number, serial: number): boolean {
    return this.generation !== gen || this.signedOut || this.signInSerial !== serial;
  }

  private stoppedRenewAttempt(gen: number): RenewAttempt {
    if (this.generation !== gen || this.signedOut) return { ok: false, kind: "signed-out" };
    return { ok: false, kind: "superseded" };
  }

  private stoppedSave(gen: number): "signed-out" | "superseded" {
    return this.generation !== gen || this.signedOut ? "signed-out" : "superseded";
  }

  /** Waits out store ops already queued. Not capped: a stale save landing after a rotation would store a spent credential. */
  private async tailFinished(): Promise<void> {
    for (;;) {
      const tail = this.tail;
      await tail.then(() => undefined, () => undefined);
      if (this.tail === tail) return;
    }
  }

  /**
   * Best-effort server sign-out. Errors, refusals, and a call that outlives
   * {@link SIGN_OUT_BOUND_MS} are `false`. Never throws.
   */
  private async tryServerSignOut(origin: string): Promise<boolean> {
    const minted = this.minted;
    const key = this.key;
    if (!minted || !key) return false;
    const gen = this.generation;
    const url = `${normaliseOrigin(origin)}${SIGN_OUT_PATH}`;
    let headers: { Authorization: string; DPoP: string };
    try {
      headers = await dpopHeaders(key, minted.accessToken, "POST", url);
    } catch {
      return false;
    }
    // A sign-out that already started (a second call) must not send the token again.
    if (gen !== this.generation || this.signedOut || this.minted !== minted) return false;
    const send = this.opts.transport ?? fetchTransport;
    const attempt = send(url, {
      method: "POST",
      credentials: "omit",
      headers: { ...headers },
      timeoutMs: SIGN_OUT_BOUND_MS,
    }).then(
      (res) => res.status === 204,
      () => false,
    );
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), SIGN_OUT_BOUND_MS);
      attempt.then(finish, () => finish(false));
    });
  }
}

function selectStore(opts: SessionCredentialOptions): SessionStore | null {
  // A host-passed key is never stored: the host owns it. `false` is an explicit opt out.
  // `dpopMintUrl` stores nothing either, and an explicit `store` is ignored: the session
  // cookie re-mints, which is the first-party behaviour.
  if (opts.key || opts.store === false || opts.dpopMintUrl) return null;
  if (opts.store) return opts.store;
  try {
    if (!globalThis.indexedDB) return null;
  } catch {
    return null;
  }
  try {
    return indexedDbSessionStore(SESSION_DB_NAME);
  } catch {
    return null;
  }
}

function isWebCryptoKey(key: DpopKey | null): key is DpopWebCryptoKey {
  return !!key && "privateKey" in key && key.privateKey instanceof CryptoKey;
}

async function importDpopPublicKey(jwk: DpopPublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
}

async function publicJwkOf(key: CryptoKey): Promise<DpopPublicJwk | null> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string") return null;
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

/** `x.y` of a public JWK. Empty coordinates are not an id. */
function publicKeyIdFromJwk(jwk: { x?: unknown; y?: unknown }): string | null {
  if (typeof jwk.x !== "string" || jwk.x.length === 0 || typeof jwk.y !== "string" || jwk.y.length === 0) return null;
  return `${jwk.x}.${jwk.y}`;
}

/** Id of an extractable public key. Callers run this outside any IndexedDB transaction. The private key is never exported. */
async function publicKeyIdOf(key: CryptoKey): Promise<string | null> {
  try {
    return publicKeyIdFromJwk(await crypto.subtle.exportKey("jwk", key));
  } catch {
    return null;
  }
}

function copySession(session: GilbSession): GilbSession {
  const copy: GilbSession = {
    principal: session.principal,
    vault: session.vault
      ? {
          entity: session.vault.entity,
          id: session.vault.id,
          name: session.vault.name,
          ...(session.vault.shortWebId !== undefined ? { shortWebId: session.vault.shortWebId } : {}),
        }
      : null,
    vaults: session.vaults.map((vault) => ({ vaultId: vault.vaultId, modes: [...vault.modes] })),
  };
  if (session.vaultsProblem !== undefined) copy.vaultsProblem = session.vaultsProblem;
  return copy;
}

/**
 * A stored record with a usable key and token. The token may already be inside the guard:
 * `restore` renews it when {@link readStoredRenewal} finds a credential that is still in date,
 * and clears it otherwise.
 */
function storedSessionRecord(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<StoredSession>;
  if (record.version !== STORED_SESSION_VERSION) return null;
  if (!record.keyPair || typeof record.keyPair !== "object") return null;
  if (!isSigningPrivateKey(record.keyPair.privateKey) || !isVerifyPublicKey(record.keyPair.publicKey)) return null;
  // Present and non-empty. Equality with the public key's own `x.y` is checked after
  // export, in `doRestore`, still outside any transaction.
  if (typeof record.publicKeyId !== "string" || record.publicKeyId.length === 0) return null;
  if (typeof record.accessToken !== "string" || record.accessToken.length === 0) return null;
  if (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null;
  if (!isGilbSession(record.session)) return null;
  return record as StoredSession;
}

/** A renewal credential `restore` or a cross-tab adopt can still present. */
interface StoredRenewal {
  renew: string;
  renewExpiresAt: string;
  expiresAtMs: number;
  origin: string;
}

/** What one renewal attempt produced. `superseded` leaves a newer sign-in in place. */
type RenewAttempt =
  | { ok: true; session: GilbSession }
  | { ok: false; kind: "unauthorized" | "transient" | "signed-out" | "superseded" | "none" };

/** The four fields a 200 from the renew route must carry. */
interface RenewedBody {
  token: string;
  renew: string;
  renewExpiresAt: string;
  principal: string;
}

function assertRenewWindowSec(value: number): void {
  if (!Number.isSafeInteger(value) || value < RENEW_WINDOW_MIN_SEC || value > RENEW_WINDOW_MAX_SEC) {
    throw new TypeError("renewWindowSec must be an integer from 300 to 1209600 seconds");
  }
}

function normaliseOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function readStoredRenewal(record: StoredSession, now: number): StoredRenewal | null {
  if (typeof record.renew !== "string" || record.renew.length === 0) return null;
  if (typeof record.renewExpiresAt !== "string") return null;
  const expiresAtMs = Date.parse(record.renewExpiresAt);
  if (!Number.isFinite(expiresAtMs) || !(now < expiresAtMs)) return null;
  if (typeof record.origin !== "string" || record.origin.length === 0) return null;
  return {
    renew: record.renew,
    renewExpiresAt: record.renewExpiresAt,
    expiresAtMs,
    origin: normaliseOrigin(record.origin),
  };
}

function parseRenewed(body: unknown): RenewedBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.length === 0) return null;
  if (typeof record.renew !== "string" || record.renew.length === 0) return null;
  if (typeof record.renewExpiresAt !== "string" || !Number.isFinite(Date.parse(record.renewExpiresAt))) return null;
  if (typeof record.principal !== "string" || record.principal.length === 0) return null;
  return {
    token: record.token,
    renew: record.renew,
    renewExpiresAt: record.renewExpiresAt,
    principal: record.principal,
  };
}

function isSigningPrivateKey(key: unknown): key is CryptoKey {
  if (typeof CryptoKey === "undefined" || !(key instanceof CryptoKey)) return false;
  if (key.type !== "private" || key.extractable) return false;
  const alg = key.algorithm;
  if (!alg || alg.name !== "ECDSA" || !("namedCurve" in alg) || alg.namedCurve !== "P-256") return false;
  return key.usages.includes("sign");
}

function isVerifyPublicKey(key: unknown): key is CryptoKey {
  if (typeof CryptoKey === "undefined" || !(key instanceof CryptoKey)) return false;
  if (key.type !== "public") return false;
  const alg = key.algorithm;
  if (!alg || alg.name !== "ECDSA" || !("namedCurve" in alg) || alg.namedCurve !== "P-256") return false;
  return key.usages.includes("verify");
}

/** Proves the stored halves belong together. A throw is a mismatch: the record is not adopted. */
async function keyPairMatches(privateKey: CryptoKey, publicKey: CryptoKey): Promise<boolean> {
  try {
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      STORED_PAIR_CHALLENGE,
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature,
      STORED_PAIR_CHALLENGE,
    );
  } catch {
    return false;
  }
}

function isGilbSession(value: unknown): value is GilbSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<GilbSession>;
  if (typeof session.principal !== "string" || session.principal.length === 0) return false;
  if (!isVaultInfo(session.vault)) return false;
  if (!Array.isArray(session.vaults)) return false;
  for (const vault of session.vaults) {
    if (!vault || typeof vault !== "object") return false;
    if (typeof vault.vaultId !== "string" || vault.vaultId.length === 0) return false;
    if (!Array.isArray(vault.modes)) return false;
    for (const mode of vault.modes) if (mode !== "read" && mode !== "write") return false;
  }
  if (session.vaultsProblem !== undefined && typeof session.vaultsProblem !== "string") return false;
  return true;
}

function isVaultInfo(value: unknown): value is GilbSession["vault"] {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const vault = value as Partial<NonNullable<GilbSession["vault"]>>;
  if (typeof vault.entity !== "string" || typeof vault.id !== "string" || typeof vault.name !== "string") return false;
  return vault.shortWebId === undefined || typeof vault.shortWebId === "string";
}
