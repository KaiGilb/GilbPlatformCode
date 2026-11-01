import type { QueryClient } from "@tanstack/react-query";
import type { GeoPlace, OneCardHost, TheirPlaceRead } from "@kaigilb/gilbplatformcode-one-card";
import { readPlaceNames as readCataloguePlaceNames, type PlaceRead } from "@kaigilb/gilbplatformcode-place-names";
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { defaultClaimFieldText, defaultClaimsAbout, defaultListPlaceClaimsInVault, defaultLoadPlaceNames } from "../defaults";
import { createHeldAddressMembers, heldAddressesKey } from "../heldAddresses";
import { PLACE_CLAIMS_STALE_MS, createIsGeoEntityId, placeClaimsKey } from "../inline";

/** `readPlaceNames` of `place-names` as the one card's `TheirPlaceRead`: the row kept, a failure's reason dropped. */
function theirPlaceRead(read: PlaceRead): TheirPlaceRead {
  if (read.state === "named") {
    const place: GeoPlace = { id: read.place.id, label: read.place.label, type: read.place.type, memberOf: read.place.memberOf };
    return { state: "named", place };
  }
  if (read.state === "missing") return { state: "missing" };
  return { state: "failed" };
}

/** The spellings of an address's fields, from the ontology master. Rejects when the vocabulary cannot be read. */
const realAddressSpellings: NonNullable<OneCardHost["addressSpellings"]> = async () => {
  const v = await resolvePlaceVocab();
  return {
    label: v.placeClaimLabel,
    streetLine: v.streetLine,
    addressLine1: v.addressLine1,
    addressLine2: v.addressLine2,
    postalCode: v.postalCode,
    claimPlace: v.claimPlace,
  };
};

/** One answer per place id, in order. The catalogue read never rejects; each place carries its own answer. */
const realReadPlaceNames: NonNullable<OneCardHost["readPlaceNames"]> = async (ids) => {
  const reads = await readCataloguePlaceNames(ids);
  return reads.map(theirPlaceRead);
};

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
  /**
   * The spellings of an address's fields. Default: the real vocabulary (`resolvePlaceVocab` of `place-vocab`), always, with or
   * without a query client. Beyond the source (Kai, 2026-11-01).
   */
  addressSpellings?: OneCardHost["addressSpellings"];
  /**
   * One answer per place id. Default: `readPlaceNames` of `place-names`, mapped to `TheirPlaceRead`, always. Beyond the source (Kai, 2026-11-01).
   */
  readPlaceNames?: OneCardHost["readPlaceNames"];
}

/** The host of `one-card`. `isGeoEntityId` is GilbApp's over the `geoOrigin` prop; `placeClaimsKey` and `placeClaimsStaleMs` are its inline values; the four place members are the developer's or the safe stubs. `addressSpellings` and `readPlaceNames` are always the real ones (Beyond the source, Kai, 2026-11-01); a member the developer gives wins. */
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
    addressSpellings: options.addressSpellings ?? realAddressSpellings,
    readPlaceNames: options.readPlaceNames ?? realReadPlaceNames,
  };
}
