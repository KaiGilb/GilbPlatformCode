// What the Stakeholder, Authority and Resource Owner lines need from the app they sit in. Each member replaces one call the
// source made outside the unit; its doc comment names that call (GilbApp src/components/records/PlanStakeholders.tsx, line numbers
// from that file unless another file is named). A member named `useX` is a React hook: the lines call it on every render, in the
// place the source called its hook, never conditionally.

import { createContext, useContext, type ReactNode } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { AuthorityWrite, RelationDoc, StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import type { OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { MergePatchValue, WriteSource } from "./writeSource";

/** A search for records: the hits, whether the answer is whole, and whether a vault's own search failed. */
export type StakeholderFind = {
  hits: OrgRecordHit[];
  complete: boolean;
  /** A vault's search or list failed. The other vaults' hits are still returned. */
  vaultsMissed: boolean;
};

/** What a write of one stakeholder relation takes. */
export interface PairRelationWrite {
  sourceId: string;
  targetId: string;
  sourceEntityUri: string | null;
  targetEntityUri: string | null;
  typeCurie: string;
  roles: { source: string; target: string };
  extraFacts: Record<string, unknown>;
  vaultNamespace: string;
}

/** Open a record in the vault its address names. */
export type OpenRecordInVault = (vaultId: string, recordId: string, opts?: { push?: boolean }) => void;

/** The result of a relation read: the relations the record takes part in, and whether the read failed. */
export type RelationsRead = { data?: RecordRelation[]; isError: boolean };

/** What the dialog that creates a stakeholder record is given. The host draws it. */
export interface CreateStakeholderProps {
  open: true;
  stakeholders: true;
  source: null;
  /** The vaults whose records the dialog may offer. */
  drawnVaultIds: string[];
  onClose: () => void;
  /** Called with the new record's id, or its address. */
  onCreated: (id: string) => void;
}

export interface StakeholderLinesHost {
  // ---- Reads (hooks): called on every render, in the order the source called them ----

  /** The records already loaded for a vault. Replaces `useRecords(vaultId)` (:128). Only `data` is read. */
  useRecords(vaultId: string): { data?: readonly BaseRecord[] };

  /**
   * The cached read of one record, by its address, that the record-name hook of `entity-ref-value` fills. It never fetches on its
   * own. Replaces the `useQuery` with `enabled: false` and key `["base", "record", id, origin of ref?.uri ?? uri]` (:134-139).
   * Only `data.facts` is read.
   */
  useRecordRead(ref: { id: string; uri: string } | null, uri: string): { data?: BaseRecord | null };

  /**
   * The record's MAIN tag, read from the platform, whose `@handle` the chip shows. A hook, called on every render for every chip, after
   * `useRecordRead` and not gated: one request per chip, key `["main-tag", entityUri]`. Replaces `useMainTag(uri)` (:144, from
   * recordTags.ts); the app's options are `staleTime: 60_000, retry: false, refetchOnWindowFocus: false`. Only `data` is read: `known` and `tag`.
   * While the answer is pending, or `known` is false, or `tag` is null, no `@handle` is drawn; the record's `tagString` fact is no fallback.
   */
  useMainTag(entityUri: string | null | undefined): { data?: { known: boolean; tag: string | null } };

  /**
   * The relations the record takes part in. Replaces `useRelations(record.id, record.entityUri ?? null)` (:229, :626). `data`
   * and `isError` are read.
   */
  useRelations(recordId: string, recordUri: string | null): RelationsRead;

  /**
   * The stakeholder kinds the master serves. `enabled` is true while the picker is shown. Replaces
   * `useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled: showPicker })` (:230, :628). Only `data` is read.
   */
  useStakeholderKinds(enabled: boolean): { data?: StakeholderTypeSet };

  /**
   * The Authorities of the record whose stakeholder record is a person. Replaces `usePersonAuthorities(record, vaultId)` (:627,
   * from useConstraintPeople.ts:74). Only `people` is read.
   */
  usePersonAuthorities(record: BaseRecord, vaultId: string): { people: readonly { uri: string }[] };

  /**
   * The ids of the vaults the person holds. The array must keep its identity while the vaults do not change (it is a dependency of
   * callbacks). Replaces `useHeldVaults()` (:174-177: `useShell()` then `useMemo(() => heldVaultIds(shell.vaults ?? []), ...)`).
   */
  useHeldVaults(): string[];

  /**
   * How to open a record in another vault, or `undefined` when the app cannot. Replaces `useShell().openRecordInVault`
   * (:110, :116-122).
   */
  useOpenRecordInVault(): OpenRecordInVault | undefined;

  /**
   * The relation document of one Authority relation, read for its "acts for". `relation` is null for the older record-level
   * holder (nothing to read). Replaces the `useQuery` with key `["plan", "authority-relation", relation ?? ""]`, `queryFn`
   * `readRelationDoc(relation!, planVault)`, `enabled: !!relation`, stale time 15 000 ms, no retry (:537-543). Only `data` is read.
   */
  useRelationDoc(relation: string | null, planVault: string): { data?: RelationDoc | null };

  /** Whether the record carries the app's "unknown type" marker as its type. Replaces `hasSubstitutedType(record)` (:244, from records.ts:357). */
  hasSubstitutedType(record: Pick<BaseRecord, "typeUri" | "typeSubstituted">): boolean;

  // ---- Click-time getters: called when the person acts, never snapshotted at render ----

  /**
   * The relations of a record as the app holds them now, or `undefined`. Replaces
   * `qc.getQueryData<RecordRelation[]>(relationsKey(id, uri))` (:270, :298, :674).
   */
  getRelations(recordId: string, recordUri: string | null): RecordRelation[] | undefined;

  /** The stakeholder kinds as the app holds them now. Replaces `qc.getQueryData(STAKEHOLDER_TYPE_SET_QUERY_KEY)` (:669). */
  getKindSet(): StakeholderTypeSet | undefined;

  /**
   * The newest copy of a record the app holds, from its list and its own read, falling back to `fallback`. Replaces
   * `liveRow(qc, planVault, id, fallback)` (:253, :271, :284, :686, :719, :750, :763, from planRowCache.ts:101).
   */
  liveRow(planVault: string, id: string, fallback: BaseRecord): GridRecord;

  /** Read one record. Replaces `readRecord(id, at)` (:482, :928, :931). */
  readRecord(id: string, at: string | null): Promise<BaseRecord | null>;

  /**
   * The address of a record from its id, the address the list gave, and the vault namespace. Replaces
   * `memberEntityUri(idOrUri, preferredUri, vaultNamespace)` (:269, :324, :483, :707, :929, from relationWrite.ts:99).
   */
  memberEntityUri(idOrUri: string, preferredUri?: string | null, vaultNamespace?: string | null): string;

  /** Records whose name matches `text`, typed by the stakeholder kind names. Replaces `findStakeholderRecords(vaults, names, text)` (:443, :650, from planStakeholders.ts:322). */
  findStakeholders(vaults: readonly string[], names: readonly string[], text: string): Promise<StakeholderFind>;

  /** Records of any kind whose name matches `text`. Replaces `findAnyRecords(vaults, text)` (:661, from planStakeholders.ts:378). */
  findAnyRecords(vaults: readonly string[], text: string): Promise<StakeholderFind>;

  /**
   * Read a missing ETag before the patch is built; `{ conflict }` when that read shows a different copy of a field the write
   * touches, `{ unreadable }` when it still has no ETag. Replaces `ensureEtagUnchanged(qc, planVault, row, sameFor)` (:88, from
   * planRowCache.ts:148).
   */
  ensureEtagUnchanged(
    planVault: string,
    row: GridRecord,
    sameFor: (fresh: GridRecord) => boolean,
  ): Promise<{ row: GridRecord } | { conflict: true } | { unreadable: true }>;

  /** The row with a patch applied to it, as the app's list holds it. Replaces `applyPatch(row, patch, etag, opts)` (:104, from planRowCache.ts:30). */
  applyPatch(
    row: GridRecord,
    patch: Record<string, MergePatchValue>,
    etag: string | null,
    opts?: { keepOpaque?: boolean },
  ): GridRecord;

  /** Put a saved row in the app's lists. Replaces `storePlanRow(qc, planVault, row)` (:105, from planRowCache.ts:117). */
  storePlanRow(planVault: string, row: BaseRecord, opts?: { insert?: boolean }): void;

  /** Put a saved row in the app's record read. Replaces `qc.setQueryData(planRecordKey(id, at), row)` (:106). */
  setRecordRead(id: string, at: string, record: BaseRecord): void;

  /**
   * Replace the relations the app holds for a record, with the new list or with a function of the old one. Replaces
   * `qc.setQueryData(relationsKey(id, uri), next)` (:306, :313, :347, :679, :807).
   */
  setRelations(
    recordId: string,
    recordUri: string | null,
    next: RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[]),
  ): void;

  /**
   * Drop the app's cached searches that match `queryKey`. The picker's own key is `["stakeholder-search", role, vaultsKey, text]`
   * (role `line`, `authority`, `owner` or `acts`): pass the same key to the query hook given to the picker. Replaces
   * `qc.invalidateQueries({ queryKey, refetchType? })` (:198, :478, :923).
   */
  invalidateSearch(filters: { queryKey: readonly unknown[]; refetchType?: "active" }): void | Promise<unknown>;

  // ---- Writers (optional). Leave a line's writers out and that line is read-only: it behaves as with `editing` false. ----

  /** Write one relation between the record and a stakeholder. Replaces `writePairRelation(input)` (:286, from relationWrite.ts:217). */
  writePairRelation?(input: PairRelationWrite): Promise<{ id: string; uri?: string }>;

  /** End a relation. Replaces `endRelation(relation, vaultNamespace)` (:312, :346, :806, from relationWrite.ts:491). */
  endRelation?(relation: string, vaultNamespace: string): Promise<unknown>;

  /**
   * Patch facts of a record. `source` is `undefined` when the record carries no served document. Replaces
   * `patchRecord(id, patch, at, source, precondition)` (:102-103, from records.ts:963).
   */
  patchRecord?(
    id: string,
    patch: Record<string, MergePatchValue>,
    at: string | null,
    source: WriteSource | undefined,
    precondition?: { ifMatch?: string | null },
  ): Promise<{ etag: string | null }>;

  /** Write one Authority (or Resource Owner) relation. Replaces `writeAuthorityRelation(input)` (:741, :770, from planStakeholders.ts:236). */
  writeAuthorityRelation?(input: AuthorityWrite): Promise<RecordRelation>;

  /** End a relation, then write an Authority relation. Replaces `endThenWriteAuthority(endId, input)` (:741, :751, from planStakeholders.ts:266). */
  endThenWriteAuthority?(endId: string, input: AuthorityWrite): Promise<RecordRelation>;

  // ---- Dialog ----

  /**
   * The dialog that creates a stakeholder record. The lines call this as a function while the dialog is open; if yours uses hooks,
   * return an element of a component of your own. Replaces `<ConnectedCreateDialog open stakeholders source={null} drawnVaultIds
   * onClose onCreated />` (:470-488, :915-941). Counts as a writer: leave it out and the line is read-only.
   */
  renderCreateStakeholder?(props: CreateStakeholderProps): ReactNode;
}

export const StakeholderLinesHostContext = createContext<StakeholderLinesHost | null>(null);

export function useStakeholderLinesHost(): StakeholderLinesHost {
  const host = useContext(StakeholderLinesHostContext);
  if (!host) throw new Error("plan-stakeholder-lines: wrap the app in <StakeholderLinesHostContext.Provider value={host}>");
  return host;
}
