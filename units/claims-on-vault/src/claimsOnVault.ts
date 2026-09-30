/**
 * Claims that belong on one seat vault.
 * A blank seat returns every claim, as a new array. Claim objects are not copied.
 */

export function claimsOnVault<T extends { vaultId?: string }>(
  claims: readonly T[],
  vaultId: string | null | undefined,
): T[] {
  const seat = vaultId?.trim();
  if (!seat) return [...claims];
  return claims.filter((claim) => !claim.vaultId || claim.vaultId === seat);
}
