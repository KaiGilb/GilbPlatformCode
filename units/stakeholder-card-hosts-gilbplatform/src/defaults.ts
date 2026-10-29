// The values a member takes when the developer gives none. Each is the value the census of the host members names for a member that no unit holds.

import type { ContactLabelsState, StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import type { OneCardHost } from "@kaigilb/gilbplatformcode-one-card";

/**
 * The photo members: without the developer's, the header draws initials and no photo. `discoverVaultProfilePhoto` finds no photo of the holder's
 * vault, `loadPhotoObjectUrl` loads none, `loadGranteeFace` shows none of theirs.
 */
export const defaultDiscoverVaultProfilePhoto: StakeholderContactHeaderHost["discoverVaultProfilePhoto"] = async () => ({ photoRef: null });
export const defaultLoadPhotoObjectUrl: StakeholderContactHeaderHost["loadPhotoObjectUrl"] = async () => null;
export const defaultLoadGranteeFace: StakeholderContactHeaderHost["loadGranteeFace"] = async () => null;

/** The held-note line: without the developer's there is no "Where / How we met" line. */
export const defaultUseHolderOriginLine: StakeholderContactHeaderHost["useHolderOriginLine"] = () => ({ origin: null, loading: false });

/**
 * The kind chips: without the developer's there are none. This is the value of GilbApp's `useContactLabels` (lib/contact/useContactLabels.ts:139)
 * in its disabled branch (`chips: null`, `offered` empty, `offersLoading` false, `catalogueNote` null, `actError` null, no entry predicates), which
 * is the only branch the online card reaches: `useHeaderRelations` passes `enabled: !!vaultId && !!record.entityUri` and the card's record has no
 * entity address. `add` is never reached by the card (it is read only); the source's `add` refuses to write for a card it cannot label, this one answers false.
 */
const NO_LABELS: ContactLabelsState = {
  chips: null,
  offered: { circleLabel: [], relationshipKind: [] },
  offersLoading: false,
  catalogueNote: null,
  actError: null,
  add: async () => false,
  entryPredicates: new Map(),
};
export const defaultUseContactLabels: StakeholderContactHeaderHost["useContactLabels"] = () => NO_LABELS;

/** The four place members: the entry never calls them (it passes no address to `OneCardBody`, so `useHeldAddresses` is off). The values are safe for the entry only. */
export const defaultListPlaceClaimsInVault: OneCardHost["listPlaceClaimsInVault"] = async () => [];
export const defaultClaimsAbout: OneCardHost["claimsAbout"] = () => [];
export const defaultClaimFieldText: OneCardHost["claimFieldText"] = () => "";
export const defaultLoadPlaceNames: OneCardHost["loadPlaceNames"] = async () => [];
