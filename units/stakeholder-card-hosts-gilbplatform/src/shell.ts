// The shell the online stakeholder card reads (`useShell`), built from the session. GilbApp's shell is `{ session, vaults, contentScope,
// openRecordFromList }` (components/ShellContext.ts:412; the value is built in components/AppShell.tsx:1662):
//   - `session` is the sign-in's `{ principal, vault: { entity } }`, read from the `SessionCredential`;
//   - `vaults` is the vault set GilbApp's `useVaults` built: the session's set decorated by `GET /lws/vaults` (`reachable-vaults`), lean while
//     the decoration is loading or has failed;
//   - `contentScope` is `{ readVaultId, reach }`. `reach` is null here (see `StakeholderCardGilbPlatformProvider`): `ownVaultIdOf` then falls
//     back to the landing row of `vaults`;
//   - `openRecordFromList` is the developer's router action.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OnlineStakeholderCardShell } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { useVaults } from "@kaigilb/gilbplatformcode-reachable-vaults";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

/** The query key of the session read. */
export const SESSION_QUERY_KEY = ["stakeholder-card-hosts", "session"] as const;

/** What the shell reads at each call, from the provider's latest props. */
export interface ShellInputs {
  /** The vault the screen is showing; the content scope's `readVaultId`. */
  viewedVaultId(): string | null;
  /** Opens a record of the holder's by its id, in the same pane. */
  openRecordFromList(id: string): void;
}

/**
 * The hook that answers the card's `useShell`. The session is read once from the credential (the query is shared by every card under the
 * provider); the vault set is the app's `useVaults` over it. The shell keeps its identity while its parts do not change.
 */
export function createUseShell(session: SessionCredential, inputs: ShellInputs) {
  function useShell(): OnlineStakeholderCardShell {
    const q = useQuery({
      queryKey: SESSION_QUERY_KEY,
      queryFn: () => session.getSession(),
      retry: false,
      staleTime: 30_000,
    });
    const signedIn = q.data;
    const { vaults } = useVaults(signedIn);
    const shellSession = useMemo(
      () => (signedIn ? { principal: signedIn.principal, vault: signedIn.vault ? { entity: signedIn.vault.entity } : null } : undefined),
      [signedIn],
    );
    const viewed = inputs.viewedVaultId();
    const contentScope = useMemo(() => ({ readVaultId: viewed, reach: null }), [viewed]);
    return useMemo<OnlineStakeholderCardShell>(
      () => ({ session: shellSession, vaults, contentScope, openRecordFromList: inputs.openRecordFromList }),
      [shellSession, vaults, contentScope],
    );
  }
  return useShell;
}
