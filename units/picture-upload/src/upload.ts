import { dpopWriteAuth, NotSignedInError, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { serverReasonOrNull } from "@kaigilb/gilbplatformcode-lws-records";
import { NoAccessError, VaultBusyError, refusalLine, type RefusalDetail } from "@kaigilb/gilbplatformcode-refusal-detail";

/** The vault answered an upload with a status that is not a success, not 401, not 403 and not 502/503/504. Keeps the status and the first 2000 characters of what the vault said. */
export class PictureUploadError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`The picture could not be saved (HTTP ${status}).`);
    this.name = "PictureUploadError";
    this.status = status;
    this.body = body.slice(0, 2000);
  }
}

/** Where to put the picture: the vault's origin, its root (read from the vault list, never composed) and the folder the file goes in. */
export type UploadTarget = { vaultOrigin: string; vaultRoot: string; folder: string };

/** The upload address: `PUT <origin>/lws/vault/<encoded root>/files?name=…&folder=<encoded folder>`. */
export function uploadUrl(filename: string, target: UploadTarget): string {
  return `${target.vaultOrigin}/lws/vault/${encodeURIComponent(target.vaultRoot)}/files?name=${encodeURIComponent(filename)}&folder=${encodeURIComponent(target.folder)}`;
}

/** Sends the picture's bytes to the vault and answers the file entity URI. 201 (new) and 200 (identical re-upload) are both fine. */
export async function uploadPicture(blob: Blob, filename: string, target: UploadTarget): Promise<string> {
  const url = uploadUrl(filename, target);
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...(await dpopWriteAuth("PUT", url)), "content-type": "image/jpeg" },
    body: blob,
    credentials: "omit",
    // No keepalive: Chrome refuses a keepalive body over 64 KiB.
  });
  if (res.status === 401) {
    invalidateDpop();
    throw new NotSignedInError();
  }
  if (res.status !== 200 && res.status !== 201) {
    const text = await res.text().catch(() => "");
    if (res.status === 403) {
      const sentence = serverReasonOrNull(text);
      throw new NoAccessError(sentence, { method: "PUT", path: new URL(url).pathname, status: 403, sentence });
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      console.warn(`${refusalLine({ method: "PUT", path: new URL(url).pathname, status: res.status, sentence: serverReasonOrNull(text) })} | body: ${text.slice(0, 300)}`);
      throw new VaultBusyError(res.status, `The picture could not be saved (HTTP ${res.status}).`);
    }
    throw new PictureUploadError(res.status, text);
  }
  const ack = (await res.json()) as { entity?: unknown };
  if (typeof ack.entity !== "string" || ack.entity === "") throw new Error("The vault did not name the saved picture.");
  return ack.entity;
}
