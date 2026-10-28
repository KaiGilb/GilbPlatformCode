// The signed-in person's OWN vault, from what the shell holds. A vault's id is what the reachable set carries, so it is read from there, in the
// order the shell trusts: the session vault's own row, else the vault the platform flags as the landing vault, else the root of the session vault's entity.
// ⛔ Never `vaults[0]`, never a name.

import { vaultRootOf } from "./vaultRoot";

export function ownVaultIdOf(args: {
  /** `contentScope.reach`: the session vault's row in the reachable set. */
  reach: { vaultId: string } | null | undefined;
  vaults: readonly { vaultId: string; isLandingVault: boolean }[] | null | undefined;
  /** `session.vault.entity`. */
  sessionVaultEntity: string | null | undefined;
}): string | null {
  if (args.reach?.vaultId) return args.reach.vaultId;
  const landing = (args.vaults ?? []).find((v) => v.isLandingVault);
  if (landing?.vaultId) return landing.vaultId;
  return args.sessionVaultEntity ? vaultRootOf(args.sessionVaultEntity) : null;
}
