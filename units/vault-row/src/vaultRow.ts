/**
 * Which row is this vault id, and which vault does a session start in.
 *
 * Neither function reorders the list. Neither function asks the server.
 */

/**
 * The row whose `vaultId` is exactly `vaultId`, or null.
 *
 * A blank id is null. A missing list is null. There is no first-row
 * fallback. The id is not trimmed: `" seat "` does not match `"seat"`.
 * The first exact match wins. This does not look at an entity address.
 * Pass the vault id, not the entity URI.
 */
export function vaultById<T extends { vaultId: string }>(
  vaults: readonly T[] | null | undefined,
  vaultId: string | null | undefined,
): T | null {
  if (!vaultId || !vaults) return null;
  return vaults.find((row) => row.vaultId === vaultId) ?? null;
}

/**
 * The vault a session starts in.
 *
 * The first row whose `isLandingVault` is truthy, otherwise the first row,
 * otherwise null. An empty list is null. A missing list is null.
 *
 * A landing row with `vaultId: ""` returns `""`. Empty is not turned into
 * null. `??` only replaces null and undefined.
 *
 * This is not the writable default. A row that cannot be written can still
 * be the start. Do not skip it here. The write choice is `vault-list`.
 */
export function landingVaultId(
  vaults: readonly { vaultId: string; isLandingVault?: boolean }[] | null | undefined,
): string | null {
  if (!vaults) return null;
  const landing = vaults.find((row) => row.isLandingVault);
  return landing?.vaultId ?? vaults[0]?.vaultId ?? null;
}
