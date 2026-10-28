// The shell the cards read, built from the session. GilbApp's shell took its vault set from the session (`session.vaults`, the lean
// `{vaultId, modes}` rows) and decorated each row from `GET /lws/vaults` when that answered (src/lib/base/hooks.ts:108-125, `useVaults`).
// This host does not make that second call: a row is the session's, with the decoration left empty.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import type { OpenRecordInVault, SessionShell, SessionVault } from "./env";

const NO_VAULTS: readonly SessionVault[] = [];

/** The query key of the session read. */
export const SESSION_QUERY_KEY = ["plan-card-hosts", "session"] as const;

/**
 * The hook that answers the cards' `useShell`: the session's vaults, the session vault's entity, and the open action when the developer gave one.
 * The vaults list keeps its identity while the session's vaults do not change (the Stakeholder lines memoise on it).
 */
export function createUseSessionState(session: SessionCredential, openRecordInVault: OpenRecordInVault | undefined) {
  function useSessionState(): { shell: SessionShell; sessionVaultEntity: string | null } {
    const q = useQuery({
      queryKey: SESSION_QUERY_KEY,
      queryFn: () => session.getSession(),
      retry: false,
      staleTime: 30_000,
    });
    const set = q.data?.vaults;
    const vaults = useMemo<readonly SessionVault[]>(
      () =>
        set
          ? set.map((sp) => ({
              vaultId: sp.vaultId,
              entity: null,
              name: null,
              parent: null,
              parentAmbiguous: false,
              modes: [...sp.modes],
              represents: null,
              isLandingVault: false,
            }))
          : NO_VAULTS,
      [set],
    );
    const entity = q.data?.vault?.entity ?? null;
    const shell = useMemo<SessionShell>(
      () => (openRecordInVault ? { vaults, openRecordInVault } : { vaults }),
      [vaults],
    );
    return { shell, sessionVaultEntity: entity };
  }
  return useSessionState;
}
