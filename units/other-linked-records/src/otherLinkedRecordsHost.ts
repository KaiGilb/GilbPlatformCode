// What the other-linked-records list needs from the app that is in no unit: the app shell's vault list, to name each record's vault.
// Follows the host of `online-stakeholder-card`: a context the app provides, and one member that is a hook.

import { createContext, useContext } from "react";

/** What the list reads of the app's shell: the vaults the holder reaches, to name each linked record's vault. */
export interface OtherLinkedRecordsShell {
  /** Every vault the holder can reach. Nullish or missing: no vault is named. */
  vaults?: readonly { vaultId: string; name?: string | null }[] | null;
}

export interface OtherLinkedRecordsHost {
  /**
   * A HOOK: the app shell. Called on every render of the list, never conditionally, after the list's read of the screen links.
   * GilbApp: useShell(), components/ShellContext.ts (called at OtherLinkedRecords.tsx:33; `vaults` only).
   */
  useShell(): OtherLinkedRecordsShell;
}

/** The provider the list reads. With none, the list throws an error that names it. */
export const OtherLinkedRecordsHostContext = createContext<OtherLinkedRecordsHost | null>(null);

export function useOtherLinkedRecordsHost(): OtherLinkedRecordsHost {
  const host = useContext(OtherLinkedRecordsHostContext);
  if (!host) throw new Error("The other linked records list needs a OtherLinkedRecordsHostContext.Provider above it.");
  return host;
}
