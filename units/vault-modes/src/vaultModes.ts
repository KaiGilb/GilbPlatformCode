/**
 * The two modes this app reasons about, taken from a wire list that may
 * contain more.
 *
 * `append` and `control` are dropped. They are not a reach grade here.
 * Nothing is trimmed and nothing is folded. `Read` is not `read`.
 *
 * This is not vault-list's `canWriteVault` / `canReadVault`. Those ask
 * whether a mode is in a set the host already holds. This function is the
 * step that builds that set. Do not drop `append` inside the question.
 */

export type VaultMode = "read" | "write";

export interface SessionVaultRow {
  vaultId: string;
  modes: VaultMode[];
}

/**
 * `read` and `write`, in the order they first appear. Later copies are dropped.
 * Any other string is dropped, including `append`, `control`, `Read`, and ` read`.
 * A missing list and a null list are both an empty list.
 */
export function narrowVaultModes(modes: readonly string[] | null | undefined): VaultMode[] {
  const out: VaultMode[] = [];
  for (const m of modes ?? []) {
    if (m === "read" && !out.includes("read")) out.push("read");
    if (m === "write" && !out.includes("write")) out.push("write");
  }
  return out;
}

/**
 * The lean rows a session listed.
 *
 * A row with no `vaultId` is skipped. The check is falsy, not a trim: `""` is
 * skipped and `"  "` is kept. The comment in the app names `podId`. The code
 * reads `vaultId`. Do not rename the check.
 *
 * Modes on each kept row go through {@link narrowVaultModes}. Other fields on
 * the wire object are not copied. Order is kept. The same id twice is two rows.
 * A missing list and a null list are both an empty list.
 *
 * A null entry inside the list throws. This function does not skip it.
 */
export function readSessionVaults(
  vaults:
    | readonly { vaultId?: string | null; modes?: readonly string[] | null }[]
    | null
    | undefined,
): SessionVaultRow[] {
  const out: SessionVaultRow[] = [];
  for (const p of vaults ?? []) {
    if (!p.vaultId) continue;
    out.push({ vaultId: p.vaultId, modes: narrowVaultModes(p.modes) });
  }
  return out;
}
