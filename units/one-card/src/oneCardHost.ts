// What the one card needs from the app that is in no unit: the MyNet place libraries (the held addresses of a person, and the names of
// the places they bind) and the geo address test. Each member is the call the source made, with the same arguments, at the same place.

import { createContext, useContext } from "react";
import type { PlaceLineClaim } from "@kaigilb/gilbplatformcode-place-lines";

/** One address a person keeps, as the card reads it: the fields `claimPlaceIds` reads, and the address of the claim's entity. */
export interface PlaceClaim extends PlaceLineClaim {
  /** Absolute entity URI. */
  readonly uri: string;
}

/** One place of the geo catalogue, as the card reads it. */
export interface GeoPlace {
  /** Absolute catalogue URI: the value a claim stores. */
  readonly id: string;
  readonly label: string;
  /** Bare type name as the catalogue declared it (`City`, `GeoAdminArea`, `Country`, ...). */
  readonly type: string;
  /** Parent extents this row declares, absolute and de-duplicated. May be empty. */
  readonly memberOf: readonly string[];
}

/** The four free-text terms of an address that the card reads. */
export type PlaceTextTerm = "streetLine" | "addressLine1" | "addressLine2" | "postalCode";

export interface OneCardHost {
  /**
   * Whether a value is the address of a place in the geo catalogue. Sync. Called for each value of theirs of a group when the card
   * decides whether to take the group off the card.
   * GilbApp: isGeoEntityId(value), lib/mynet/geo/baseGeo.ts:82 (called at OneCardBody.tsx:70).
   */
  isGeoEntityId(value: unknown): boolean;
  /**
   * Every address claim held in the vault. Async. Called as the query function of the shared address read.
   * GilbApp: listPlaceClaimsInVault(vaultId), lib/mynet/place/placeClaim.ts:522 (called at heldAddresses.ts:70).
   */
  listPlaceClaimsInVault(vaultId: string): Promise<PlaceClaim[]>;
  /**
   * The claims among those that are about this subject (the record's entity IRI). Sync. Called when the vault's claims arrive.
   * GilbApp: claimsAbout(claims, subject), lib/mynet/place/placeClaim.ts:632 (called at heldAddresses.ts:74).
   */
  claimsAbout(claims: readonly PlaceClaim[], subject: string): PlaceClaim[];
  /**
   * The free text of one text field of an address, wherever it is stored; "" when none. Sync. Called four times for each address
   * (street, Address 1, Address 2, Postal Code).
   * GilbApp: claimFieldText(claim, term), lib/mynet/place/placeClaim.ts:263 (called at heldAddresses.ts:48-51).
   */
  claimFieldText(claim: PlaceClaim, term: PlaceTextTerm): string;
  /**
   * The catalogue rows of these place ids. Async. Called from an effect, when the ids of the held addresses change.
   * GilbApp: loadPlaceNames(ids), lib/mynet/geo/usePlaceNames.ts:27 (called at heldAddresses.ts:81).
   */
  loadPlaceNames(ids: readonly string[]): Promise<GeoPlace[]>;
  /**
   * The query key of the vault's one shared address read. The app shares this key between the address group and the card, so the
   * card makes no request of its own. Sync. Called at render.
   * GilbApp: placeClaimsKey(vaultId), lib/mynet/place/usePlaceClaims.ts:50 (called at heldAddresses.ts:69). The app's value is
   * `["mynet", "place-claims", vaultId]`.
   */
  placeClaimsKey(vaultId: string): readonly unknown[];
  /**
   * How long, in milliseconds, a held vault read is taken as fresh when the card opens (the `staleTime` of the shared read).
   * GilbApp: PLACE_CLAIMS_STALE_MS = 60_000, lib/mynet/place/usePlaceClaims.ts:52 (read at heldAddresses.ts:71).
   */
  placeClaimsStaleMs: number;
}

/** The provider `OneCardBody` and `useHeldAddresses` read. With none, they throw an error that names it. */
export const OneCardHostContext = createContext<OneCardHost | null>(null);

export function useOneCardHost(): OneCardHost {
  const host = useContext(OneCardHostContext);
  if (!host) throw new Error("The one card needs a OneCardHostContext.Provider above it.");
  return host;
}
