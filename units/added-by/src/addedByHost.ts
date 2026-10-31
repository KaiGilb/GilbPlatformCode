// What the "Added by" line needs from the app that is in no unit: the app shell's two ways to open a record. Follows the host of
// `other-linked-records`: a context the app provides, and one member that is a hook.

import { createContext, useContext } from "react";

/** What the line reads of the app shell: how to open the adder's card. */
export interface AddedByShell {
  /** Opens a record of the list by id. */
  openRecordFromList(id: string): void;
  /** Opens a record in a named vault. When the shell has none, the line falls back to `openRecordFromList`. */
  openRecordInVault?(vault: string, id: string, opts?: { push?: boolean }): void;
}

export interface AddedByHost {
  /**
   * A HOOK: the app shell, or null when there is none (the line then opens nothing). Called on every render of the line, never
   * conditionally, after the line's read of the adder. GilbApp: `useContext(ShellContext)`, components/ShellContext.ts (read at
   * AddedByLine.tsx).
   */
  useShell(): AddedByShell | null | undefined;
}

/** The provider the line reads. With none, the line throws an error that names it. */
export const AddedByHostContext = createContext<AddedByHost | null>(null);

export function useAddedByHost(): AddedByHost {
  const host = useContext(AddedByHostContext);
  if (!host) throw new Error("The Added by line needs an AddedByHostContext.Provider above it.");
  return host;
}
