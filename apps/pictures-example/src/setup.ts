import { setBaseOrigin, setLocalRigHosts, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setPictureQueueLimit } from "@kaigilb/gilbplatformcode-signed-picture";
import { setQueueDbName } from "@kaigilb/gilbplatformcode-save-queue";

export const QUEUE_DB_NAME = "pictures-example";
export const PICTURE_FOLDER = "pictures";

/** Where sign-in, create-named and the vault list go. Not the units' base origin. */
export const ID_ORIGIN = "https://id.gilb.com";

/**
 * The platform's apex: the units' base origin in live mode.
 *
 * Measured 2026-11-08: with the base origin at https://id.gilb.com, vaultOriginOf of a vault at
 * https://<name>.gilb.com answered id.gilb.com. That host relays reads and refuses vault writes
 * (403, no write reach). With the apex https://gilb.com, vaultOriginOf returns the vault's own
 * origin. Sign-in, create-named and the vault list stay at ID_ORIGIN.
 */
export const PLATFORM_ORIGIN = "https://gilb.com";

let identity: string | null = null;

/** The identity origin set at start-up. Sign-in, create-named and the vault list use it. */
export function identityOrigin(): string {
  if (!identity) throw new Error("identity origin not configured: call configureApp first");
  return identity;
}

/**
 * Once at start-up, before any unit call. `platformOrigin` is the apex live and the page origin in the fake.
 * `idOrigin` defaults to ID_ORIGIN only for that apex; otherwise it is the same origin (the fake serves every route).
 */
export function configureApp(platformOrigin: string, localRigHosts: string[] = [], idOrigin: string = platformOrigin === PLATFORM_ORIGIN ? ID_ORIGIN : platformOrigin): void {
  setBaseOrigin(platformOrigin);
  identity = idOrigin;
  setSystemVaultHosts([]);
  if (localRigHosts.length) setLocalRigHosts(localRigHosts);
  setQueueDbName(QUEUE_DB_NAME);
  setPictureQueueLimit(6);
}

/** A short stable text for a principal, used in the per-person device cache name. */
export function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function deviceCacheName(principal: string): string {
  return `pictures-example:${shortHash(principal)}`;
}
