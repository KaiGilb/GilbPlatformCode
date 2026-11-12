import { signedSend } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { endPictureFiles, loadCopyMap, storePictureSet, type CopyMap, type Send, type StoredPicture } from "@kaigilb/gilbplatformcode-picture-set";
import type { PreparedPicture } from "./types";

export interface VaultPictures {
  /** The vault's files, listed once, as a copy map (never throws: a failed listing is an empty map). */
  loadCopies(): Promise<CopyMap>;
  /** Stores the screen copy as the master and the small copy, linked; the small copy's link is tried once more. */
  upload(p: PreparedPicture): Promise<StoredPicture>;
  /** Ends the master and its copies; answers the addresses that could NOT be ended ([] when all were). */
  endFiles(master: string, copies: readonly string[]): Promise<string[]>;
}

/**
 * Binds picture-set's `loadCopyMap`, `storePictureSet` and `endPictureFiles` to one vault. Nothing more.
 *
 * @param c.vaultOrigin the origin that serves the vault; `vaultRoot` its id as the vault list gives it; `folder` where pictures are stored
 * @param c.send the signed sender; defaults to lws-session-bridge's `signedSend()`
 */
export function createVaultPictures(c: { vaultOrigin: string; vaultRoot: string; folder: string; send?: Send }): VaultPictures {
  const send: Send = c.send ?? signedSend();
  const target = { vaultOrigin: c.vaultOrigin, vaultRoot: c.vaultRoot, folder: c.folder };
  return {
    loadCopies: () => loadCopyMap(c.vaultRoot, { origin: c.vaultOrigin, send }),
    upload: (p) => storePictureSet({ screen: p.screen, thumb: p.thumb }, target),
    endFiles: async (master, copies) => (await endPictureFiles(master, copies, { origin: c.vaultOrigin, send })).map((f) => f.entity),
  };
}
