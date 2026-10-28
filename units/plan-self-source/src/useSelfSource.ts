// The signed-in person as the source of what they write: their own stakeholder card.
// The finding is the own-card finding (hard identity only: the derived card or the record the vault's profile pointer names). It is read once per
// session, so a Plan line asks for nothing of its own.
// ⛔ Never the email, the display name, or a decoded token.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingQuery } from "./ownCardFinding";
import { ownVaultIdOf } from "./ownVault";

/** What the hook reads of the app's shell: the reachable vaults, the session vault's row among them, and the session vault's entity. */
export type SelfSourceShell = {
  vaults?: readonly ReachableVault[] | null;
  contentScope?: { reach?: { vaultId: string } | null } | null;
  session?: { vault?: { entity?: string | null } | null } | null;
};

/** A link to the person's own card, as it is stored under `a:statedBy`. */
export type SelfSource = { "@id": string };

/**
 * The person's own card as a source, or null when it is not known (no landing vault, still being found,
 * no card, or the read failed). Null means: write the value with no source, and say nothing about it.
 */
export function useSelfSource(shell: SelfSourceShell): SelfSource | null {
  const vaults = shell.vaults ?? [];
  const ownVaultId = ownVaultIdOf({
    reach: shell.contentScope?.reach,
    vaults,
    sessionVaultEntity: shell.session?.vault?.entity ?? null,
  });
  const landing = vaults.find((v) => v.isLandingVault) ?? (ownVaultId ? (vaults.find((v) => v.vaultId === ownVaultId) ?? null) : null);
  const finding = useQuery({ ...ownCardFindingQuery(landing) });
  const uri = finding.data?.cardUri ?? null;
  return useMemo(() => (uri ? { "@id": uri } : null), [uri]);
}
