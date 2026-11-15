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

/** The part of record-picture's `vaultPictureService` the session uses. Declared here so signed-picture needs no new peer. */
export interface PictureSessionService<M> {
  fresh(vaultRoot: string): void;
  copies(vaultRoot: string): Promise<M>;
  forget(vaultRoot?: string): void;
}

export interface PictureSessionOptions<M> {
  deviceCachePrefix: string;
  queueLimit?: number;
  /** record-picture's `vaultPictureService(...)`, or anything shaped like it. */
  service: PictureSessionService<M>;
  /** The vault whose copy map `refresh` lists. */
  vaultId: string;
  /** Gets the copy map each `refresh` lists, only while the session is still the current one (an answer that arrives after a stop or a switch is dropped). */
  onCopies(map: M): void;
}

export interface PictureSession {
  /**
   * Makes `principal` the person of the session: the same principal is a no-op; another principal first ends the old person's session
   * (URLs, device cache, the service's maps), then starts the new one and refreshes the copy map. `null` or "" ends the session (sign-out).
   */
  setPrincipal(principal: string | null): Promise<void>;
  /** Lists the vault's copy map again (a changed picture) and hands it to `onCopies`; does nothing without a person or after `stop`. */
  refresh(): Promise<void>;
  /** Sign-out: ends the person's session as `setPrincipal(null)` does, and later answers are dropped. Safe to call twice. */
  stop(): Promise<void>;
}

/**
 * The per-principal picture session an app otherwise wires by hand: `startPictureSession` for the person, the copy map listed again on demand,
 * and everything forgotten (picture URLs, the person's device cache, the service's maps and tracked previews) when the person changes or signs
 * out. One person's pictures are never served to the next.
 */
export function createPictureSession<M>(o: PictureSessionOptions<M>): PictureSession {
  let current: string | null = null;
  let stopCurrent: (() => Promise<void>) | null = null;
  let epoch = 0;

  const end = async (): Promise<void> => {
    epoch++;
    const stop = stopCurrent;
    current = null;
    stopCurrent = null;
    if (stop) {
      await stop();
      o.service.forget();
    }
  };
  const refresh = async (): Promise<void> => {
    if (current === null) return;
    const mine = epoch;
    o.service.fresh(o.vaultId);
    const map = await o.service.copies(o.vaultId);
    if (mine === epoch) o.onCopies(map);
  };
  return {
    async setPrincipal(principal) {
      if (!principal) return end();
      if (principal === current) return;
      const ending = end();
      const ticket = epoch;
      await ending;
      if (ticket !== epoch) return; // a stop or another person came while the old session was ending
      stopCurrent = startPictureSession({ principal, deviceCachePrefix: o.deviceCachePrefix, ...(o.queueLimit !== undefined ? { queueLimit: o.queueLimit } : {}) });
      current = principal;
      await refresh();
    },
    refresh,
    stop: end,
  };
}
