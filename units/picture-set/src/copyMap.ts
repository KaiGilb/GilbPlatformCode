import { entityIdTail } from "@kaigilb/gilbplatformcode-photo-ref";
import { buildCopyMap, pickBySize, type PictureCopy } from "./copies";
import { listVaultFiles, type Send, type VaultFile } from "./files";

/** file id tail -> every stored copy of that picture, smallest first: what `buildCopyMap` answers, read-only. */
export type CopyMap = ReadonlyMap<string, PictureCopy[]>;

const rowOf = (f: VaultFile) => ({
  entityUri: f.entity,
  body: { fileByteSize: f.byteSize ?? undefined, ...(f.transcodedFrom ? { transcodedFrom: f.transcodedFrom } : {}) } as Record<string, unknown>,
});

/**
 * The vault's files, listed ONCE, as a copy map (`listVaultFiles` into `buildCopyMap`).
 * Never throws: a listing that fails writes one `console.warn` and answers an empty map, so a row then loads the master itself.
 *
 * @param vaultRoot the vault's id as `GET /lws/vaults` gives it (read it from the list, never compose it)
 * @param o `origin` serves the vault; `send` is the host's signed sender (`signedSend()` of `lws-session-bridge`)
 */
export async function loadCopyMap(vaultRoot: string, o: { origin: string; send: Send }): Promise<CopyMap> {
  try {
    const files = await listVaultFiles(vaultRoot, { origin: o.origin, send: o.send });
    return buildCopyMap(files.map(rowOf));
  } catch (e) {
    console.warn("The vault's picture files could not be listed.", e);
    return new Map();
  }
}

/** Every stored copy of a picture, the master included (as the map holds it), smallest first; `[]` for a master the map does not know. */
function groupOf(m: CopyMap, master: string): PictureCopy[] {
  return m.get(entityIdTail(master)) ?? [];
}

/**
 * Every stored copy of `master` except the master itself (its small copy, its full copy), smallest first; `[]` when none is listed.
 * Ids meet by their tail, so `/base/e/` and `/vault/e/` spellings are the same file.
 */
export const copiesOf = (m: CopyMap, master: string): PictureCopy[] => {
  const self = entityIdTail(master);
  return groupOf(m, master).filter((c) => entityIdTail(c.uri) !== self);
};

/**
 * The stored thumbnail of a master: its smallest copy, or the master itself when it has no other.
 * Null while the files are not listed yet (`m` is null), so a caller can tell "not known" from "none".
 */
export const thumbUriOf = (m: CopyMap | null, master: string): string | null => {
  if (!m) return null;
  return pickBySize(groupOf(m, master), 0)?.uri ?? master;
};

/** The largest stored copy of a master (for full screen); the master itself when none is listed or `m` is null. */
export const largestUriOf = (m: CopyMap | null, master: string): string => (m && pickBySize(groupOf(m, master), Infinity)?.uri) || master;

/**
 * The addresses of the copies to end together with `master` (every copy except the master), to give to `endPictureFiles`.
 * With `map` it reads the map: no request. Without it, it lists the copies by the route's `transcodedFrom` filter, the master's and then each
 * copy's own (a whole-vault listing is never made), and needs `vaultRoot`. The listing cannot find a full copy that the master itself points
 * to (the root shape): a caller that stores a full copy passes the map.
 *
 * @throws Error when neither `map` nor `vaultRoot` is given; a `PictureFilesError` when a listing is refused
 */
export async function copiesToEnd(
  master: string,
  o: { origin: string; send: Send; map?: CopyMap; vaultRoot?: string },
): Promise<string[]> {
  if (o.map) return copiesOf(o.map, master).map((c) => c.uri);
  if (!o.vaultRoot) throw new Error("copiesToEnd needs a copy map or the vault's root (vaultRoot) to list the copies.");
  const self = entityIdTail(master);
  const seen = new Map<string, string>();
  let level = [master];
  for (let step = 0; step < 2 && level.length > 0; step++) {
    const next: string[] = [];
    for (const parent of level) {
      const files = await listVaultFiles(o.vaultRoot, { origin: o.origin, send: o.send, transcodedFrom: parent });
      for (const f of files) {
        const t = entityIdTail(f.entity);
        if (!t || t === self || seen.has(t)) continue;
        seen.set(t, f.entity);
        next.push(f.entity);
      }
    }
    level = next;
  }
  return [...seen.values()];
}
