import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import type { StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import {
  defaultLoadGranteeFace,
  defaultLoadPhotoObjectUrl,
  defaultUseContactLabels,
  defaultUseHolderOriginLine,
  discoverWith,
} from "../defaults";
import { photoReadKeysOf, photoTermResolverFor } from "../photoTerm";

export interface StakeholderContactHeaderHostOptions {
  /**
   * The photo term's read keys, for the default `discoverVaultProfilePhoto`. Default: the term's resolver for the base origin as it is when asked
   * (GilbApp `photoReadKeys`, photoTerm.ts:37).
   */
  photoReadKeys?: () => Promise<readonly string[]>;
  /** Finds the photo of a vault's profile. Default: `discoverVaultProfilePhoto` of `vault-profile-photo` over {@link photoReadKeys}. */
  discoverVaultProfilePhoto?: StakeholderContactHeaderHost["discoverVaultProfilePhoto"];
  /** Loads a photo as an object URL. Default: `loadPhotoObjectUrl` of `vault-profile-photo`. */
  loadPhotoObjectUrl?: StakeholderContactHeaderHost["loadPhotoObjectUrl"];
  /** Loads the face of a person who shares one with the viewer. Default: `loadGranteeFace` of `grantee-face`. */
  loadGranteeFace?: StakeholderContactHeaderHost["loadGranteeFace"];
  /** A HOOK: the held-note line of a placed person. Default: no origin, so no "Where / How we met" line. */
  useHolderOriginLine?: StakeholderContactHeaderHost["useHolderOriginLine"];
  /** A HOOK: the kind chips of a contact. Default: none, so no kind chips. */
  useContactLabels?: StakeholderContactHeaderHost["useContactLabels"];
}

/** The host of `stakeholder-contact-header`: `useRelations` is the one `plan-stakeholder-io` holds; the other five are the developer's or the defaults (the three photo members are those of `vault-profile-photo` and `grantee-face`) of `../defaults`. */
export function createStakeholderContactHeaderHost(options: StakeholderContactHeaderHostOptions = {}): StakeholderContactHeaderHost {
  return {
    discoverVaultProfilePhoto:
      options.discoverVaultProfilePhoto ?? discoverWith(options.photoReadKeys ?? (() => photoReadKeysOf(photoTermResolverFor(baseOrigin()))())),
    loadPhotoObjectUrl: options.loadPhotoObjectUrl ?? defaultLoadPhotoObjectUrl,
    loadGranteeFace: options.loadGranteeFace ?? defaultLoadGranteeFace,
    useHolderOriginLine: options.useHolderOriginLine ?? defaultUseHolderOriginLine,
    useContactLabels: options.useContactLabels ?? defaultUseContactLabels,
    useRelations,
  };
}
