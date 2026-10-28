// What the Plan card needs from the app it sits in. Each member replaces one call the source made outside the unit and outside
// the units it draws; its doc comment names that call (GilbApp src/components/records/PlanFunctionForm.tsx, `PFF`, or
// PersonAuthoritySearch.tsx, `PA`, line numbers from those files). A member named `useX` is a React hook: the card calls it on
// every render, in the place the source called its hook, never conditionally. The line units the card draws (Stakeholder,
// Description, Part of, Source, the Value lines and the rest) each have a host context of their own; the app mounts those
// itself, see the README. This context is the card's own.

import { createContext, useContext, type ReactNode } from "react";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { AuthorityWrite, StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import type { PickerFind } from "@kaigilb/gilbplatformcode-record-picker";
import type { TypeOption, TypeSearchFn } from "@kaigilb/gilbplatformcode-type-chooser";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { PlanFind } from "./planFind";
import type { MergePatchValue, WriteSource } from "./writeSource";

/** The result of a find of linked records. `data` is read for the rows, `isLoading` and `isError` for the line's state. */
export type PlanFindQuery = {
  data?: PlanFind;
  isLoading: boolean;
  isError: boolean;
};

/** The relations a record takes part in, as read. `data`, `isPending` and `isError` are read. */
export type RelationsQuery = {
  data?: RecordRelation[];
  isPending: boolean;
  isError: boolean;
};

/** The app's session, as far as the person search reads it: the vaults the person can reach. */
export type PlanCardShell = {
  vaults?: readonly unknown[];
};

/** What the dialog that creates a person (a stakeholder record) is given. The host draws it. */
export interface CreateStakeholderProps {
  open: true;
  stakeholders: true;
  source: null;
  /** The dialog opens on this type. */
  initialTypeId: "person";
  /** The vaults whose records the dialog may offer. */
  drawnVaultIds: string[];
  onClose: () => void;
  /** Called with the new record's id, or its address. */
  onCreated: (id: string) => void;
}

export interface PlanCardHost {
  // ---- Reads (hooks): called on every render, in the order the source called them ----

  /**
   * The signed-in person as a source, or null when unknown (a value is then written with no source added). Replaces
   * `useSelfSource()` (PFF:480). Read again on every render.
   */
  useSelfSource(): { "@id": string } | null;

  /**
   * The relations the record takes part in. Replaces `useRelations(record.id, record.entityUri ?? null)` (PFF:488).
   */
  useRelations(recordId: string, recordUri: string | null): RelationsQuery;

  /**
   * The find of the records linked to `parent` by `attr`, or an unused find when `parent` is null. `cap` is how many it pages to
   * (absent: the app's default of 300). The card asks `"a:fvParent"` (sub-functions), `"a:measures"` (functions of a value) and
   * `"a:partOf"` (the parts of a record; a Value's children). Replaces `usePlanFind(planVault, attr, parent, cap)` (PFF:491,
   * :492, :494).
   */
  usePlanFind(
    vaultId: string,
    attr: string,
    parent: { id: string; entityUri?: string } | null,
    cap?: number,
  ): PlanFindQuery;

  /**
   * The Authorities of the record that are people. `pending` and `error` mean the card does not yet know. Replaces
   * `usePersonAuthorities(record, vaultId)` (PFF:566). Only `people` (its length), `pending` and `error` are read.
   */
  usePersonAuthorities(
    record: { id: string; entityUri?: string | null },
    vaultId: string,
  ): { people: readonly unknown[]; pending: boolean; error: boolean };

  /**
   * The retype of a record to another type. Replaces `useRetypeRecord(vaultId)` (PFF:545); the card calls
   * `mutateAsync({ record, typeName })` (PFF:865). The hook also updates the app's caches. A writer: leave it out and the card is
   * read-only.
   */
  useRetypeRecord?(vaultId: string): {
    mutateAsync(vars: { record: BaseRecord; typeName: string }): Promise<unknown>;
  };

  // ---- The person search (Authority of a constraint being made) ----

  /** The session. Replaces `useShell()` (PA:26). Only `vaults` is read. */
  useShell(): PlanCardShell;

  /**
   * The ids of the vaults the person can read, from the session's vaults. Replaces `heldVaultIds(shell.vaults ?? [])` (PA:27;
   * `workingSetLoadVaults.ts:44`). Called on every render, so the search callback changes with every render, as in the source.
   */
  heldVaultIds(vaults: readonly unknown[]): string[];

  /**
   * The stakeholder kinds the master serves. Replaces `useQuery(STAKEHOLDER_TYPE_SET_QUERY)` (PA:28). Only `data` is read.
   */
  useStakeholderKindSet(): { data?: StakeholderTypeSet };

  /**
   * Records whose name matches `text`, of the person kind names. Replaces `findStakeholderRecords(vaults, names, q)` (PA:30;
   * `planStakeholders.ts:322`).
   */
  findStakeholderRecords(
    vaultIds: readonly string[],
    typeNames: readonly string[],
    text: string,
  ): Promise<PickerFind>;

  // ---- The Type line's picker (the Type field of a card is a unit that takes these as props) ----

  /**
   * The GilbVeda type search the Type picker asks. Called without a receiver. Replaces the default `search = searchLiveTerms` of the
   * app's TypeChooser (`TypeChooser.tsx:151`), which GilbApp's PlanTypeField left in place (the card passed none).
   */
  searchTypes: TypeSearchFn;

  /**
   * The sentence the Type picker shows before the first answer, about how far its search reaches. Replaces `BLANK_QUERY_REACH`
   * (`typeSearch.ts:553`, the first value of the `reach` state at `TypeChooser.tsx:176`).
   */
  blankReach: string;

  /**
   * Opens a type's page in the ontology. Called without a receiver. Leave it out and the Type popovers have no "Open in Ontology"
   * button. Replaces `shell?.openOntologyConcept?.(n)` (`PlanTypeField.tsx:51, :90, :101, :118`).
   */
  openOntologyConcept?(typeName: string): void;

  /**
   * Draws the icon of a type option in the Type picker. Leave it out and no icon is drawn. Replaces `TypeIcon` (`TypeChooser.tsx:364-368,
   * :483-489`).
   */
  renderTypeIcon?(option: TypeOption, className: string): ReactNode;

  // ---- Click-time getters: called when the person acts, never snapshotted at render ----

  /**
   * The relations of a record as the app holds them now, or `undefined`. Replaces
   * `qc.getQueryData<RecordRelation[]>(relationsKey(id, uri))` (PFF:624, :631).
   */
  getRelations(recordId: string, recordUri: string | null): RecordRelation[] | undefined;

  /**
   * The stakeholder kinds as the app holds them now. Replaces `qc.getQueryData<StakeholderTypeSet>(STAKEHOLDER_TYPE_SET_QUERY_KEY)`
   * (PFF:846, :1418).
   */
  getKindSet(): StakeholderTypeSet | undefined;

  /**
   * The newest copy of a record the app holds, from its list and its own read, falling back to `fallback`. Each call keeps the
   * vault it is given. Replaces `liveCachedRow(qc, planVault, id, fallback)` (PFF:583, :601, :669, :868; `planRowCache.ts:101`).
   */
  liveRow(vaultId: string, id: string, fallback: BaseRecord): GridRecord;

  /**
   * Reads a record. The card passes the PLAN vault id as `at` (the source did, in the slot for the record's address). Replaces
   * `readRecord(id, planVault)` (PFF:845).
   */
  readRecord(id: string, at: string | null): Promise<BaseRecord | null>;

  /**
   * The address of a record from its id, the address the list gave, and the vault namespace. Replaces
   * `memberEntityUri(id, null, planVault)` (PFF:851; `relationWrite.ts:99`).
   */
  memberEntityUri(idOrUri: string, preferredUri?: string | null, vaultNamespace?: string | null): string;

  /**
   * Reads a missing ETag before the patch is built; `{ conflict: true }` when that read shows a different copy of a field the write
   * touches (`sameFor(fresh)` is false), `{ unreadable: true }` when it still has no ETag. A row passed with `etag: null` MUST be
   * read again. Replaces `ensureEtagUnchanged(qc, planVault, row, sameFor)` (PFF:584; `planRowCache.ts:148`).
   */
  ensureEtagUnchanged(
    vaultId: string,
    row: GridRecord,
    sameFor: (fresh: GridRecord) => boolean,
  ): Promise<{ row: GridRecord } | { conflict: true } | { unreadable: true }>;

  /**
   * The row with a patch applied to it, as the app's list holds it. Replaces `applyPatch(ready, patch, etag)` (PFF:642;
   * `planRowCache.ts:30`).
   */
  applyPatch(
    row: GridRecord,
    patch: Record<string, MergePatchValue>,
    etag: string | null,
    opts?: { keepOpaque?: boolean },
  ): GridRecord;

  /**
   * True for exactly the error the patch writer raises when the version check fails (HTTP 412). Replaces
   * `e instanceof RecordConflictError` (PFF:654). A 409 is not a conflict here.
   */
  isConflict(e: unknown): boolean;

  /**
   * The record as the vault has it after a refused write, put in the app's lists; `null` when it cannot be read. Replaces
   * `reconcileAfterConflict(qc, planVault, ready)` (PFF:655; `planRowCache.ts:162`).
   */
  reconcileAfterConflict(vaultId: string, row: { id: string; entityUri?: string | null }): Promise<BaseRecord | null>;

  // ---- Cache writes (always required; a host with no writers may give no-ops) ----

  /** Puts a saved row in the app's lists. Replaces `storePlanRow(qc, planVault, stored)` (PFF:643; `planRowCache.ts:117`). */
  storePlanRow(vaultId: string, row: BaseRecord, opts?: { insert?: boolean }): void;

  /** Puts a saved row in the app's read of that one record. Replaces `qc.setQueryData(planRecordKey(id, entityUri), stored)` (PFF:645). */
  setRecordRead(id: string, entityUri: string, row: BaseRecord): void;

  /**
   * Replaces the relations the app holds for a record, with the new list or with a function of the old one. Replaces
   * `qc.setQueryData(relationsKey(id, uri), next)` (PFF:632) and `qc.setQueryData<RecordRelation[]>(relationsKey(id, uri), (prev) => ...)`
   * (PFF:876).
   */
  setRelations(
    recordId: string,
    recordUri: string | null,
    next: RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[]),
  ): void;

  /**
   * Drops the app's cached person searches for the Authority and fetches again the ones on screen. Replaces
   * `qc.invalidateQueries({ queryKey: ["stakeholder-search", "authority"], refetchType: "active" })` (PFF:1468).
   */
  invalidateAuthoritySearch(): void | Promise<unknown>;

  // ---- Writers (optional). Leave any one of the four out and the card is read-only: it behaves as with `canEdit` false. ----

  /**
   * Patches facts of a record, with the version it was read at as the If-Match. `source` is `undefined` when the record carries no
   * served document. Replaces `patchRecord(id, patch, at, source, pre)` (PFF:640, :641; `records.ts:963`). Raises the error
   * `isConflict` recognises when the version check fails.
   */
  patchRecord?(
    id: string,
    patch: Record<string, MergePatchValue>,
    at: string | null,
    source: WriteSource | undefined,
    precondition?: { ifMatch?: string | null },
  ): Promise<{ etag: string | null }>;

  /**
   * Writes the Authority relation for the older record-level holder of a row that still has one (the next save of the row
   * migrates it); `null` when the row has none, `{ relation: null }` when the relation is already there. The card passes the
   * VAULT id the screen shows (not the plan vault). Replaces `migratedAuthorityRelation(ready, vaultId, known)` (PFF:625;
   * `planStakeholders.ts:275`).
   */
  migratedAuthorityRelation?(
    row: { id: string; entityUri?: string | null; facts?: Record<string, string>; served?: { facts?: Record<string, unknown> } },
    vaultId: string,
    relations: readonly RecordRelation[] | null | undefined,
  ): Promise<{ relation: RecordRelation | null } | null>;

  /**
   * Writes one Authority relation. The card passes the PLAN vault id as `vaultId`. Replaces `writeAuthorityRelation({ recordId,
   * recordUri, stakeholderUri, vaultId })` (PFF:869; `planStakeholders.ts:236`).
   */
  writeAuthorityRelation?(input: AuthorityWrite): Promise<RecordRelation>;

  // ---- Dialog ----

  /**
   * The dialog that creates a person. The card calls this as a function while the dialog is open; if yours uses hooks, return an
   * element of a component of your own. Replaces `<ConnectedCreateDialog open stakeholders source={null} initialTypeId="person"
   * drawnVaultIds onClose onCreated />` (PFF:1459-1470).
   */
  renderCreateStakeholder(props: CreateStakeholderProps): ReactNode;
}

export const PlanCardHostContext = createContext<PlanCardHost | null>(null);

export function usePlanCardHost(): PlanCardHost {
  const host = useContext(PlanCardHostContext);
  if (!host) throw new Error("plan-card: wrap the app in <PlanCardHostContext.Provider value={host}>");
  return host;
}
