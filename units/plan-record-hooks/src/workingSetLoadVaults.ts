// Which vaults a person holds: every reachable vault they can read, once each, in the order given.
// Taken from the app's load-vaults file: `heldVaultIds`.

import { canReadVault, type ReachableVault } from "./reachableVault";

/**
 * every vault the person HOLDS, in the order `GET /lws/vaults` gave them.
 * "Holds" is the read mode on the vault's own mode set (`canReadVault`). A vault reached for
 * write only is left out: its list would answer 403, and the scope must not ask a vault the
 * viewer cannot read. ⛔ Nothing is derived from a vault's name or host.
 */
export function heldVaultIds(vaults: readonly ReachableVault[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of vaults) {
    if (!canReadVault(v) || seen.has(v.vaultId)) continue;
    seen.add(v.vaultId);
    out.push(v.vaultId);
  }
  return out;
}
