// What the hook needs from the app that stores the levels: the cached read, the wait for it, and the two writes.
// The unit never fetches, caches or writes; each of these is the call the source made, with the same arguments.

import { createContext } from "react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";

/** What the hook reads of the host's level query: the fields `useProjectLevels` uses, and no others. */
export type AllLevelsResult = {
  /** The vault's level records. The host must return the SAME array until they change: the tree is memoised on it. */
  data?: GridRecord[];
  isSuccess: boolean;
  isError: boolean;
  /** An `Error` is thrown as it is; anything else becomes "Could not read every level of this vault.". */
  error: unknown;
};

export interface ProjectLevelsHost {
  /**
   * A hook: every level record of the vault, as a cached query. It is called on every render, first, and never conditionally.
   * Empty `vaultId` means no read. A failed read is not retried.
   * GilbApp: useAllLevels(vaultId), lib/base/planLevels.ts:294-302 (useQuery of planLevelsKey(vaultId), readAllLevels, enabled when vaultId is not empty, retry false).
   */
  useAllLevels(vaultId: string): AllLevelsResult;
  /**
   * Settle when the level read has finished once (the hook calls it when the query is neither a success nor an error yet). A failed read rejects.
   * GilbApp: waitForLevels(qc, vaultId), lib/base/planLevels.ts:462-468 (qc.fetchQuery of planLevelsKey(vaultId), retry false).
   */
  waitForLevels(vaultId: string): Promise<void>;
  /**
   * WRITER. Read every level afresh and, if the vault has none, write the four defaults (once, also for two calls at the same time);
   * return the levels now stored.
   * GilbApp: ensureDefaultLevels(vaultId, qc), lib/base/planLevels.ts:359-369 (with readThenMaybeWriteDefaults and writeDefaults, 372-396).
   */
  ensureDefaultLevels(vaultId: string): Promise<GridRecord[]>;
  /**
   * WRITER. Create one level under `parentToken` (null = a main level), after ensuring the defaults; return the new level's token.
   * GilbApp: addProjectLevel(vaultId, qc, label, parentToken), lib/base/planLevels.ts:426-456.
   */
  addProjectLevel(vaultId: string, label: string, parentToken: string | null): Promise<string>;
}

/** The provider the hook reads. With none, `useProjectLevels` throws an error that names it. */
export const ProjectLevelsHostContext = createContext<ProjectLevelsHost | null>(null);
