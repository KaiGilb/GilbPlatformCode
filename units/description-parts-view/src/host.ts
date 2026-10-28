// What the Description of a Plan card needs from the app it sits in. Each member replaces one call the source made outside the
// unit; its doc comment names that call (GilbApp src/components/records/PlanDescriptionParts.tsx, line numbers from that file unless
// another file is named). A member named `useX` is a React hook: the view calls it on every render, in the place the source called
// its hook, never conditionally. The host object must keep the same members for as long as it is mounted.

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { LevelHost } from "@kaigilb/gilbplatformcode-description-parts-model";
import type { PlanFind } from "./planFind";
import type { RecordCreateFacts } from "./recordFacts";
import type { MergePatchValue, WriteSource } from "./writeSource";

/** The result of one find of the parts at a level (a React Query result in the source; only these members are read). */
export type PlanFindQuery = {
  data: PlanFind | undefined;
  status: "pending" | "error" | "success";
  isLoading: boolean;
  isError: boolean;
  isPending: boolean;
  isSuccess: boolean;
};

/** The options the find-cache writers take (the source's own option objects). */
export type FindWriteOptions = { members?: readonly string[] | "all"; refresh?: boolean };

/** What the app remembers of a record it has just made. */
export type RememberedRecord = { id: string; vaultId: string; typeUri: string; updatedAt: number };

/** The result of the version check before a write. */
export type EtagGate = { row: GridRecord } | { conflict: true } | { unreadable: true };

/** The delete mutation the host gives: what the source called as `del.mutateAsync(...)`. */
export type DeleteRecordMutation = {
  mutateAsync(vars: { id: string; entityUri: string | null | undefined }): Promise<unknown>;
};

/**
 * The members of {@link LevelHost} are part of this interface: the view passes the host itself where the source passed the query
 * client to `planPartialWrite` (:387, :417, :891) and `removalPlan` (:1340). Their doc comments say which call each replaces.
 */
export interface DescriptionPartsHost extends LevelHost {
  // ---- Reads (hooks; called on every render, in the order the source called them) ----

  /** The records already loaded for a vault (`data`): the tag pool. Replaces `useRecords(planVault)` (usePlanParts.ts:90). */
  useRecords(vaultId: string): { data?: readonly GridRecord[] };

  /**
   * The find of the parts directly under a record: `data` is `undefined` until it has run. Replaces
   * `usePlanFind(planVault, "a:partOf", record.entityUri ? record : null, cap)` (usePlanParts.ts:91; `planFind.ts:286`). A host that
   * runs the find reads at most `cap` rows, caches it for 15 000 ms and does not retry.
   */
  usePlanFind(
    vaultId: string,
    attr: string,
    parent: { id: string; entityUri?: string } | null,
    cap: number,
  ): PlanFindQuery;

  /**
   * One find of the parts under each of `parents`, in the same order, for a parent whose `uri` is not empty. Replaces
   * `useQueries({ queries: parents.map(...) })` (usePlanParts.ts:103-111: key `planFindKey(planVault, "a:partOf", p.id)`, `enabled: !!p.uri`,
   * `retry: false`, `staleTime: 15_000`, `queryFn: loadPlanFind(qc, planVault, "a:partOf", p.id, p.uri)`). The array and each result must
   * keep their identity while their data does not change: the view memoises on them.
   */
  useSubFinds(vaultId: string, attr: string, parents: readonly { id: string; uri: string }[]): PlanFindQuery[];

  /** The signed-in person as a source, or `null` when not known. Replaces `useSelfSource()` (:242; `useSelfSource.ts:19`). */
  useSelfSource(): { "@id": string } | null;

  // ---- Click-time getters (called when the person acts, never kept from a render) ----

  /**
   * The records the app holds now for a vault, from its loaded pages; `[]` when none are loaded. Read-only: a missing row is not
   * inserted. Replaces `qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(id))?.pages.flatMap((p) => p.records) ?? []` (:377).
   */
  cachedRecords(vaultId: string): BaseRecord[];

  /** The find the app holds now for one (vault, attribute, record), or `undefined`. Replaces `qc.getQueryData<PlanFind>(planFindKey(...))` (:488, :988). */
  getFind(vaultId: string, attr: string, id: string): PlanFind | undefined;

  /**
   * Every find the app holds now for a vault, read at the moment of the call, not from a hook value. Replaces
   * `qc.getQueriesData<PlanFind>({ queryKey: ["plan-find", planVault] })` (:997); only the data of each is read.
   */
  getFinds(vaultId: string): readonly (PlanFind | undefined)[];

  /**
   * The newest copy of a record: the screen list, the record read, and `fallback`. The view calls it with the PLAN vault in
   * `patchPart` (:527, :536) and with the SCREEN vault in `saveBody` and `saveSource` (:584, :624): keep each argument. Replaces
   * `liveCachedRow(qc, vaultId, id, fallback)` (`planRowCache.ts:101`).
   */
  liveRow(vaultId: string, id: string, fallback: BaseRecord): GridRecord;

  /** Reads one record. Replaces `readRecord(id, at)` (:450; `records.ts`). The view passes a vault id as `at`. */
  readRecord(id: string, at: string | null): Promise<BaseRecord | null>;

  /** Whether a tag is used by any record in the vault. Replaces `tagUsedInVault(planVault, tag)` (:706, :710, :866; `planLinks.ts:220`). */
  tagUsedInVault(vaultId: string, tag: string): Promise<boolean>;

  /**
   * A row with no ETag is read first: `{ row }` when it has one, `{ conflict: true }` when the fresh copy differs in a field the
   * write touches (`sameFor` is false), `{ unreadable: true }` when it still has none. Replaces
   * `ensureEtagUnchanged(qc, planVault, row, sameFor)` (:530; `planRowCache.ts:148`).
   */
  ensureEtagUnchanged(vaultId: string, row: GridRecord, sameFor: (fresh: GridRecord) => boolean): Promise<EtagGate>;

  /** The record as the vault has it now, after a 412-class conflict; `null` when it cannot be read. Replaces `reconcileAfterConflict(qc, planVault, live)` (:564; `planRowCache.ts:162`). */
  reconcileAfterConflict(vaultId: string, row: { id: string; entityUri?: string | null }): Promise<BaseRecord | null>;

  /**
   * True for exactly the error the host's patch writer raises when the version check fails (HTTP 412); a 409 is not a conflict here.
   * Replaces `e instanceof RecordConflictError` (:563, :1748, :1768).
   */
  isConflict(e: unknown): boolean;

  /**
   * The stored type address of a type name in a vault. The view asks for `SpecificationElement` and `Assumption`. Replaces
   * `typeUriForVaultNamespace(args.typeName, planVault)` (:437; `recordTypes.ts:102`).
   */
  typeUriForVaultNamespace(typeName: string, vaultNamespace: string): string;

  // ---- Cache writes (always required; a host with no writers may give no-ops) ----

  /** Puts a saved or created row in the app's lists; `insert` adds a created row on the record's own vault. Replaces `storePlanRow(qc, planVault, row, opts)` (:478, :558; `planRowCache.ts:117`). */
  storePlanRow(vaultId: string, row: BaseRecord, opts?: { insert?: boolean }): void;

  /** Puts a saved row in the app's record read. Replaces `qc.setQueryData(planRecordKey(id, entityUri), row)` (:559). */
  setRecordRead(id: string, at: string, row: GridRecord): void;

  /** Drops cached searches of a vault. Replaces `invalidatePlanSearch(qc, planVault)` (:479; `planSearch.ts:25`). */
  invalidatePlanSearch(vaultId: string): void;

  /**
   * Shows `row` at the head of a find at once; unless `refresh` is false it also re-reads that find. This is NOT the separate
   * re-read the view makes with `invalidatePlanFind`: with `refresh: false` it must read nothing. Replaces
   * `prependPlanFind(qc, planVault, "a:partOf", parentId, row, opts)` (:480, :1057; `planFind.ts:310`).
   */
  prependPlanFind(vaultId: string, attr: string, parentId: string, row: BaseRecord, opts?: FindWriteOptions): void;

  /**
   * Takes `id` out of a find at once, and keeps it out of a stale re-read; unless `refresh` is false it also re-reads. With
   * `refresh: false` it must read nothing. Replaces `dropPlanFind(qc, planVault, "a:partOf", parentId, id, opts)` (:1056, :1368; `planFind.ts:338`).
   */
  dropPlanFind(vaultId: string, attr: string, parentId: string, id: string, opts?: FindWriteOptions): void;

  /** Shows a patch of one record on every find that holds it. Replaces `patchPlanFindRows(qc, planVault, id, next)` (:538, :560, :568; `planFind.ts:365`). */
  patchPlanFindRows(vaultId: string, id: string, next: (row: BaseRecord) => BaseRecord): void;

  /**
   * Re-reads one level: marks the listed member records stale, then re-fetches the find. `members` is a list of entity addresses
   * or `"all"` (the rows the find holds). Settles when the re-read has been started. Replaces
   * `invalidatePlanFind(qc, planVault, "a:partOf", parentId, { members })` (:148 via `reReadLevels`, :542, :574, :1516, :1517; `planFind.ts:265`).
   */
  invalidatePlanFind(vaultId: string, attr: string, parentId: string, opts?: { members?: readonly string[] | "all" }): Promise<void>;

  /** Replaces the find the app holds for one (vault, attribute, record). Replaces `qc.setQueryData<PlanFind>(planFindKey(...), value)` (:489, :1358). */
  setFind(vaultId: string, attr: string, id: string, value: PlanFind): void;

  /** Tells the app a record exists now. Replaces `await rememberRecord({ id, vaultId, typeUri, updatedAt })` (:452; `workingSet.ts:144`). */
  rememberRecord(ref: RememberedRecord): Promise<void>;

  /** Tells the app a record was just made, so a list that has not caught up keeps it. Replaces `markFreshlyCreated(id)` (:453; `recordHooks.ts:501`). */
  markFreshlyCreated(id: string): void;

  // ---- Writers (optional; a view whose writers are not all given is read-only, see "Wrong readings") ----

  /** Creates a record, returns its id and ETag. Replaces `createRecord(planVault, typeUri, facts, args.tag)` (:448; `records.ts:522`). */
  createRecord?(vaultNamespace: string, typeUri: string, facts: RecordCreateFacts, nameHint?: string): Promise<{ id: string; etag: string | null }>;

  /**
   * Patches a record. `source` is `undefined` for a record with no served keys, and then the call has five arguments. Replaces
   * `patchRecord(live.id, patch, live.entityUri ?? null, src[0], pre)` (:554-555; `records.ts:963`).
   */
  patchRecord?(
    id: string,
    patch: Record<string, MergePatchValue>,
    at: string | null,
    source: WriteSource | undefined,
    precondition?: { ifMatch?: string | null },
  ): Promise<{ etag: string | null }>;

  /**
   * The hook that gives the delete mutation. Called on every render when present. Replaces `useDeleteRecord(vaultId)` (:248;
   * `recordHooks.ts:2634`); the view calls `mutateAsync` as the source called `del.mutateAsync` (:1367).
   */
  useDeleteRecord?(vaultId: string): DeleteRecordMutation;

  // ---- App components ----

  /**
   * The "?" button that opens the help panel, with `children` as the panel. It MUST render an element with the attribute
   * `data-help-button`: the view's document `mousedown` handler leaves the add row open for a click on it (:1436). Replaces
   * `HelpButton` (:1856, :1864, :1883; `components/help/HelpButton.tsx`).
   */
  HelpButton: ComponentType<{ label: string; title: string; startAt: string; children: ReactNode }>;
}

export const DescriptionPartsHostContext = createContext<DescriptionPartsHost | null>(null);

export function useDescriptionPartsHost(): DescriptionPartsHost {
  const host = useContext(DescriptionPartsHostContext);
  if (!host) throw new Error("description-parts-view: wrap the app in <DescriptionPartsHostContext.Provider value={host}>");
  return host;
}
