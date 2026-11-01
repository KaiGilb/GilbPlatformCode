/**
 * The holder's held addresses of a linked person, as the one card's merge takes them (`OwnAddress`), so an address of yours EQUAL to
 * theirs is ONE row "You have the same on your card", as for every other kind.
 *
 * ⛔ No request of its own on a card open: the addresses are the vault's ONE shared address read (`placeClaimsKey`, the read the
 * Address group already makes through `usePlaceClaims`), observed here; a write's fresh read-back updates it for both. The place names
 * come from the catalogue reads the Address group already makes (`getPlace` holds each place once, and joins a read in flight).
 * ⛔ No compare here: equal or not is the merge's (`mergeOneCard` of the `one-card-merge` unit, `addressPredicate`).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OwnAddress } from "@kaigilb/gilbplatformcode-one-card-merge";
import { claimPlaceIds } from "@kaigilb/gilbplatformcode-place-lines";
import { useOneCardHost, type GeoPlace, type OneCardHost, type PlaceClaim } from "./oneCardHost";
import { orderPlaces } from "./placeOrder";

/**
 * A held address as the merge's parts: its typed lines (street, Address 1 and 2, postal code) and the names of the places it binds,
 * finest first (a place another of its places is part of comes before it): the first is the city, a country-typed last one is the
 * country, one between is the region. The Location label is the holder's own name for the address ("home"), not part of it.
 */
export function ownAddressOf(host: OneCardHost, claim: PlaceClaim, places: readonly GeoPlace[]): OwnAddress {
  const ids = claimPlaceIds(claim);
  const bound = ids.map((id) => places.find((p) => p.id === id)).filter((p): p is GeoPlace => !!p);
  const { city, regions, country } = orderPlaces(bound);
  return {
    street: host.claimFieldText(claim, "streetLine"),
    line1: host.claimFieldText(claim, "addressLine1"),
    line2: host.claimFieldText(claim, "addressLine2"),
    postalCode: host.claimFieldText(claim, "postalCode"),
    city: city?.label ?? null,
    region: regions.map((p) => p.label).join(", ") || null,
    country: country?.label ?? null,
    entity: claim.uri,
  };
}

/**
 * The holder's addresses of this person, for the merge; null while the read has not answered (or it is off).
 *
 * @param enabled read only on the one card (a linked person whose card is read)
 * @param vaultId the vault that holds the record (where its addresses are)
 * @param subject the record's entity IRI (every address's `a:claimSubject`)
 */
export function useHeldAddresses(enabled: boolean, vaultId: string | null | undefined, subject: string | null | undefined): OwnAddress[] | null {
  const host = useOneCardHost();
  const on = enabled && !!vaultId && !!subject;
  const q = useQuery({
    queryKey: host.placeClaimsKey(vaultId ?? ""),
    queryFn: () => host.listPlaceClaimsInVault(vaultId!),
    staleTime: host.placeClaimsStaleMs,
    enabled: on,
  });
  const claims = useMemo(() => (on && q.data ? host.claimsAbout(q.data, subject!) : null), [on, q.data, subject]);
  const ids = useMemo(() => [...new Set((claims ?? []).flatMap(claimPlaceIds))], [claims]);
  const key = ids.join("\n");
  const [places, setPlaces] = useState<{ key: string; rows: GeoPlace[] } | null>(null);
  useEffect(() => {
    let alive = true;
    if (ids.length === 0) return;
    void host.loadPlaceNames(ids).then((rows) => {
      if (alive) setPlaces({ key, rows });
    });
    return () => {
      alive = false;
    };
    // `key` stands for `ids`
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!claims) return null;
    // Until the names of its places are read, the addresses are not handed to the merge (no early "different" from a half address).
    if (ids.length > 0 && !(places && places.key === key)) return null;
    return claims.map((c) => ownAddressOf(host, c, ids.length > 0 ? places!.rows : []));
  }, [claims, places, key]);
}
