// The shell the cards read (`useShell`), built from the session. GilbApp's shell is `{ session, vaults, contentScope, writeGuard,
// openRecordFromList }` (components/ShellContext.ts:412; the value is built in components/AppShell.tsx:1662):
//   - `session` is the sign-in's `{ principal, vault: { entity, shortWebId } }`, read from the `SessionCredential`;
//   - `vaults` is the vault set GilbApp's `useVaults` built: the session's set decorated by `GET /lws/vaults` (`reachable-vaults`), lean while
//     the decoration is loading or has failed;
//   - `contentScope` is `{ readVault, readVaultId, reach }`. `readVault` is the vault on screen when the vault set holds it, else the landing
//     vault (AppShell.tsx:471-472); `reach` is null here (see `StakeholderCardGilbPlatformProvider`): `ownVaultIdOf` then falls
//     back to the landing row of `vaults`;
//   - `writeGuard` is a statement about the read vault's own write grant (AppShell.tsx:503-516), and holds the held card's every edit control;
//   - `openRecordFromList` is the developer's router action.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OnlineStakeholderCardShell } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { modesLabel } from "@kaigilb/gilbplatformcode-modes-label";
import { useVaults } from "@kaigilb/gilbplatformcode-reachable-vaults";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { canWriteVault, vaultLabel } from "@kaigilb/gilbplatformcode-vault-list";

/** The query key of the session read. */
export const SESSION_QUERY_KEY = ["stakeholder-card-hosts", "session"] as const;

/** What the shell reads at each call, from the provider's latest props. */
export interface ShellInputs {
  /** The vault the screen is showing; the content scope's `readVaultId`. */
  viewedVaultId(): string | null;
  /** Opens a record of the holder's by its id, in the same pane. */
  openRecordFromList(id: string): void;
}

/** Whether the pane may write at all, and why not (non-null exactly when `allowed` is false). */
export interface WriteGuard {
  allowed: boolean;
  reason: string | null;
}

/**
 * The write guard of the vault on screen: a statement about that vault's own write grant, so a vault held read-only shows no write affordance, with the
 * reason stated; with no vault open, the reason says whether the vault set is still being found. GilbApp: `writeGuard`, AppShell.tsx:503-516 (the
 * words are the source's). Per-entity write is still re-gated by the platform: this is the vault-level floor.
 */
export function writeGuardOf(readVault: ReachableVault | null, vaultsPending: boolean): WriteGuard {
  if (!readVault) {
    return vaultsPending
      ? { allowed: false, reason: "Checking which vaults you can reach…" }
      : { allowed: false, reason: "No vault is open, so there is nowhere to save. Choose a vault first." };
  }
  if (!canWriteVault(readVault)) {
    return {
      allowed: false,
      reason: `You hold ${modesLabel(readVault.modes).toLowerCase()} on ${vaultLabel(readVault)}, so nothing can be saved here.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * The vault the screen reads: the vault on screen when the vault set holds it, else the vault flagged as the holder's landing vault, else none (never
 * the first row). GilbApp: `readVault = selectedVault ?? landingVault`, AppShell.tsx:471-472.
 */
export function readVaultOf(vaults: readonly ReachableVault[], viewedVaultId: string | null): ReachableVault | null {
  const selected = vaults.find((p) => p.vaultId === viewedVaultId) ?? null;
  return selected ?? vaults.find((p) => p.isLandingVault) ?? null;
}

/**
 * What the cards read of the shell: the online card's, and the held card's (`stakeholder-record-card`: `session.vault.shortWebId`, `contentScope.readVault`,
 * `writeGuard`). The held card's own type is structurally this one.
 */
export type PlatformShell = OnlineStakeholderCardShell & {
  session: { principal: string; vault?: { entity?: string | null; shortWebId?: string | null } | null } | null | undefined;
  contentScope: { reach?: { vaultId: string } | null; readVault: ReachableVault | null; readVaultId: string | null };
  writeGuard: WriteGuard;
};

/**
 * The hook that answers the cards' `useShell`. The session is read once from the credential (the query is shared by every card under the
 * provider); the vault set is the app's `useVaults` over it. The shell keeps its identity while its parts do not change.
 */
export function createUseShell(session: SessionCredential, inputs: ShellInputs) {
  function useShell(): PlatformShell {
    const q = useQuery({
      queryKey: SESSION_QUERY_KEY,
      queryFn: () => session.getSession(),
      retry: false,
      staleTime: 30_000,
    });
    const signedIn = q.data;
    const { vaults, isPending } = useVaults(signedIn);
    const shellSession = useMemo(
      () =>
        signedIn
          ? {
              principal: signedIn.principal,
              vault: signedIn.vault ? { entity: signedIn.vault.entity, ...(signedIn.vault.shortWebId ? { shortWebId: signedIn.vault.shortWebId } : {}) } : null,
            }
          : undefined,
      [signedIn],
    );
    const viewed = inputs.viewedVaultId();
    const readVault = useMemo(() => readVaultOf(vaults, viewed), [vaults, viewed]);
    const contentScope = useMemo(() => ({ readVault, readVaultId: readVault?.vaultId ?? null, reach: null }), [readVault]);
    const writeGuard = useMemo(() => writeGuardOf(readVault, isPending), [readVault, isPending]);
    return useMemo<PlatformShell>(
      () => ({ session: shellSession, vaults, contentScope, writeGuard, openRecordFromList: inputs.openRecordFromList }),
      [shellSession, vaults, contentScope, writeGuard],
    );
  }
  return useShell;
}

/**
 * The passive session read of the adder's card: it sees the session the shell already holds (the same query key) and never fetches or mints one
 * (`enabled: false`). The query result as React Query shapes it, of which `useAdderCard` reads `data?.principal`.
 */
export function createUseSession(session: SessionCredential) {
  return function useSession(opts: { enabled: false }) {
    return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: () => session.getSession(), retry: false, staleTime: 30_000, enabled: opts.enabled });
  };
}
