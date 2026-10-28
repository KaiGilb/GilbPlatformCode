// What the picker needs from the app around it: the search of the plan vault, the check that a tag is free, and the
// invalidation of a finished search. The unit never fetches or caches; each member is the call the source made, with the
// same arguments, at the same place. The host object must be the same object for as long as the provider is mounted.

import { createContext } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

/** One hit of the plan search, as the picker reads it: the record's address, its name, and the row the search already read. */
export interface PlanTagHit {
  uri: string;
  label: string;
  /** The listed or read row, so a pick can write without reading it again. */
  row: BaseRecord;
}

/** The answer of the plan search. `complete` is true only when the search saw every record. */
export interface PlanTagPage {
  hits: PlanTagHit[];
  complete: boolean;
}

export interface PlanTagPickerHost {
  /**
   * The records of `typeNames` in the plan vault matching `text`, with the hit's row. Empty text: the first typed list page.
   * `complete` is false when a vault, a read or the exact-tag find failed or a result was cut off; a vault that cannot be searched rejects.
   * GilbApp: searchPlanRecords(planVault, q, names, { qc }), components/records/PlanTagLinks.tsx:70 (lib/base/planSearch.ts:214).
   */
  findPlanRecords(planVault: string, text: string, typeNames: readonly string[]): Promise<PlanTagPage>;
  /**
   * Whether a record in the plan vault already uses this tag. A rejection is read as "could not check".
   * GilbApp: tagUsedInVault(planVault, text), PlanTagLinks.tsx:98 (lib/base/planLinks.ts).
   */
  tagUsed(planVault: string, tag: string): Promise<boolean>;
  /**
   * Mark the finished search under this key stale and ask for it again. `key` is `["plan-search", planVault, namesKey, text]`,
   * the same key the picker gives its query hook as `queryKey`.
   * GilbApp: qc.invalidateQueries({ queryKey }), PlanTagLinks.tsx:115.
   */
  invalidateSearch(key: readonly unknown[]): void | Promise<unknown>;
}

/** The provider the picker reads. With none, `PlanTagPicker` and `usePlanPickerFind` throw an error that names it. */
export const PlanTagPickerHostContext = createContext<PlanTagPickerHost | null>(null);
