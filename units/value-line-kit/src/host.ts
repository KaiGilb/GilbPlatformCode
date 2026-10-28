// What the Value card's lines need from the app they sit in. Each member replaces one call the source made outside the unit
// (GilbApp src/components/records/PlanValueLines.tsx at dcfc18b3; line numbers from that file). The host object must be the same
// object for as long as the provider is mounted: `useLinkLabel` is a React hook and is called on every render, in the place the
// source called its hook, never conditionally.

import { createContext, useContext, type ReactNode } from "react";
import type { TypeOption, TypeSearchFn } from "@kaigilb/gilbplatformcode-type-chooser";

export interface ValueLinesHost {
  /**
   * The live label of a linked record (a source that is a record, not words): its unit tag, else its name; null while it is being
   * read. Replaces the whole hook `useLinkLabel(uri, vaultId)` (:447-466), which used `useRecords`, `useQuery`, `readRecord`,
   * `vaultOriginOf` and `refDisplayName`. Called by the Levels line.
   */
  useLinkLabel(uri: string | undefined, vaultId: string): string | null;
  /**
   * Open a type's page in the ontology section of the app. Replaces `useShell().openOntologyConcept` (:1376, :1395). Absent: the
   * "Open in Ontology" button of the type popover does nothing. Called by the Endpoint line.
   */
  openOntologyConcept?: (typeName: string) => void;
  /**
   * The type search. Replaces `searchLiveTerms` (:1466) and the search the type chooser used by default (:1435). The Endpoint line's
   * "Find types" button and its type chooser use this one function.
   */
  searchTypes: TypeSearchFn;
  /** What typing will reach, said before the first answer comes back. Replaces the chooser's default (:1435). */
  blankReach: string;
  /** Draws the icon of a type option in the chooser. Replaces the chooser's default (:1435). Absent: no icon. */
  renderTypeIcon?: (option: TypeOption, className: string) => ReactNode;
}

export const ValueLinesHostContext = createContext<ValueLinesHost | null>(null);

export function useValueLinesHost(): ValueLinesHost {
  const host = useContext(ValueLinesHostContext);
  if (!host) throw new Error("value-line-kit: wrap the card in <ValueLinesHostContext.Provider value={host}>");
  return host;
}
