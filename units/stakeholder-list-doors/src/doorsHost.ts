// What the doors need from the app that is in no unit: the screen's request count, the app's record cache, the list of deletes under way,
// and the freshness of a cached record. The unit never counts requests and never reads the app's query cache for a record; each member is
// the call the source made, with the same arguments, at the same place.

import { createContext } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";

export interface StakeholderListDoorsHost {
  /**
   * How many requests the page has sent so far (0 when nothing counts them). Sync. Called when a reader is made, when the identity of
   * the reader changes, and each time the reader asks how many requests the screen has used (`requestsSoFar`).
   * GilbApp: requestsSent(), lib/base/requestMeter.ts:39 (called at listDoors.ts:272, useStakeholderListReader.ts:116 and :120).
   */
  requestsSent(): number;
  /**
   * How long, in milliseconds, a record the app's record cache holds is taken as fresh. A record answered by a page's document is kept
   * only that long (from the list's read, else from now).
   * GilbApp: HELD_RECORD_FRESH_MS = 15_000, lib/base/recordHooks.ts:449 (read at listDoors.ts:435).
   */
  heldRecordFreshMs: number;
  /**
   * The record the app's record cache holds for this row (a full-row list page left it there, or a read did), or null: not held, or held
   * for longer than {@link heldRecordFreshMs}. A call, made when the reader asks for a found record; never a snapshot taken earlier.
   * GilbApp: heldRecordOf(qc, id, uri), lib/base/recordHooks.ts:456 (called at useStakeholderListReader.ts:131).
   */
  heldRecordOf(qc: QueryClient, id: string, entityUri: string | null | undefined): BaseRecord | null;
  /**
   * A HOOK: the ids of the records being deleted or deleted in this session (the delete watcher's pending ids and the session's deleted
   * list). It is called on every render of `useStakeholderListReader`, at the place the source called it, and never conditionally. The
   * host must return the SAME set until it changes: the list is memoised on it.
   * GilbApp: useRecordsBeingDeleted(), lib/base/recordHooks.ts:2609 (called at useStakeholderListReader.ts:100).
   */
  useRecordsBeingDeleted(): ReadonlySet<string>;
}

/** The provider `useStakeholderListReader` reads. With none, the hook throws an error that names it. */
export const StakeholderListDoorsHostContext = createContext<StakeholderListDoorsHost | null>(null);
