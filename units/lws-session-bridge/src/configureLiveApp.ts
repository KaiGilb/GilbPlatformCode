// `configureLiveApp`: the start-up every live app repeated. It sets the platform's base origin and the system-vault hosts,
// builds the session credential, and sets it as the auth seam. The two origins are the app's: this unit holds no host.

import {
  setBaseOrigin,
  setLocalRigHosts,
  setSystemVaultHosts,
} from "@kaigilb/gilbplatformcode-base-origin";
import { SessionCredential, type SessionCredentialOptions } from "@kaigilb/gilbplatformcode-signin/session";
import { lwsAuthFromSession } from "./fromSession";
import { setLwsAuth } from "./lwsAuth";

/** What an app tells {@link configureLiveApp}. */
export interface LiveAppConfig {
  /** The platform's origin (the base origin every platform path is joined to), no trailing slash. */
  platformOrigin: string;
  /** The identity host's origin, where the person signs in. It is returned unchanged, for the sign-in calls. */
  idOrigin: string;
  /** System-vault host names (the platform's own vaults). Default: none, `[]`. */
  systemVaultHosts?: string[];
  /** Local-rig host names, set only when given. */
  localRigHosts?: string[];
  /** Options of the session credential made here (storage, transport, renewal). */
  credentialOptions?: SessionCredentialOptions;
}

/** What {@link configureLiveApp} made. */
export interface LiveApp {
  /** The credential the app signs in with and signs every call with. */
  credential: SessionCredential;
  idOrigin: string;
  platformOrigin: string;
}

/**
 * Sets up a live app in one call: `setBaseOrigin(platformOrigin)`, `setSystemVaultHosts(systemVaultHosts ?? [])`,
 * `setLocalRigHosts(localRigHosts)` when given, a new `SessionCredential(credentialOptions)`, then
 * `setLwsAuth(lwsAuthFromSession(credential))`. Call it once, before any request is signed. A second call replaces the first.
 *
 * @param c the origins (the app's own constants) and optional hosts and credential options
 * @returns the credential and the two origins
 * @throws Error when `platformOrigin` or `idOrigin` is empty
 */
export function configureLiveApp(c: LiveAppConfig): LiveApp {
  if (!c.platformOrigin) throw new Error("configureLiveApp: platformOrigin is required");
  if (!c.idOrigin) throw new Error("configureLiveApp: idOrigin is required");
  setBaseOrigin(c.platformOrigin);
  setSystemVaultHosts(c.systemVaultHosts ?? []);
  if (c.localRigHosts) setLocalRigHosts(c.localRigHosts);
  const credential = new SessionCredential(c.credentialOptions);
  setLwsAuth(lwsAuthFromSession(credential));
  return { credential, idOrigin: c.idOrigin, platformOrigin: c.platformOrigin };
}
