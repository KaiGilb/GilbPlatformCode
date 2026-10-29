// What the Employees group needs from the app that is in no unit: the bounded read of many records, the photo-term read spellings,
// the sheet's history entry, and the face of a record. Each member is the
// call the source made, with the same arguments, at the same place.

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

/**
 * One record read by `readResources`: its id, its entity URI and its served document ({} when it did not read).
 * GilbApp: ReadResource, src/lib/mynet/place/lws.ts:146-156 (copied; a type only).
 */
export interface ReadResource {
  id: string;
  uri: string;
  doc: Record<string, unknown>;
  /** The store answered 404: the entity is gone (deleted since it was listed or found). */
  gone: boolean;
  /** The entity's type as the store served it, when it said. */
  typeUri?: string;
}

/** The props the row passes to the host's face. GilbApp: RecordFace, src/components/records/RecordFace.tsx (only the props the row passes). */
export interface RecordFaceProps {
  photoRef: string | null;
  readRecordFor: null;
  vaultId: string | null;
  name: string;
  className: string;
  fallback: ReactNode;
}

export interface OrgEmployeesHost {
  /**
   * Reads many records, at most six in flight, in input order; a record the store answered 404 for comes back `gone` with an empty `doc`;
   * any other failed read rejects. Called once per page with the employment addresses.
   * GilbApp: readResources(uris, vaultId), src/lib/mynet/place/lws.ts:164 (the default `readEmployments` of orgEmployees.ts:100).
   */
  readResources(uris: readonly string[], vaultId: string): Promise<ReadResource[]>;
  /**
   * Every spelling a stored photo fact may carry, asked ONCE per page. The app shares one ask of the term at a time and does not ask again
   * for 60 s after an answer that did not resolve.
   * GilbApp: photoReadKeys(), src/lib/base/photoTerm.ts:37 (the default `photoKeys` of orgEmployees.ts:107).
   */
  photoReadKeys(): Promise<readonly string[]>;
  /**
   * OPTIONAL. The face of a record (its photo, else the `fallback`). Absent: the row draws no face and still shows the person's name and titles.
   * GilbApp: RecordFace, src/components/records/RecordFace.tsx:22 (drawn at OrgEmployeeRow.tsx:11).
   */
  RecordFace?: ComponentType<RecordFaceProps>;
  /**
   * A HOOK: the full-list sheet is a history entry. Called on every render of `OrgShortList`, at the place the source called it, never conditionally.
   * GilbApp: useSheetHistory(open, onClosed), src/components/records/useSheetHistory.ts:41 (called at OrgShortList.tsx:51).
   */
  useSheetHistory(open: boolean, onClosed: () => void): { requestClose: (after?: () => void) => void };
  /**
   * Called when the short list mounts: a reload that landed on a sheet's history entry steps back off it. Sync.
   * GilbApp: dropStaleSheetEntry(), src/components/records/useSheetHistory.ts:32 (called at OrgShortList.tsx:56).
   */
  dropStaleSheetEntry(): void;
}

/** The provider the Employees group reads. With none, the hooks throw an error that names it. */
export const OrgEmployeesHostContext = createContext<OrgEmployeesHost | null>(null);

export function useOrgEmployeesHost(): OrgEmployeesHost {
  const host = useContext(OrgEmployeesHostContext);
  if (!host) throw new Error("The Employees group needs an OrgEmployeesHostContext.Provider above it.");
  return host;
}
