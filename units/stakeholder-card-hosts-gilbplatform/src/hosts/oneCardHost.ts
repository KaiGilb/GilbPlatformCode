import type { OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import { defaultClaimFieldText, defaultClaimsAbout, defaultListPlaceClaimsInVault, defaultLoadPlaceNames } from "../defaults";
import { PLACE_CLAIMS_STALE_MS, createIsGeoEntityId, placeClaimsKey } from "../inline";

export interface OneCardHostOptions {
  /** The origin of the shared world catalogue (the GilbGeo vault). Every address under its `/base/e/` is a catalogue row. Required. */
  geoOrigin: string;
  /** The four place members. The online stakeholder card never calls them (it passes no address, so the held-address read is off); a record card would. Default: nothing found. */
  listPlaceClaimsInVault?: OneCardHost["listPlaceClaimsInVault"];
  claimsAbout?: OneCardHost["claimsAbout"];
  claimFieldText?: OneCardHost["claimFieldText"];
  loadPlaceNames?: OneCardHost["loadPlaceNames"];
}

/** The host of `one-card`. `isGeoEntityId` is GilbApp's over the `geoOrigin` prop; `placeClaimsKey` and `placeClaimsStaleMs` are its inline values; the four place members are the developer's or the safe stubs. */
export function createOneCardHost(options: OneCardHostOptions): OneCardHost {
  return {
    isGeoEntityId: createIsGeoEntityId(options.geoOrigin),
    listPlaceClaimsInVault: options.listPlaceClaimsInVault ?? defaultListPlaceClaimsInVault,
    claimsAbout: options.claimsAbout ?? defaultClaimsAbout,
    claimFieldText: options.claimFieldText ?? defaultClaimFieldText,
    loadPlaceNames: options.loadPlaceNames ?? defaultLoadPlaceNames,
    placeClaimsKey,
    placeClaimsStaleMs: PLACE_CLAIMS_STALE_MS,
  };
}
