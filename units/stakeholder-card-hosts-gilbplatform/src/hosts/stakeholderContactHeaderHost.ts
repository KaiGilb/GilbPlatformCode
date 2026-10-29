import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import type { StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import {
  defaultDiscoverVaultProfilePhoto,
  defaultLoadGranteeFace,
  defaultLoadPhotoObjectUrl,
  defaultUseContactLabels,
  defaultUseHolderOriginLine,
} from "../defaults";

export interface StakeholderContactHeaderHostOptions {
  /** Finds the photo of a vault's profile. Default: none found, so the holder's face shows initials. */
  discoverVaultProfilePhoto?: StakeholderContactHeaderHost["discoverVaultProfilePhoto"];
  /** Loads a photo as an object URL. Default: null. */
  loadPhotoObjectUrl?: StakeholderContactHeaderHost["loadPhotoObjectUrl"];
  /** Loads the face of a person who shares one with the viewer. Default: null, so their photo is not drawn. */
  loadGranteeFace?: StakeholderContactHeaderHost["loadGranteeFace"];
  /** A HOOK: the held-note line of a placed person. Default: no origin, so no "Where / How we met" line. */
  useHolderOriginLine?: StakeholderContactHeaderHost["useHolderOriginLine"];
  /** A HOOK: the kind chips of a contact. Default: none, so no kind chips. */
  useContactLabels?: StakeholderContactHeaderHost["useContactLabels"];
}

/** The host of `stakeholder-contact-header`: `useRelations` is the one `plan-stakeholder-io` holds; the other five are the developer's or the defaults of `../defaults`. */
export function createStakeholderContactHeaderHost(options: StakeholderContactHeaderHostOptions = {}): StakeholderContactHeaderHost {
  return {
    discoverVaultProfilePhoto: options.discoverVaultProfilePhoto ?? defaultDiscoverVaultProfilePhoto,
    loadPhotoObjectUrl: options.loadPhotoObjectUrl ?? defaultLoadPhotoObjectUrl,
    loadGranteeFace: options.loadGranteeFace ?? defaultLoadGranteeFace,
    useHolderOriginLine: options.useHolderOriginLine ?? defaultUseHolderOriginLine,
    useContactLabels: options.useContactLabels ?? defaultUseContactLabels,
    useRelations,
  };
}
