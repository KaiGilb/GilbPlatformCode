// The auth seam of the platform client: the five calls the client makes to sign a request, held in one place.
//
// The client modules (records, vault sets, relations, share, ...) never read a token or build a proof. They ask this
// module for the headers of one request and for the three session acts below, and this module asks whatever
// host the app set. Which sign-in the host uses (a cookie bridge, a one-time code, a machine key) is not the client's
// business. What is the client's business, and is decided here once for every host, is WHERE a credential may go: a
// header-forming call first asks `credentialAllowedAt` (peer `vault-origin-rule`) and answers `{}` for a URL outside
// the platform, whatever the host would have answered.
//
// The names and signatures are the ones the app's own auth modules export, so a copied client module changes only its
// import path. The one extra is the optional `method` of `bearerHeaderFor`: see its comment.

import { credentialAllowedAt } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** One vault the signed-in principal reaches, and what it may do there (the lean shape the session carries). */
export interface LwsSessionVault {
  vaultId: string;
  modes: ("read" | "write")[];
}

/** The signed-in principal's own vault, when it has one. */
export interface LwsVaultInfo {
  /** The vault entity URI. */
  entity: string;
  /** The opaque id vault paths are keyed on. */
  id: string;
  /** The vault's chosen name. */
  name: string;
  /** The short WebID alias, when the vault has one. */
  shortWebId?: string;
}

/** The session as the client reads it: who is signed in, their own vault, and every vault they reach. */
export interface LwsSession {
  principal: string;
  vault: LwsVaultInfo | null;
  vaults: LwsSessionVault[];
}

/**
 * What an app supplies once, with {@link setLwsAuth}. One member per call the client makes. Every header-forming member
 * is called only for a URL the platform may send a credential to.
 */
export interface LwsAuthHost {
  /** The credential headers for one request to `url`, keys `authorization` (and `dpop` when the credential carries a proof). */
  bearerHeaderFor(url: string, method?: string): Promise<Record<string, string>>;
  /** The sender-constrained headers for a read; a fresh proof on every call. */
  dpopReadAuth(method: string, url: string): Promise<Record<string, string>>;
  /** The sender-constrained headers for a write; a fresh proof on every call. */
  dpopWriteAuth(method: string, url: string): Promise<Record<string, string>>;
  /** Drops the held token so the next use signs in again (called on a 401). */
  invalidateDpop(): void;
  /** The held session. `getSession` signs in when no token is held; `invalidate` drops the token. */
  tokenManager: {
    getSession(): Promise<LwsSession>;
    invalidate(): void;
  };
}

let host: LwsAuthHost | null = null;

/** Sets the host once at start-up. Calling it again replaces the host (one seam per app). */
export function setLwsAuth(next: LwsAuthHost): void {
  host = next;
}

/** Test seam: forgets the host, so the next call throws as before the first {@link setLwsAuth}. */
export function resetLwsAuth(): void {
  host = null;
}

function current(): LwsAuthHost {
  if (host === null) throw new Error("lws-session-bridge: call setLwsAuth(<host>) once at start-up, before any request is signed");
  return host;
}

/**
 * The credential headers for ONE request to `url`, or `{}` when `url` may not receive this app's credential
 * (`credentialAllowedAt`: a host outside the platform's family). Every credential header this client sends is formed through
 * this call or the two below, so the rule is asked every time.
 *
 * @param url the URL the request is sent to
 * @param method the HTTP method of the request. Optional, `GET` when omitted. The app's call took the URL alone, because a
 *   bearer token does not name the method; a DPoP proof does, so a host that signs with a proof (the default one does)
 *   needs it for a PATCH, DELETE, PUT or POST. A caller that omits it gets a proof for a GET.
 */
export async function bearerHeaderFor(url: string, method?: string): Promise<Record<string, string>> {
  const h = current();
  if (!credentialAllowedAt(url)) return {};
  return method === undefined ? h.bearerHeaderFor(url) : h.bearerHeaderFor(url, method);
}

/** The sender-constrained headers for a read of `url`, or `{}` for a URL outside the platform. A fresh proof on every call. */
export async function dpopReadAuth(method: string, url: string): Promise<Record<string, string>> {
  const h = current();
  if (!credentialAllowedAt(url)) return {};
  return h.dpopReadAuth(method, url);
}

/** The sender-constrained headers for a write to `url`, or `{}` for a URL outside the platform. A fresh proof on every call. */
export async function dpopWriteAuth(method: string, url: string): Promise<Record<string, string>> {
  const h = current();
  if (!credentialAllowedAt(url)) return {};
  return h.dpopWriteAuth(method, url);
}

/** Drops the held token so the next use signs in again (called when a request answers 401). */
export function invalidateDpop(): void {
  current().invalidateDpop();
}

/** The held session. Its members delegate to the host set with {@link setLwsAuth}. */
export const tokenManager = {
  /** The live session, signing in when no token is held. Throws `NotSignedInError` when there is no sign-in. */
  getSession(): Promise<LwsSession> {
    return current().tokenManager.getSession();
  },
  /** Drops the held token so the next use signs in again. */
  invalidate(): void {
    current().tokenManager.invalidate();
  },
};

/**
 * How long, in milliseconds, a caller waits for the session before a write (the app's bound for a sign-in or a proof). A fixed
 * number here: the bridge applies no bound itself, it only tells the caller how long to wait.
 */
export function dpopBoundMs(): number {
  return 10_000;
}
