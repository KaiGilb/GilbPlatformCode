import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";

/** True when the principal holds the write mode on this vault. Asks the SET; never derives
 * write from a rank, a name, or the vault's position in the list. */
export function canWriteVault(vault: ReachableVault): boolean {
  return vault.modes.includes("write");
}
