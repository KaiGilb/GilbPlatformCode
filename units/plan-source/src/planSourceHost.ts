// What the source control needs from the app around it: the shell, the held vaults, the stakeholder kinds, the Files list, the
// stakeholder search, one record read, the address of a record, and the create dialog.
// The unit never fetches or caches; each member is the call the source made, with the same arguments, at the same place.
// The host object must be the same object for as long as the provider is mounted.

import { createContext, type ComponentType } from "react";
import type { OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

/** The part of the app shell the control reads. */
export interface PlanSourceShell {
  /** The vaults the person can reach. Handed to `heldVaultIds` as they are; the unit reads nothing of them. */
  vaults?: readonly unknown[];
  /** Open a record in a vault. Absent: a click falls back to the `onOpen` prop. */
  openRecordInVault?: (vaultId: string, recordId: string, opts?: { push?: boolean }) => void;
}

/** One file of the Files list, as the control reads it. A host's own file type is assignable to this. */
export interface PlanSourceFile {
  id: string;
  /** The vault the file was listed from. */
  sourceVaultId: string;
  /** Absent or null: the control treats it as `t:File`. */
  typeUri?: string | null;
  name: string;
  updatedAt: number;
  /** A file without one is not offered. */
  entityUri?: string | null;
}

/** What `matchWorkingSetQuery` reads of an item, and the control hands it. */
export interface PlanSourceFacetItem {
  id: string;
  vaultId: string;
  typeUri: string;
  name: string;
  updatedAt: number;
}

/** What the stakeholder search answers. `vaultsMissed`: a vault's search or list failed; the other vaults' hits are still returned. */
export interface PlanSourceStakeholderFind {
  hits: OrgRecordHit[];
  complete: boolean;
  vaultsMissed: boolean;
}

/** The props the control gives the create dialog. */
export interface PlanSourceCreateDialogProps {
  open: boolean;
  /** Always true: the dialog is opened on the Stakeholders create form. */
  stakeholders: boolean;
  /** Always null: a plain create with no link section. */
  source: null;
  /** Always `[vaultId]`. */
  drawnVaultIds: string[];
  onClose: () => void;
  /** Called with the new record's id (or its address), once it exists. */
  onCreated: (id: string) => void;
}

export interface PlanSourceHost {
  /**
   * A hook, called twice per render (once to open a record, once for the vaults), never conditionally.
   * GilbApp: useShell(), components/records/PlanSource.tsx:64 and :105 (ShellContext).
   */
  useShell(): PlanSourceShell;
  /**
   * The ids of the vaults the person holds, from the shell's vaults.
   * GilbApp: heldVaultIds(shell.vaults ?? []), PlanSource.tsx:106 (lib/base/workingSetLoadVaults.ts:44-53).
   */
  heldVaultIds(vaults: readonly unknown[]): string[];
  /**
   * A hook: the names of the stakeholder kinds, read only while `enabled`. `data` is absent while they are read.
   * GilbApp: useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled: editing }), PlanSource.tsx:107 (lib/base/stakeholderKinds.ts:99-104).
   */
  useStakeholderTypes(enabled: boolean): { data?: { names: readonly string[] } };
  /**
   * A hook: the files of these vaults, merged, in the given lifecycle. Called with `[]` while the control is not being edited.
   * `isPending` is true while any vault's list is being read; `error` is set when one failed.
   * GilbApp: useVaultFilesMulti(editing ? vaults : [], "live"), PlanSource.tsx:109 (lib/base/fileHooks.ts:144-176).
   */
  useVaultFilesMulti(vaultIds: readonly string[], lifecycle: "live"): { data: readonly PlanSourceFile[]; isPending: boolean; error: unknown };
  /**
   * The items the Files section's own search matches for `query` (name, then type): case-insensitive; an empty query matches nothing.
   * GilbApp: matchWorkingSetQuery(items, text), PlanSource.tsx:55 (lib/base/workingSetFacets.ts:87-101).
   */
  matchWorkingSetQuery<T extends PlanSourceFacetItem>(items: readonly T[], query: string): T[];
  /**
   * The stakeholder records whose name matches `text`, across the vaults, typed by `typeNames`. An empty `typeNames` is not "none exist":
   * answer `complete: false`.
   * GilbApp: findStakeholderRecords(vaults, names, text), PlanSource.tsx:115 (lib/base/planStakeholders.ts:322-).
   */
  findStakeholderRecords(vaultIds: readonly string[], typeNames: readonly string[], text: string): Promise<PlanSourceStakeholderFind>;
  /**
   * Read one record; null when it cannot be read. A rejection is caught by the control.
   * GilbApp: readRecord(id, record.entityUri ?? vaultId), PlanSource.tsx:221 (lib/base/records.ts:645).
   */
  readRecord(id: string, at: string | null): Promise<BaseRecord | null>;
  /**
   * The address of a record: the preferred address when it is absolute, else the id when it is, else `<namespace>/e/<id>`.
   * GilbApp: memberEntityUri(id, null, vaultId), PlanSource.tsx:222 (lib/base/relationWrite.ts:99-).
   */
  memberEntityUri(idOrUri: string, preferredUri?: string | null, vaultNamespace?: string | null): string;
  /**
   * The create dialog, drawn only after "+ New stakeholder" is pressed. It makes a record, so a host that cannot create passes
   * `offerNewStakeholder={false}` and a component that renders nothing.
   * GilbApp: <ConnectedCreateDialog open stakeholders source={null} drawnVaultIds={[vaultId]} onClose onCreated />, PlanSource.tsx:210-228.
   */
  ConnectedCreateDialog: ComponentType<PlanSourceCreateDialogProps>;
}

/** The provider the control reads. With none, `PlanSource` throws an error that names it. */
export const PlanSourceHostContext = createContext<PlanSourceHost | null>(null);
