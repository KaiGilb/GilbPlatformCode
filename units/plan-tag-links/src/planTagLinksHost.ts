// What the Plan card's link lines need from the app around them: the record lists and the relations, the type registry,
// the row cache and the find caches, the reads and the writes, and the create dialog. The unit never fetches or caches;
// each member is the call the source made, with the same arguments (the app's query client is not passed: the host holds
// it), at the same place, in the same order. A `use…` member is a hook, called unconditionally where the source called its hook.
// The host object must be the same object for as long as the provider is mounted.
//
// The writers (`patchRecord`, `createRecord`, `useCreateRecord`, `writePairRelation`, `endRelation`, `ConnectedCreateDialog`) are
// optional. A component whose writer is missing is read-only: it behaves as it does with `canEdit` false.

import { createContext, type ComponentType } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { TypeOption } from "@kaigilb/gilbplatformcode-type-chooser";
import type { PlanFind } from "./planFindNote";
import type { WriteSource } from "./writeSource";

/** A record type the host can create. The unit passes it from `resolveType` to `useCreateRecord` and reads nothing of it. */
export type PlanTypeSpec = object;

/** A merge patch of one link: `{ [slug]: { "@id": address } }`, a list of them, or `null` to retract. */
export type PlanLinkPatch = Record<string, { "@id": string } | { "@id": string }[] | null>;

/** The facts of a raw create: strings, and links as `{ "@id": address }`. */
export type PlanCreateFacts = Record<string, string | { "@id": string }>;

/** What a read of a record's relations answers. `data` is absent while it is read or when it failed. */
export interface PlanRelationsRead {
  isPending: boolean;
  isError: boolean;
  data?: RecordRelation[];
}

/** What the find of a card's linked records answers. */
export interface PlanFindRead {
  data?: PlanFind;
  isError: boolean;
}

/** What the optimistic create answers: the record's id, its ETag and its address when the vault gave one. */
export interface PlanCreated {
  id: string;
  etag: string | null;
  entityUri?: string;
  tempId: string;
}

/** The props the unit gives the create dialog of the Part of System line. */
export interface PlanTagLinksCreateDialogProps {
  open: boolean;
  /** Always true: the dialog is opened on the Stakeholders create form. */
  stakeholders: boolean;
  /** Always null: a plain create with no link section. */
  source: null;
  /** Always `[vaultId, planVault]`. */
  drawnVaultIds: string[];
  /** Always the Software System type, as a whole option. */
  initialTypeOption: TypeOption;
  onClose: () => void;
  /** Called with the new record's id (or its address), once it exists. */
  onCreated: (id: string) => void;
}

export interface PlanTagLinksHost {
  /**
   * A hook: the records of the screen vault, the pool the tags are looked up in. `data` is absent while they are read.
   * GilbApp: useRecords(vaultId), components/records/PlanTagLinks.tsx:319 (lib/base/recordHooks.ts:1320).
   */
  useRecords(vaultId: string): { data?: readonly GridRecord[] };
  /**
   * A hook: the relations a record takes part in (the Solution of lines read them). `isPending` while read; `isError` when it failed.
   * GilbApp: useRelations(record.id, record.entityUri ?? null), PlanTagLinks.tsx:908 (lib/base/relationHooks.ts:14).
   */
  useRelations(id: string | null, at: string | null): PlanRelationsRead;
  /**
   * A hook: the records whose `attr` link points at `parent` (`"a:fvParent"` for the sub-functions, `"a:measures"` for the Values of a Function),
   * found in the plan vault. `data.rows` are the records read, `total` how many exist, `capped` and `unread` say what is missing.
   * GilbApp: usePlanFind(planVault, attr, record), PlanTagLinks.tsx:443 and :484 (lib/base/planFind.ts:286).
   */
  usePlanFind(planVault: string, attr: string, parent: { id: string; entityUri?: string } | null): PlanFindRead;
  /**
   * Read the find of this line again, and the records in it.
   * GilbApp: invalidatePlanFind(qc, planVault, attr, record.id), PlanTagLinks.tsx:446 and :490 (lib/base/planFind.ts:265).
   */
  invalidatePlanFind(planVault: string, attr: string, parentId: string): void | Promise<void>;
  /**
   * Drop every plan picker's finished search in this vault; an open picker asks again.
   * GilbApp: invalidatePlanSearch(qc, planVault), PlanTagLinks.tsx:409, :590, :785, :995, :1126 (lib/base/planSearch.ts:25).
   */
  invalidatePlanSearch(planVault: string): void;
  /**
   * The newest of the screen list's row, the cached record read and `fallback`, as a list row.
   * GilbApp: liveRow(qc, vaultId, id, fallback), PlanTagLinks.tsx:349 and eight more (lib/base/planRowCache.ts:101).
   */
  liveRow(vaultId: string, id: string, fallback: BaseRecord): GridRecord;
  /**
   * Read a missing ETag before a patch is built. `{ row }` to go on with; `{ conflict: true }` when `sameFor` says the fresh read differs in a field
   * the write touches; `{ unreadable: true }` when no ETag could be read. A row that has an ETag is returned as it is.
   * GilbApp: ensureEtagUnchanged(qc, planVault, target, sameFor), PlanTagLinks.tsx:159 and :660 (lib/base/planRowCache.ts:148).
   */
  ensureEtagUnchanged(
    planVault: string,
    row: GridRecord,
    sameFor: (fresh: GridRecord) => boolean,
  ): Promise<{ row: GridRecord } | { conflict: true } | { unreadable: true }>;
  /**
   * The row with the patch applied and the new ETag.
   * GilbApp: applyPatch(row, patch, etag), PlanTagLinks.tsx:170 and :670 (lib/base/planRowCache.ts:30).
   */
  applyPatch(row: GridRecord, patch: PlanLinkPatch, etag: string | null): GridRecord;
  /**
   * Replace the row in every list that already holds it (`insert` adds it to the record's own vault list).
   * GilbApp: storePlanRow(qc, planVault, row), PlanTagLinks.tsx:171 and :671 (lib/base/planRowCache.ts:117).
   */
  storePlanRow(planVault: string, row: BaseRecord, opts?: { insert?: boolean }): void;
  /**
   * Put the row in the cache of the record read, under the record's id and address.
   * GilbApp: qc.setQueryData(planRecordKey(id, at), row), PlanTagLinks.tsx:172 and :672 (planRecordKey: lib/base/planFind.ts:53).
   */
  setPlanRecord(id: string, at: string, row: BaseRecord): void;
  /**
   * Take the record off the find of this line at once, and read the find again.
   * GilbApp: dropPlanFind(qc, planVault, attr, parentId, id), PlanTagLinks.tsx:175 (lib/base/planFind.ts:338).
   */
  dropPlanFind(planVault: string, attr: string, parentId: string, id: string): void;
  /**
   * Show the row on the find of this line at once, and read the find again.
   * GilbApp: prependPlanFind(qc, planVault, attr, parentId, row), PlanTagLinks.tsx:176 and :607 (lib/base/planFind.ts:310).
   */
  prependPlanFind(planVault: string, attr: string, parentId: string, row: BaseRecord): void;
  /**
   * Add a made record to the lists (`insert: true` adds it to the vault's own list).
   * GilbApp: putRecordInCaches(qc, planVault, row, { insert: true }), PlanTagLinks.tsx:606 (lib/base/recordHooks.ts:1807).
   */
  putRecordInCaches(planVault: string, row: BaseRecord, opts?: { insert?: boolean }): void;
  /**
   * The cached relations of a record, or undefined when none are cached.
   * GilbApp: qc.getQueryData<RecordRelation[]>(relationsKey(id, at)), PlanTagLinks.tsx:839-840 (relationsKey: lib/base/relations.ts:59).
   */
  getRelations(id: string, at: string | null): RecordRelation[] | undefined;
  /**
   * Set the cached relations of a record: to a list, or to what `next` makes of the cached one (undefined when none).
   * GilbApp: qc.setQueryData(relationsKey(id, at), next), PlanTagLinks.tsx:841 and :957, :1087.
   */
  setRelations(
    id: string,
    at: string | null,
    next: RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[]),
  ): void;
  /**
   * The record type for a local id (`"function"`, `"solution"`), or null when this app cannot create it.
   * GilbApp: resolveType(id), PlanTagLinks.tsx:402, :778, :983, :1114 (lib/base/recordTypes.ts:457).
   */
  resolveType(id: string): PlanTypeSpec | null;
  /**
   * The type address a record of this type name is made with.
   * GilbApp: typeUriForVaultNamespace(typeName, planVault), PlanTagLinks.tsx:585, :594, :784 (lib/base/recordTypes.ts:102).
   */
  typeUriForVaultNamespace(typeName: string, vaultNamespace: string): string;
  /**
   * The address of a record: the preferred address when it is absolute, else the id when it is, else `<namespace>/e/<id>`.
   * GilbApp: memberEntityUri(id, null, planVault), PlanTagLinks.tsx:593 and :786 (lib/base/relationWrite.ts:99).
   */
  memberEntityUri(idOrUri: string, preferredUri?: string | null, vaultNamespace?: string | null): string;
  /**
   * Read one record at its address; null when it does not exist. The chain check of Part of reads parents with it, and the
   * Part of System line reads a record it just made. A rejection is caught by the callers. Handed to `wouldLoop` as a plain function.
   * GilbApp: readRecord(id, at), PlanTagLinks.tsx:386 (as the argument of wouldLoop) and :1276 (lib/base/records.ts:645).
   */
  readRecord(id: string, at: string | null): Promise<BaseRecord | null>;

  // ---- writers: optional ----

  /**
   * Merge-patch a record. `source` says which slugs came off the served document (`writeSource(row)[0]`, or undefined),
   * `precondition.ifMatch` is the ETag the write is made against. Resolves with the new ETag.
   * GilbApp: patchRecord(id, patch, at, source, precondition), PlanTagLinks.tsx:168-169 and :668-669 (lib/base/records.ts:963).
   * Absent: Part of, Function of Value and Value of Function are read-only.
   */
  patchRecord?(
    id: string,
    patch: PlanLinkPatch,
    at: string | null,
    source: WriteSource | undefined,
    precondition?: { ifMatch?: string | null },
  ): Promise<{ etag: string | null }>;
  /**
   * Make a record of this type in the plan vault; `nameHint` is the tag. Resolves with its id and first ETag.
   * GilbApp: createRecord(planVault, typeUri, facts, nameHint), PlanTagLinks.tsx:585 and :784 (lib/base/records.ts:522).
   * Absent: Function of Value and Value of Function are read-only.
   */
  createRecord?(
    planVault: string,
    typeUri: string,
    facts: PlanCreateFacts,
    nameHint?: string,
  ): Promise<{ id: string; etag: string | null }>;
  /**
   * A hook: the optimistic create of a record. `mutateAsync` makes a record of `type` with `facts` (the tag only when `nameOnly`) and
   * resolves with its id, ETag and address.
   * GilbApp: useCreateRecord(planVault), PlanTagLinks.tsx:321, :910, :1041 (lib/base/recordHooks.ts:1948).
   * Absent: Part of, Solution of and Solutions are read-only.
   */
  useCreateRecord?(planVault: string): {
    mutateAsync(args: { type: PlanTypeSpec; facts: Record<string, string>; nameOnly?: boolean }): Promise<PlanCreated>;
  };
  /**
   * Write one t:SolutionOf relation between two records. Resolves with the relation's id and its address when the vault gave one.
   * GilbApp: writePairRelation({ sourceId, targetId, sourceEntityUri, targetEntityUri, typeCurie, roles, vaultNamespace }),
   * PlanTagLinks.tsx:827 (lib/base/relationWrite.ts:217). Absent: Solution of and Solutions are read-only.
   */
  writePairRelation?(input: {
    sourceId: string;
    targetId: string;
    sourceEntityUri: string;
    targetEntityUri: string;
    typeCurie: string;
    roles: { source: string; target: string };
    vaultNamespace: string;
  }): Promise<{ id: string; uri?: string | null }>;
  /**
   * End a relation by its address (or id), in the plan vault.
   * GilbApp: endRelation(relation, planVault), PlanTagLinks.tsx:956 and :1086 (lib/base/relationWrite.ts:491).
   * Absent: Solution of and Solutions are read-only.
   */
  endRelation?(relation: string, planVault: string): Promise<unknown>;
  /**
   * The create dialog, drawn only after "Create System" is pressed.
   * GilbApp: <ConnectedCreateDialog open stakeholders source={null} drawnVaultIds={[vaultId, planVault]} initialTypeOption onClose onCreated />,
   * PlanTagLinks.tsx:1266-1291 (components/records/ConnectedCreateDialog.tsx:310). Absent: Part of System is read-only.
   */
  ConnectedCreateDialog?: ComponentType<PlanTagLinksCreateDialogProps>;
}

/** The provider the link lines read. With none, each of them throws an error that names it. */
export const PlanTagLinksHostContext = createContext<PlanTagLinksHost | null>(null);
