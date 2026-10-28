// What the Value card's write layer needs from the app around it: the network, the find caches, the row cache and the record
// bookkeeping. The unit never fetches, caches or deletes on its own; each member is the call the source made, with the same
// arguments (the app's query client is not passed: the host holds it), at the same place, in the same order. The doc comment of
// a member names the call it replaces (GilbApp src/components/records/<file>:<line>, commit dcfc18b3). A member named `useX` is a
// React hook: the unit calls it unconditionally, on every render, in the place where the source called its hook.
//
// This unit is a writer. A host that cannot write does not take it: the Value lines show without it.

import { createContext, useContext } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { PlanFind } from "./planFind";
import type { MergePatchValue, RecordCreateFacts, WriteSource } from "./writeSource";

/** The record a delete is asked for: its id, its address (null when it has none) and, for a conditional delete, the version read. */
export interface DeleteRecordVars {
  id: string;
  entityUri: string | null;
  /** Present only for a conditional delete (the old record of a migration); every other delete leaves it out. */
  ifMatch?: string | null;
}

/** What `useDeleteRecord` gives back: the delete as a promise. */
export interface DeleteRecordMutation {
  mutateAsync: (v: DeleteRecordVars) => Promise<unknown>;
}

/** A parent whose children a find is asked for. `enabled` is false while the find must not be read. */
export interface PlanFindParent {
  id: string;
  entityUri: string | undefined;
  enabled: boolean;
}

/** What a find hook gives back for one parent. Only `data` is read. */
export interface PlanFindRead {
  data: PlanFind | undefined;
}

/** A record made in this session, as the working set remembers it. */
export interface RememberedRecord {
  id: string;
  vaultId: string;
  typeUri: string;
  updatedAt: number;
}

export interface ValueWriteHost {
  // ---- Network ----

  /**
   * Make a record in the vault. The `tag` is passed twice, as the name hint. A 409 means the tag is taken (the unit tries the next
   * suffix); any other failure is thrown as it is. Replaces `createRecord(planVault, typeUri, facts, tag)`
   * (valueChildRecords.ts:131, from lib/base/records.ts:522).
   */
  createRecord(
    vaultNamespace: string,
    typeUri: string,
    facts: RecordCreateFacts,
    nameHint?: string,
  ): Promise<{ id: string; etag: string | null }>;

  /**
   * Read one record; `null` when it is not there. `at` is a record address, or null, or (in the first call below) a vault id: the
   * unit passes the plan vault in that place on purpose, so the host must accept it there. Replaces
   * `readRecord(made.id, planVault)` (valueChildRecords.ts:137), `readRecord(oldRow.id, oldRow.entityUri ?? null)`
   * (valueChildRecords.ts:332) and `readRecord(<tail of the reference>, <reference>)` (useValueScale.ts:90), from lib/base/records.ts:645.
   */
  readRecord(id: string, at: string | null): Promise<BaseRecord | null>;

  /**
   * Patch one record (JSON merge patch; `null` deletes a member). `source` is `undefined` when the record carries no served
   * document. The patch is conditional on `precondition.ifMatch`. A failure with a numeric `status` keeps it (a 409 is "tag
   * taken"). A stale version must fail with the error `isConflict` recognises. Replaces `patchRecord(live.id, send,
   * live.entityUri ?? null, src[0] | undefined, { ifMatch: live.etag })` (valueChildRecords.ts:214-215, from lib/base/records.ts:963).
   */
  patchRecord(
    id: string,
    patch: Record<string, MergePatchValue>,
    at: string | null,
    source: WriteSource | undefined,
    precondition: { ifMatch: string | null },
  ): Promise<{ etag: string | null }>;

  /**
   * A hook: the delete door. `mutateAsync` ends a record; the app's own optimistic removal from its lists and the rollback on a
   * failed delete are done by this hook, as the source's hook did them (including the watcher of deletes that the source's hook
   * installs when it is called). Called once in each of the four hooks that write. Replaces `useDeleteRecord(vaultId)`
   * (useValueChildren.ts:46, useValueMeters.ts:46, useValueScale.ts:68, from lib/base/recordHooks.ts:2634).
   */
  useDeleteRecord(vaultId: string): DeleteRecordMutation;

  // ---- Error predicates ----

  /**
   * True for exactly the "another person changed it first" failure of a conditional write (the 412 class). A 409 without that
   * class is not a conflict: it means the tag is taken. Replaces `e instanceof RecordConflictError` (valueChildRecords.ts:220-221,
   * :387, useValueScale.ts:153, from lib/base/records.ts:158).
   */
  isConflict(e: unknown): boolean;

  /** True for the "not allowed" failure. Replaces `e instanceof RecordForbiddenError` (useValueScale.ts:153, from lib/base/records.ts:174). */
  isForbidden(e: unknown): boolean;

  // ---- Find caches (the finds by `a:partOf`) ----

  /**
   * The find the app holds now for the children of a record, or `undefined`. Read at click time, never snapshotted. Replaces
   * `qc.getQueryData<PlanFind>(planFindKey(planVault, "a:partOf", id))` (valueChildRecords.ts:102 and :123,
   * useValueMeters.ts:135, useValueQualifiers.ts:52, useValueScale.ts:75, with the key from lib/base/planFind.ts:48).
   */
  cachedPlanFind(planVault: string, attr: string, parentId: string): PlanFind | undefined;

  /**
   * Read a find from the vault when the cached one is older than `staleTime` (milliseconds; 0 reads it again), and give it back.
   * It fails when the find cannot be read. Replaces `qc.fetchQuery({ queryKey: planFindKey(...), queryFn: () =>
   * loadPlanFind(qc, planVault, attr, parentId, parentUri), staleTime })` (valueChildRecords.ts:343-347 with 0,
   * useValueQualifiers.ts:53 with 15000, from lib/base/planFind.ts:213).
   */
  fetchPlanFind(planVault: string, attr: string, parentId: string, parentUri: string, opts: { staleTime: number }): Promise<PlanFind>;

  /**
   * A hook: one find for each parent, read when `enabled`, kept fresh for 15 seconds, not retried on failure. Replaces `useQueries`
   * with `queryKey: planFindKey(planVault, attr, id)`, `enabled`, `retry: false`, `staleTime: 15_000` and `queryFn: () =>
   * loadPlanFind(qc, planVault, attr, id, entityUri ?? "")` for each parent (useValueMeters.ts:52-60, useValueQualifiers.ts:121-129).
   *
   * The `data` of a parent must keep its identity from one render to the next while the find has not changed: the hooks compare
   * the `data` of the last render with this one, and a host that builds a new object on every render makes the lists thrash.
   */
  usePlanFinds(planVault: string, attr: string, parents: readonly PlanFindParent[]): readonly PlanFindRead[];

  /**
   * Put `row` at the head of the find at once, remember it as pinned so a re-read that does not return it yet keeps it, and (with
   * `refresh: false`, the only way this unit calls it) leave the re-read to the caller. Replaces `prependPlanFind(qc, planVault,
   * attr, parentId, row, opts)` (valueChildRecords.ts:160, from lib/base/planFind.ts:310).
   */
  prependPlanFind(
    planVault: string,
    attr: string,
    parentId: string,
    row: BaseRecord,
    opts?: { members?: readonly string[] | "all"; refresh?: boolean },
  ): void;

  /**
   * Take `id` out of the find at once, remember it as dropped so a re-read that still returns it does not bring it back, and (with
   * `refresh: false`) leave the re-read to the caller. Replaces `dropPlanFind(qc, planVault, attr, parentId, id, opts)`
   * (valueChildRecords.ts:248, :256, :271, from lib/base/planFind.ts:338).
   */
  dropPlanFind(
    planVault: string,
    attr: string,
    parentId: string,
    id: string,
    opts?: { members?: readonly string[] | "all"; refresh?: boolean },
  ): void;

  /**
   * Show a patch of one linked record on every find that holds it, and in the pinned rows. Replaces `patchPlanFindRows(qc,
   * planVault, id, next)` (valueChildRecords.ts:223 and :237, from lib/base/planFind.ts:365).
   */
  patchPlanFindRows(planVault: string, id: string, next: (row: BaseRecord) => BaseRecord): void;

  /**
   * Read one find again. `members` names whose records could have changed (their addresses), or `"all"` (the default); `[]` reads
   * the find and no record. The members are marked stale before the find is read, so the read gets what is stored now. Replaces
   * `invalidatePlanFind(qc, planVault, attr, parentId, opts)` (valueChildRecords.ts:192 and :319, useValueChildren.ts:93 and
   * :153, useValueMeters.ts:122, from lib/base/planFind.ts:265).
   */
  invalidatePlanFind(planVault: string, attr: string, parentId: string, opts?: { members?: readonly string[] | "all" }): Promise<void>;

  // ---- Row cache ----

  /**
   * The newest of the list's row, the record's own read and `fallback`, as a list row. Replaces `liveRow(qc, planVault, id,
   * fallback)` (valueChildRecords.ts:182, from lib/base/planRowCache.ts:101).
   */
  liveRow(planVault: string, id: string, fallback: BaseRecord): GridRecord;

  /**
   * Read a missing ETag before a patch is built. `{ row }` to go on with; `{ conflict: true }` when `sameFor` says the fresh read
   * differs in a field the write touches; `{ unreadable: true }` when no ETag could be read. A row that has an ETag is returned
   * as it is, with no read. Replaces `ensureEtagUnchanged(qc, planVault, live, sameFor)` (valueChildRecords.ts:186, from
   * lib/base/planRowCache.ts:148).
   */
  ensureEtagUnchanged(
    planVault: string,
    row: GridRecord,
    sameFor: (fresh: GridRecord) => boolean,
  ): Promise<{ row: GridRecord } | { conflict: true } | { unreadable: true }>;

  /**
   * Read the record after a conflict, put that row in the app's lists and its record read, and give it back (`null` when it is
   * gone). It fails when the record cannot be read. Replaces `reconcileAfterConflict(qc, planVault, row)` (valueChildRecords.ts:222,
   * useValueScale.ts:160, from lib/base/planRowCache.ts:162).
   */
  reconcileAfterConflict(planVault: string, row: { id: string; entityUri?: string | null }): Promise<BaseRecord | null>;

  /**
   * Replace the row in every list that already holds it; `insert` adds it to the list of the plan vault. Replaces
   * `storePlanRow(qc, planVault, row, opts)` (valueChildRecords.ts:158 with `insert`, :235 without, from lib/base/planRowCache.ts:117).
   */
  storePlanRow(planVault: string, row: BaseRecord, opts?: { insert?: boolean }): void;

  /**
   * Put a saved row in the cache of the record read, under the record's id and address. Replaces
   * `qc.setQueryData(planRecordKey(stored.id, stored.entityUri), stored)` (valueChildRecords.ts:236, key from lib/base/planFind.ts:53).
   */
  setPlanRecord(id: string, at: string, row: BaseRecord): void;

  /**
   * Drop every plan picker's finished search in this vault; an open picker asks again. Replaces
   * `invalidatePlanSearch(qc, planVault)` (valueChildRecords.ts:159, from lib/base/planSearch.ts:25).
   */
  invalidatePlanSearch(planVault: string): void;

  // ---- Record bookkeeping ----

  /**
   * Remember a record made in this session. It is awaited, between the read of the new record and the cache writes. Replaces
   * `rememberRecord({ id, vaultId, typeUri, updatedAt })` (valueChildRecords.ts:139, from lib/base/workingSet.ts:144).
   */
  rememberRecord(ref: RememberedRecord): Promise<void>;

  /** Mark a record id as just made, so its detail opens ready to type. Replaces `markFreshlyCreated(made.id)` (valueChildRecords.ts:140, from lib/base/recordHooks.ts:501). */
  markFreshlyCreated(id: string): void;

  // ---- Type registry ----

  /**
   * The type address a record of this type name is made under, in this vault. Replaces `typeUriForVaultNamespace(typeName,
   * planVault)` (valueChildRecords.ts:119, from lib/base/recordTypes.ts:102).
   */
  typeUriForVaultNamespace(typeName: string, vaultNamespace: string): string;
}

/** The host of the write layer. There is no default: a hook used outside a provider throws. */
export const ValueWriteHostContext = createContext<ValueWriteHost | null>(null);

/** The host of the write layer, or a thrown sentence that names the provider. */
export function useValueWriteHost(): ValueWriteHost {
  const host = useContext(ValueWriteHostContext);
  if (!host) {
    throw new Error("The Value card's write hooks need a ValueWriteHostContext.Provider above them; none was found.");
  }
  return host;
}
