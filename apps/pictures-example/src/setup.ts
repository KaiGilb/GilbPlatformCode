import { setBaseOrigin, setLocalRigHosts, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setPictureQueueLimit } from "@kaigilb/gilbplatformcode-signed-picture";
import { setQueueDbName } from "@kaigilb/gilbplatformcode-save-queue";

export const QUEUE_DB_NAME = "pictures-example";
export const PICTURE_FOLDER = "pictures";

/** Once at start-up, before any unit call. */
export function configureApp(platformOrigin: string, localRigHosts: string[] = []): void {
  setBaseOrigin(platformOrigin);
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
