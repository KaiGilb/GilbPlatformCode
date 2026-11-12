import { disablePictureDeviceCache, enablePictureDeviceCache, forgetPictures } from "./pictureUrl";
import { setPictureQueueLimit } from "./pictureQueue";

/** Hash 1 of the principal (djb2, xor form), 32 bits. */
function djb2(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h;
}

/** Hash 2 of the principal (FNV-1a), 32 bits. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * The Cache Storage name of one person's pictures on a device: `<prefix>:<64-bit hash of the principal>`. The same principal always gets the
 * same name; two principals get two names, so one person's pictures are never served to another who signs in on the same device. The
 * principal itself is not written into the name.
 *
 * @param prefix the app's own name for its cache, e.g. `"picturerecords"`
 * @param principal who is signed in (the session's `principal`)
 */
export function deviceCacheNameFor(prefix: string, principal: string): string {
  return `${prefix}:${djb2(principal).toString(36)}${fnv1a(principal).toString(36)}`;
}

/**
 * Starts the picture session for one signed-in person: sets how many picture fetches run at once and turns on that person's device cache.
 * Call it when the person signs in. The function it answers is the sign-out step: it frees every picture URL, deletes the device cache, and
 * turns the cache off.
 *
 * @param o `principal` (required, non-empty); `deviceCachePrefix` (the app's cache name); `queueLimit` (default 6; a whole number of at least 1)
 * @returns `stop`, to call at sign-out; safe to call more than once
 * @throws Error when `principal` is empty; RangeError when `queueLimit` is not a whole number of at least 1 (nothing is changed then)
 */
export function startPictureSession(o: { principal: string; deviceCachePrefix: string; queueLimit?: number }): () => Promise<void> {
  if (!o.principal) throw new Error("startPictureSession needs the signed-in principal: the device cache is per person.");
  setPictureQueueLimit(o.queueLimit ?? 6);
  enablePictureDeviceCache({ name: deviceCacheNameFor(o.deviceCachePrefix, o.principal) });
  return async () => {
    forgetPictures({ device: true });
    disablePictureDeviceCache();
  };
}
