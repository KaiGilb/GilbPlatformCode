// What the Impacts table needs from the app around it: the record list and the relations, the person's own card, the read of one
// relation, the type registry, the caches, and the writes of a relation. The unit never fetches or caches; each member is the call
// the source made, with the same arguments (the app's query client is not passed: the host holds it), at the same place.
// A `use…` member is a hook, called unconditionally where the source called its hook.
// The host object must be the same object for as long as the provider is mounted.
//
// The writers (`writePairRelation`, `endRelation`, `useCreateRecord`) are optional. Without one the table is read-only: it behaves
// as it does with `canEdit` false.

import { createContext } from "react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

/** A record type the host can create. The unit passes it from `resolveType` to `useCreateRecord` and reads nothing of it. */
export type PlanTypeSpec = object;

/**
 * A record whose main tag may be asked for: its address (when it has one) and its facts. Structural, so this unit does not depend on
 * the unit that reads the tags.
 */
export interface MainTagRow {
  entityUri?: string | null;
  facts: Record<string, string | undefined> | null | undefined;
}

/** What a read of a record's relations answers. `data` is absent while it is read or when it failed. */
export interface PlanRelationsRead {
  isPending: boolean;
  isError: boolean;
  data?: RecordRelation[];
}

/** The part of a relation's document the table reads: the facts stored on the relation itself, keyed as stored. */
export interface PlanRelationDoc {
  extras: Record<string, unknown>;
}

/** What the read of one relation answers. `data` is absent while it is read, null when no such relation exists. */
export interface PlanRelationDocRead {
  data?: PlanRelationDoc | null;
}

/** One page of a vault's record list, as the table reads and copies it. The host's page may carry more; it is spread as it is. */
export interface PlanRecordsPage {
  records: GridRecord[];
  total: number;
}

/** A vault's cached record list, in pages. */
export interface PlanRecordPages {
  pages: PlanRecordsPage[];
  pageParams: unknown[];
}

/** What the optimistic create answers: the record's id, its ETag and its address when the vault gave one. */
export interface PlanCreated {
  id: string;
  etag: string | null;
  entityUri?: string;
  tempId: string;
}

/** The relation an impact is written as. */
export interface PlanImpactRelationInput {
  /** Set to update the relation in place; absent for a new one. */
  relationId?: string;
  sourceId: string;
  targetId: string;
  sourceEntityUri: string;
  targetEntityUri: string;
  typeCurie: string;
  roles: { source: string; target: string };
  vaultNamespace: string;
  /** The numbers, basis, unit and source, as stored on the relation. */
  extraFacts: Record<string, unknown>;
}

export interface PlanImpactsHost {
  /**
   * A hook: the records of the screen vault, the pool the tags are looked up in. `data` is absent while they are read.
   * GilbApp: useRecords(vaultId), components/records/PlanImpacts.tsx:504 (lib/base/recordHooks.ts:1320).
   */
  useRecords(vaultId: string): { data?: readonly GridRecord[] };
  /**
   * A hook: the relations a record takes part in. `isPending` while read; `isError` when it failed.
   * GilbApp: useRelations(record.id, record.entityUri ?? null), PlanImpacts.tsx:505 (lib/base/relationHooks.ts:14).
   */
  useRelations(id: string | null, at: string | null): PlanRelationsRead;
  /**
   * A hook: the signed-in person's own card as a link, or null when it is not known. A number they write makes them its source.
   * GilbApp: useSelfSource(), PlanImpacts.tsx:508 (components/records/useSelfSource.ts:20).
   */
  useSelfSource(): { "@id": string } | null;
  /**
   * A hook: the MAIN tags of the linked records that hold no name or `unitTag`, by record address (a record with none is absent).
   * The table calls it once per render, unconditionally, after `known` and the links are read and before they are sorted, with the
   * records of the pool that the links point at (by address or id); ONE batch call for all of them, never one per link. The answer
   * names a linked record by its main tag, in the row, in the sort and in the error notice.
   * GilbApp: useMainTagsForRows(rows), PlanImpacts.tsx:517-519 (lib/base/recordTags.ts); its options are
   * `staleTime: 60_000, retry: false, refetchOnWindowFocus: false`. Required: it is a read.
   */
  useMainTagsForRows(rows: readonly MainTagRow[]): ReadonlyMap<string, string>;
  /**
   * A hook: the document of one relation, read in the plan vault and kept 15 s, not retried. `data` is absent while it is read and
   * null when the relation does not exist.
   * GilbApp: useQuery({ queryKey: ["plan-impact", link.relation], queryFn: () => readRelationDoc(link.relation, planVault), staleTime: 15_000, retry: false }),
   * PlanImpacts.tsx:397-402 (readRelationDoc: lib/base/relationDoc.ts:204).
   */
  useRelationDoc(relation: string, planVault: string): PlanRelationDocRead;
  /**
   * The record type for a kind (`"value"` or `"resource"`), or null when this app cannot create it.
   * GilbApp: resolveType(kind), PlanImpacts.tsx:580 (lib/base/recordTypes.ts:457).
   */
  resolveType(kind: string): PlanTypeSpec | null;
  /**
   * Drop every plan picker's finished search in this vault; an open picker asks again.
   * GilbApp: invalidatePlanSearch(qc, planVault), PlanImpacts.tsx:593 (lib/base/planSearch.ts:25).
   */
  invalidatePlanSearch(planVault: string): void;
  /**
   * The cached record list of a vault, or undefined when none is cached.
   * GilbApp: qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId)), PlanImpacts.tsx:81 and :84 (recordsKey: lib/base/recordHooks.ts).
   */
  getRecordPages(vaultId: string): PlanRecordPages | undefined;
  /**
   * Set the cached record list of a vault.
   * GilbApp: qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId), pages), PlanImpacts.tsx:88.
   */
  setRecordPages(vaultId: string, pages: PlanRecordPages): void;
  /**
   * Set the cached relations of a record: to a list, or to what `next` makes of the cached one (undefined when none).
   * GilbApp: qc.setQueryData<RecordRelation[]>(relationsKey(id, at), next), PlanImpacts.tsx:544 and :643 (relationsKey: lib/base/relations.ts:59).
   */
  setRelations(
    id: string,
    at: string | null,
    next: RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[]),
  ): void;

  // ---- writers: optional ----

  /**
   * A hook: the optimistic create of a record. `mutateAsync` makes a record of `type` with `facts` (the tag only when `nameOnly`) and
   * resolves with its id, ETag and address.
   * GilbApp: useCreateRecord(planVault), PlanImpacts.tsx:507 (lib/base/recordHooks.ts:1948). Absent: the table is read-only.
   */
  useCreateRecord?(planVault: string): {
    mutateAsync(args: { type: PlanTypeSpec; facts: Record<string, string>; nameOnly?: boolean }): Promise<PlanCreated>;
  };
  /**
   * Write one t:ImpactOn relation: a new one, or the one named by `relationId` in place. Resolves with the relation's id and its
   * address when the vault gave one.
   * GilbApp: writePairRelation({ relationId?, sourceId, targetId, sourceEntityUri, targetEntityUri, typeCurie, roles, vaultNamespace, extraFacts }),
   * PlanImpacts.tsx:417 and :555 (lib/base/relationWrite.ts:217). Absent: the table is read-only.
   */
  writePairRelation?(input: PlanImpactRelationInput): Promise<{ id: string; uri?: string | null }>;
  /**
   * End a relation by its address (or id), in the plan vault.
   * GilbApp: endRelation(relation, planVault), PlanImpacts.tsx:640 (lib/base/relationWrite.ts:491). Absent: the table is read-only.
   */
  endRelation?(relation: string, planVault: string): Promise<unknown>;
}

/** The provider the Impacts table reads. With none, `PlanImpacts` throws an error that names it. */
export const PlanImpactsHostContext = createContext<PlanImpactsHost | null>(null);
