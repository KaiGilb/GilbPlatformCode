import type { QueryClient } from "@tanstack/react-query";
import type { OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import { defaultClaimFieldText, defaultClaimsAbout, defaultListPlaceClaimsInVault, defaultLoadPlaceNames } from "../defaults";
import { createHeldAddressMembers, heldAddressesKey } from "../heldAddresses";
import { PLACE_CLAIMS_STALE_MS, createIsGeoEntityId, placeClaimsKey } from "../inline";

export interface OneCardHostOptions {
  /** The origin of the shared world catalogue (the GilbGeo vault). Every address under its `/base/e/` is a catalogue row. Required. */
  geoOrigin: string;
  /**
   * The app's query client. With it (CHANGED, 0.5.0) the four place members are the real ones (`heldAddresses.ts`): the holder's addresses of a linked person,
   * read through the vault's one shared address read, and never half of them. Without it: nothing found, as before.
   */
  queryClient?: QueryClient;
  /** The four place members, when you give your own (each wins over the real one). Default: the real ones with a `queryClient`, else nothing found. */
  listPlaceClaimsInVault?: OneCardHost["listPlaceClaimsInVault"];
  claimsAbout?: OneCardHost["claimsAbout"];
  claimFieldText?: OneCardHost["claimFieldText"];
  loadPlaceNames?: OneCardHost["loadPlaceNames"];
}

/** The host of `one-card`. `isGeoEntityId` is GilbApp's over the `geoOrigin` prop; `placeClaimsKey` and `placeClaimsStaleMs` are its inline values; the four place members are the developer's or the safe stubs. */
export function createOneCardHost(options: OneCardHostOptions): OneCardHost {
  const real = options.queryClient ? createHeldAddressMembers(options.queryClient) : null;
  return {
    isGeoEntityId: createIsGeoEntityId(options.geoOrigin),
    listPlaceClaimsInVault: options.listPlaceClaimsInVault ?? real?.listPlaceClaimsInVault ?? defaultListPlaceClaimsInVault,
    claimsAbout: options.claimsAbout ?? real?.claimsAbout ?? defaultClaimsAbout,
    claimFieldText: options.claimFieldText ?? real?.claimFieldText ?? defaultClaimFieldText,
    loadPlaceNames: options.loadPlaceNames ?? real?.loadPlaceNames ?? defaultLoadPlaceNames,
    // CHANGED: with the real members the one card's observer has its own key (see `heldAddressesKey`); without them it is GilbApp's.
    placeClaimsKey: real ? heldAddressesKey : placeClaimsKey,
    placeClaimsStaleMs: PLACE_CLAIMS_STALE_MS,
  };
}
