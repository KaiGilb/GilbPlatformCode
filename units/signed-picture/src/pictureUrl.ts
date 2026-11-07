import { dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { entityIdTail, fileIdFromPhotoRef } from "@kaigilb/gilbplatformcode-photo-ref";

const cache = new Map<string, Promise<string>>();

/** The picture as an object URL, fetched once per file and kept until `forgetPictures()`. */
export function pictureObjectUrl(fileEntityUri: string, vaultOrigin: string): Promise<string> {
  const hit = cache.get(fileEntityUri);
  if (hit) return hit;
  const pending = (async () => {
    const id = fileIdFromPhotoRef(fileEntityUri) ?? entityIdTail(fileEntityUri);
    if (!id) throw new Error("This picture has no file address.");
    const url = `${vaultOrigin}/files/${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: "GET", headers: await dpopReadAuth("GET", url), credentials: "omit" });
    if (!res.ok) throw new Error(`The picture could not be read (HTTP ${res.status}).`);
    return URL.createObjectURL(await res.blob());
  })();
  cache.set(fileEntityUri, pending);
  pending.catch(() => {
    if (cache.get(fileEntityUri) === pending) cache.delete(fileEntityUri);
  });
  return pending;
}

/** Frees every picture URL. Call on sign-out. */
export function forgetPictures(): void {
  for (const p of cache.values()) void p.then((u) => URL.revokeObjectURL(u), () => undefined);
  cache.clear();
}
