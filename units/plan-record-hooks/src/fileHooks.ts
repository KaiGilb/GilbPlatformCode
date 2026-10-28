// The file sets of one or more vaults, merged, each row tagged with the vault it was listed from.
// Taken from the app's file-hooks file: `useVaultFilesMulti` and what it reaches.

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { listVaultFiles, type FileLifecycle } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/** A file as the VAULT describes it — the shape every file view renders.
 *
 * Deliberately NOT `workingSet.FileRef`: that type is the device-local index row, and a
 * view typed against it is a view that can be fed device-local data by mistake. This one
 * can only be produced by {@link hydrateVaultFiles}, i.e. by a vault answer. */
export interface VaultFile {
  /** The file ENTITY id — the handle for `GET`/`DELETE /files/<id>`. */
  id: string;
  /**
   * The VAULT'S OWN framed entity URI for this file (`VaultFileRef.entityUri`), carried through
   * rather than dropped. Any write that names this file as a relation member MUST use this
   * and never compose `<vaultNamespace>/e/<id>`: host is IDENTITY, not location
   * and some vaults frame entities under `OWNER_HOST` while the
   * namespace is the person's — composing there writes a DIFFERENT identity into an
   * append-only store. Same reason `BaseRecord.entityUri` exists.
   */
  entityUri: string;
  /** The record this file is stored WITH (that record's framed `@id` from F-OPEN), or null
   * for a standalone registered file. The vault's own `a:fileStoredWith`. ⛔ Not a composed
   * `baseHost()` entity URI. */
  storedWith: string | null;
  /** The stored display name; "Untitled file" only when the vault holds no `a:fileName`. */
  name: string;
  mediaType: string;
  /** BaseVeda type (`t:File`, `t:TypePicture`, …). MIME stays in mediaType. */
  typeUri: string | null;
  byteSize: number;
  /** The vault's own last-write time (epoch ms) — the recency order, so it reads the same
   * in any browser. */
  updatedAt: number;
  /** True when the vault marks this file ENDED (it is in the trashcan). */
  ended: boolean;
}

/** The shared prefix of every vault-file-set key — the ONE spelling (A2). */
export const VAULT_FILES_KEY_ROOT = ["base", "files", "pod"] as const;

/** The vault-file-set query key. Keyed by lifecycle so `live` and `ended` are separate
 * cache entries that can never be mistaken for one another. */
export function vaultFilesKey(vaultId: string, lifecycle: FileLifecycle) {
  return [...VAULT_FILES_KEY_ROOT, vaultId, lifecycle] as const;
}

/** Maps the vault's file-set answer to the render shape. The vault's own recency order is
 * preserved by sorting on ITS `updatedAt`, never on when this device saw the file. */
async function hydrateVaultFiles(vaultId: string, lifecycle: FileLifecycle): Promise<VaultFile[]> {
  const refs = await listVaultFiles(vaultId, lifecycle);
  return refs
    .map(
      (f): VaultFile => ({
        id: f.id,
        entityUri: f.entityUri,
        storedWith: f.storedWith,
        // The vault holding no a:fileName is a real state and gets a real label — it is not
        // an error, and it must not render as an empty row.
        name: f.name ?? "Untitled file",
        mediaType: f.mediaType ?? "application/octet-stream",
        typeUri: f.typeUri ?? "t:File",
        byteSize: f.byteSize ?? 0,
        updatedAt: f.updatedAt,
        ended: f.ended,
      }),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A file row attributed to the vault namespace it was listed from (multi-vault working set). */
export type VaultFileWithSource = VaultFile & { sourceVaultId: string };

/**
 * File sets for one or more vaults, merged, each row tagged with `sourceVaultId`.
 * Used by Files (and Nodes file rows) when the Vault facet selects several vaults or
 * "show children" expands a parent to its descendants.
 */
export function useVaultFilesMulti(
  vaultIds: readonly string[],
  lifecycle: FileLifecycle = "live",
): {
  data: VaultFileWithSource[];
  isPending: boolean;
  error: Error | null;
} {
  // Stable key order for useQueries — callers pass de-duped contentVaultIds.
  const ids = vaultIds;
  const queries = useQueries({
    queries: ids.map((vaultId) => ({
      queryKey: vaultFilesKey(vaultId, lifecycle),
      queryFn: () => hydrateVaultFiles(vaultId, lifecycle),
      enabled: !!vaultId,
      staleTime: 5_000,
    })),
  });
  const data = useMemo(() => {
    const out: VaultFileWithSource[] = [];
    for (let i = 0; i < ids.length; i++) {
      const vaultId = ids[i]!;
      for (const f of queries[i]?.data ?? []) {
        out.push({ ...f, sourceVaultId: vaultId });
      }
    }
    // Recency across vaults — same order the single-vault list used.
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }, [queries, ids]);
  const isPending = ids.length > 0 && queries.some((q) => q.isPending);
  const error = queries.find((q) => q.error)?.error ?? null;
  return { data, isPending, error: error instanceof Error ? error : error ? new Error(String(error)) : null };
}
