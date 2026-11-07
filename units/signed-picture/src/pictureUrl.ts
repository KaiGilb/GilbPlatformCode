import { dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { entityIdTail, fileIdFromPhotoRef } from "@kaigilb/gilbplatformcode-photo-ref";

const cache = new Map<string, Promise<string>>();

export interface PictureDeviceCacheOptions {
  /** The name of the Cache Storage cache. Make it per person, so a second person on this browser never sees the first one's pictures. */
  name: string;
}
export interface ForgetPicturesOptions {
  /** Also delete the device cache (Cache Storage) that `enablePictureDeviceCache` named. */
  device?: boolean;
}

let deviceName: string | null = null;

function deviceStorage(): CacheStorage | null {
  const c = (globalThis as { caches?: CacheStorage }).caches;
  return deviceName !== null && c ? c : null;
}

function warnStorage(e: unknown): void {
  console.warn("The picture device cache could not be used; the picture is fetched without it.", e);
}

/** Keeps fetched pictures in Cache Storage under `options.name`, so a later visit needs no network call. Off until called; a no-op where there is no `caches`. */
export function enablePictureDeviceCache(options: PictureDeviceCacheOptions): void {
  deviceName = options.name;
}

/** Stops using the device cache. The stored pictures stay; use `forgetPictures({ device: true })` to delete them. */
export function disablePictureDeviceCache(): void {
  deviceName = null;
}

/** The picture as an object URL, fetched once per file and kept until `forgetPictures()`. */
export function pictureObjectUrl(fileEntityUri: string, vaultOrigin: string): Promise<string> {
  const hit = cache.get(fileEntityUri);
  if (hit) return hit;
  const pending = (async () => {
    const id = fileIdFromPhotoRef(fileEntityUri) ?? entityIdTail(fileEntityUri);
    if (!id) throw new Error("This picture has no file address.");
    const url = `${vaultOrigin}/files/${encodeURIComponent(id)}`;
    const storage = deviceStorage();
    let device: Cache | null = null;
    if (storage) {
      try {
        device = await storage.open(deviceName!);
        const stored = await device.match(url);
        if (stored) return URL.createObjectURL(await stored.blob());
      } catch (e) {
        warnStorage(e);
        device = null;
      }
    }
    const res = await fetch(url, { method: "GET", headers: await dpopReadAuth("GET", url), credentials: "omit" });
    if (!res.ok) throw new Error(`The picture could not be read (HTTP ${res.status}).`);
    if (device) {
      try {
        await device.put(url, res.clone());
      } catch (e) {
        warnStorage(e);
      }
    }
    return URL.createObjectURL(await res.blob());
  })();
  cache.set(fileEntityUri, pending);
  pending.catch(() => {
    if (cache.get(fileEntityUri) === pending) cache.delete(fileEntityUri);
  });
  return pending;
}

/** Frees every picture URL. Call on sign-out. With `{ device: true }` it also deletes the device cache. */
export function forgetPictures(options?: ForgetPicturesOptions): void {
  for (const p of cache.values()) void p.then((u) => URL.revokeObjectURL(u), () => undefined);
  cache.clear();
  if (options?.device === true) {
    const storage = deviceStorage();
    if (storage) void storage.delete(deviceName!).catch(warnStorage);
  }
}
