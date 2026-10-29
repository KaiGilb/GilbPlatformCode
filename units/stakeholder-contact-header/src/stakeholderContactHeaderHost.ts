import { createContext, useContext } from "react";
import type { CatalogueEntry, ContactChip, LabelAxis } from "@kaigilb/gilbplatformcode-contact-kind-model";
import type { ResolveOutcome } from "@kaigilb/gilbplatformcode-person-connections";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

/** What the header reads of a vault profile discovery: the photo reference and the name on the owner's own card. */
export interface VaultProfilePhotoState {
  photoRef: string | null;
  /** The name on the owner's own card, taken from a document the discovery already read. Null when not read or when it carries no name. */
  personName?: string | null;
}

/** The vault the record is held in, as the target of a kind and by what it represents (the app's `KindVault`). */
export interface HeldKindVault {
  vaultId: string;
  /** The vault's own entity address; null = none minted. */
  entity: string | null;
  /** `a:vaultRepresents`; null = undeclared. */
  represents: string | null;
}

/** The arguments of the app's `useContactLabels` hook (`src/lib/contact/useContactLabels.ts:139`), as the header passes them. */
export interface ContactLabelsArgs {
  /** The vault that HOLDS the record. */
  vaultId: string | null | undefined;
  /** The contact's record (its entity IRI). */
  subject: string;
  /** The signed-in principal. */
  principal: string | null | undefined;
  /** The signed-in person's OWN vault. `null` = not known. */
  ownVaultId: string | null | undefined;
  /** The record's type (any spelling). */
  typeUri: string;
  kindVault?: HeldKindVault | null;
  enabled?: boolean;
  /** The chooser was opened: the lists to add from are wanted. */
  needOffers?: boolean;
}

/** The members of the app's `ContactLabelsState` (`useContactLabels.ts:69`) that the header and its chooser read. */
export interface ContactLabelsState {
  /** The chips on the contact, circle labels first; null while they are not read. */
  chips: ContactChip[] | null;
  /** What may be added now, per axis. */
  offered: Record<LabelAxis, CatalogueEntry[]>;
  /** The lists to add from are being read. */
  offersLoading: boolean;
  /** A list that could not be read whole, said once. */
  catalogueNote: string | null;
  /** The last add or remove that did not happen, and why. */
  actError: string | null;
  add: (entry: CatalogueEntry) => Promise<boolean>;
  /** Per catalogue entry a chip names, its `a:kindPredicate` reference (null = names none; undefined = not read yet). */
  entryPredicates: ReadonlyMap<string, string | null | undefined>;
}

/** The arguments of the app's `useHolderOriginLine` (`src/components/records/ContactCardSlots.tsx:156`). */
export interface HolderOriginLineArgs {
  vaultId: string | null;
  ownVaultId: string | null;
  recordEntityUri: string | null;
  linkedParty?: string | null;
  linked?: boolean;
  linkedLookupFailed?: boolean;
  linkAnswer?: ResolveOutcome["kind"] | null;
}

/** The members of the app that the header reaches. Each is called with the arguments and at the place named. */
export interface StakeholderContactHeaderHost {
  /**
   * Replaces `discoverVaultProfilePhoto(vaultEntityUri, vaultId)` (GilbApp `src/lib/base/vaultProfilePhoto.ts:269`), called at
   * `StakeholderContactHeader.tsx:89` in the query function of the holder's face (`["s5b-holder-face", vaultId]`).
   */
  discoverVaultProfilePhoto(vaultEntityUri: string | null | undefined, vaultId?: string | null): Promise<VaultProfilePhotoState>;
  /**
   * Replaces `loadPhotoObjectUrl(photoRef, door)` (`vaultProfilePhoto.ts:437`), called at GilbApp `StakeholderContactHeader.tsx:90` after a discovery that
   * found a photo reference, with the vault id as the door.
   */
  loadPhotoObjectUrl(photoRef: string, door?: string | null): Promise<string | null>;
  /**
   * Replaces `loadGranteeFace(principal, viewer)` (`src/lib/base/granteeFace.ts:108`), called at GilbApp `StakeholderContactHeader.tsx:150` in the
   * query function of their face (`["s5b-their-face", viewer, principal]`), only when they share a photo.
   */
  loadGranteeFace(principal: string, viewer: string | null): Promise<string | null>;
  /**
   * A hook. Replaces `useHolderOriginLine(args)` (`ContactCardSlots.tsx:156`), called at GilbApp `StakeholderContactHeader.tsx:215` on every render of
   * the header, in the same place as the app's call. Reads the held notes through the app's annotations route.
   */
  useHolderOriginLine(args: HolderOriginLineArgs): { origin: string | null; loading: boolean };
  /**
   * A hook. Replaces `useContactLabels(args)` (`src/lib/contact/useContactLabels.ts:139`), called at GilbApp `useHeaderRelations.ts:62` on every render
   * of the relations hook, before any query of it.
   */
  useContactLabels(args: ContactLabelsArgs): ContactLabelsState;
  /**
   * A hook. Replaces `useRelations(id, at)` (`src/lib/base/relationHooks.ts:14`; app options `staleTime: 15_000`, disabled for a null or temporary
   * id, key `relationsKey(id, at)`), called at GilbApp `useHeaderRelations.ts:101`.
   */
  useRelations(id: string | null, at: string | null): { data?: RecordRelation[] | undefined };
}

/** The provider the header reads. With none, it throws an error that names it. */
export const StakeholderContactHeaderHostContext = createContext<StakeholderContactHeaderHost | null>(null);

export function useStakeholderContactHeaderHost(): StakeholderContactHeaderHost {
  const host = useContext(StakeholderContactHeaderHostContext);
  if (!host) throw new Error("The stakeholder contact header needs a StakeholderContactHeaderHostContext.Provider above it.");
  return host;
}
