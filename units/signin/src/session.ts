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
//   - on the cookieless path, the same key and token in {@link SessionStore}, so a reload can
//     call `restore()` and keep the sign-in until the token's own expiry. The private key is
//     stored as a CryptoKey, never exported. A host-passed key is never stored.
//
// Where a token comes from, in this order:
//   1. `restore()`: the record the store kept from an earlier page. No request is made. A token
//      inside the expiry guard, a wrong version, or a malformed record is dropped.
//   2. `adopt()`: the token verify-code returned (the cookieless path). verify-code returns no
//      vault list. The session-cookie bridge below is first-party only, so a third-party app
//      cannot learn its vaults from either answer. `signInWithCode` therefore reads
//      `GET /lws/vaults` on the same origin the code was verified at, with a DPoP proof and no
//      cookies.
//   3. The DPoP session bridge, when the host names its URL (`dpopMintUrl`): a POST that rides the
//      platform's session cookie and returns a token bound to this key, and the vault list with
//      it. That re-mint is what keeps a first-party page signed in across a reload. Those pages
//      store nothing here. A third-party page cannot use the bridge.
//
// ⛔ Nothing here names a host. The host passes every URL. (Checked by
// `scripts/check-host-agnostic.mjs`.)
// ⛔ Nothing here signs a DPoP proof itself. `dpopHeaders` in `./dpop` is the one way.

import { dpopHeaders, generateDpopKeyPair, type DpopKey, type DpopPublicJwk, type DpopWebCryptoKey } from "./dpop";
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
   * `indexedDbSessionStore(SESSION_DB_NAME)`. `false` stores nothing. A `dpopMintUrl` (the page
   * re-mints from the session cookie) stores nothing either: that page keeps today's behaviour.
   */
  store?: SessionStore | false;
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
  /**
   * Set by sign-out. `restore` on this same instance must not adopt a record the sign-out
   * was meant to delete, even when the delete has not landed yet.
   */
  private signedOut = false;
  /** Public CryptoKey paired with `this.key`, so a save does not import it again. */
  private publicCryptoKey: CryptoKey | null = null;
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
  private readonly hostKey: boolean;
  private readonly store: SessionStore | null;
  private readonly opts: SessionCredentialOptions;

  constructor(opts: SessionCredentialOptions = {}) {
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
   * @returns a promise that settles the store write. The token is held before it resolves.
   *   A token already inside {@link EXPIRY_GUARD_MS} is held in memory and not written.
   *   The promise does not reject: a storage failure leaves the in-memory sign-in in place.
   */
  adopt(accessToken: string, session: GilbSession, expiresAt?: number): Promise<void> {
    this.signedOut = false;
    this.minted = {
      accessToken,
      expiresAt: expiresAt ?? tokenExpiresAt(accessToken, this.now()),
      jkt: "",
      session,
    };
    this.markDirty();
    return this.storeSettled();
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
    // The store write finishes before this promise settles, including when the body throws:
    // a sign-out during the code or the vault list must not lose the race to a save.
    return this.withStore(this.signInWithCodeBody(origin, email, code, name, productName));
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
    });
    if (gen !== this.generation) throw new NotSignedInError();
    if (!body.token || !body.principal) {
      // A vault name is still owed: no token yet, and that is not an error for the caller.
      if (body.needsVaultName) return body;
      throw new NotSignedInError();
    }
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
    return this.withStore(this.loadReachableVaultsBody(origin));
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
   * The store follows. The returned promise settles that write and does not reject; the
   * in-memory drop has already happened when this returns to the caller.
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
    this.minted = null;
    // Only a sign-out (dropKey) stops work in progress. A plain invalidate() is the re-mint
    // after a 401: the sign-in is still live, so a mint already under way is the fresh token
    // the caller wants.
    if (!dropKey) {
      this.epoch++;
      const key = this.key;
      if (this.store && isWebCryptoKey(key)) this.dropStoredToken(key);
      else this.enqueueClear();
      return this.storeSettled();
    }
    this.generation++;
    this.signedOut = true;
    this.epoch++;
    this.inflight = null;
    if (!this.hostKey) {
      this.key = null;
      this.keyInflight = null;
      this.publicCryptoKey = null;
    }
    // Start the delete in this turn, then queue another behind any save already in `tail`.
    this.startClearNow();
    this.enqueueClear();
    return this.storeSettled();
  }

  /**
   * Adopts a stored sign-in, or returns null when there is nothing to adopt.
   * Makes no request. Concurrent calls share one load.
   *
   * Absent, wrong version, malformed, or a token inside {@link EXPIRY_GUARD_MS}: the store is
   * cleared and the result is null. A storage failure also returns null and leaves the
   * in-memory credential as it was. A sign-out (`invalidate(true)`) that lands while the load
   * is in flight wins: nothing is adopted and the store is cleared.
   */
  restore(): Promise<GilbSession | null> {
    if (!this.store) return Promise.resolve(null);
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
      // `adopt` may have run before the key existed. A token is stored only with its key.
      if (this.minted && this.store && !this.signedOut) this.pokeIfDirty();
    }
    return this.key ?? key;
  }

  private async getMinted(freshForMs = 0): Promise<Minted> {
    if (this.minted && this.tokenIsLive(this.minted.expiresAt, freshForMs)) {
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

  /** Waits for store ops already queued. No wait when this credential stores nothing, so the cookieless-free and first-party paths keep their timing. */
  private withStore<T>(work: Promise<T>): Promise<T> {
    if (!this.store) return work;
    return work.finally(() => this.tail.then(() => undefined, () => undefined));
  }

  /** The tail promise when a store is in use, otherwise an already resolved promise. Never rejects. */
  private storeSettled(): Promise<void> {
    if (!this.store) return Promise.resolve();
    return this.tail.then(() => undefined, () => undefined);
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
    if (!this.store || this.draining) return;
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
  private async writeCurrent(gen: number, epoch: number): Promise<"saved" | "skip" | "pending-key" | "retry"> {
    if (!this.store || this.generation !== gen || this.signedOut) return "skip";
    if (this.epoch !== epoch) return "retry";
    const minted = this.minted;
    if (!minted) return "skip";
    if (!isWebCryptoKey(this.key)) return this.key ? "skip" : "pending-key";
    const key = this.key;
    if (!this.tokenIsLive(minted.expiresAt)) {
      try { await this.store.clear(); } catch { /* the in-memory token still stands */ }
      return this.epoch === epoch ? "skip" : "retry";
    }
    let publicKey: CryptoKey;
    try {
      publicKey = await this.cachedPublicKey(key);
    } catch {
      return "skip";
    }
    if (this.generation !== gen || this.signedOut) return "skip";
    if (this.epoch !== epoch || this.minted !== minted) return "retry";
    const held = this.minted;
    if (!held) return "skip";
    const record: StoredSession = {
      version: STORED_SESSION_VERSION,
      keyPair: { publicKey, privateKey: key.privateKey },
      accessToken: held.accessToken,
      expiresAt: held.expiresAt,
      session: copySession(held.session),
    };
    try {
      await this.store.save(record);
    } catch {
      return "skip";
    }
    // A sign-out while `save` was in flight may have deleted first. Delete again so the
    // save does not resurrect the session. A newer sign-in (minted, not signed out) is left
    // for the next pass.
    if (this.generation !== gen || this.signedOut) {
      if (!this.minted || this.signedOut) {
        try { await this.store.clear(); } catch { /* the queued sign-out clear also runs */ }
      }
      return "skip";
    }
    if (this.epoch !== epoch) return "retry";
    return "saved";
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
        try { await this.store?.clear(); } catch { /* the in-memory key is unchanged */ }
        return;
      }
      if (this.generation !== gen || this.signedOut) {
        try { await this.store?.clear(); } catch { /* sign-out wins */ }
        return;
      }
      if (this.minted && this.tokenIsLive(this.minted.expiresAt)) return;
      // Empty token and empty principal: not a session. `restore` clears it.
      const record: StoredSession = {
        version: STORED_SESSION_VERSION,
        keyPair: { publicKey, privateKey },
        accessToken: "",
        expiresAt: 0,
        session: { principal: "", vault: null, vaults: [] },
      };
      try {
        await this.store!.save(record);
      } catch {
        return;
      }
      if (this.generation !== gen || this.signedOut) {
        try { await this.store!.clear(); } catch { /* sign-out wins */ }
      }
    });
  }

  /** Deletes the record after anything already queued, unless a newer sign-in is now held. */
  private enqueueClear(): void {
    if (!this.store) return;
    const gen = this.generation;
    void this.enqueue(async () => {
      if (this.generation !== gen) return;
      if (this.minted && !this.signedOut) return;
      try { await this.store!.clear(); } catch { /* best effort */ }
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
    // A plain invalidate or a sign-in save may still be queued. Load what it left,
    // not the record it is about to replace. Follow the chain if a later op was queued
    // while the earlier one was finishing.
    for (;;) {
      const tail = this.tail;
      await tail.then(() => undefined, () => undefined);
      if (this.tail === tail) break;
    }
    if (gen !== this.generation || this.signedOut) {
      try { await store.clear(); } catch { /* sign-out already started a delete */ }
      return null;
    }
    let raw: unknown;
    try {
      raw = await store.load();
    } catch {
      return null;
    }
    if (gen !== this.generation || this.signedOut) {
      try { await store.clear(); } catch { /* sign-out already started a delete */ }
      return null;
    }
    const record = liveStoredSession(raw, this.now());
    if (!record) {
      try { await store.clear(); } catch { /* still nothing to adopt */ }
      return null;
    }
    let jwk: DpopPublicJwk | null = null;
    try {
      jwk = await publicJwkOf(record.keyPair.publicKey);
    } catch {
      jwk = null;
    }
    if (gen !== this.generation || this.signedOut) {
      try { await store.clear(); } catch { /* sign-out wins: store nothing */ }
      return null;
    }
    if (!jwk) {
      try { await store.clear(); } catch { /* the record cannot be adopted */ }
      return null;
    }
    // No await between this check and the write, so a sign-out cannot land in between.
    if (gen !== this.generation || this.signedOut) return null;
    this.publicCryptoKey = record.keyPair.publicKey;
    this.key = { publicJwk: jwk, privateKey: record.keyPair.privateKey };
    const session = copySession(record.session);
    this.minted = {
      accessToken: record.accessToken,
      expiresAt: record.expiresAt,
      jkt: "",
      session,
    };
    return session;
  }
}

function selectStore(opts: SessionCredentialOptions): SessionStore | null {
  // A host-passed key is never stored: the host owns it. A session-cookie bridge re-mints,
  // so those pages keep today's behaviour. `false` is an explicit opt out.
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

/** A record `restore` can adopt. Anything else is cleared. */
function liveStoredSession(raw: unknown, now: number): StoredSession | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<StoredSession>;
  if (record.version !== STORED_SESSION_VERSION) return null;
  if (!record.keyPair || typeof record.keyPair !== "object") return null;
  if (!isSigningPrivateKey(record.keyPair.privateKey) || !isVerifyPublicKey(record.keyPair.publicKey)) return null;
  if (typeof record.accessToken !== "string" || record.accessToken.length === 0) return null;
  if (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null;
  if (!(now < record.expiresAt - EXPIRY_GUARD_MS)) return null;
  if (!isGilbSession(record.session)) return null;
  return record as StoredSession;
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
