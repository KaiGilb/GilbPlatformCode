// Test-only. Builders for stored addresses (the same as `address-card-parts`' tests use).
import type { PlaceClaim, PlaceFieldClaim } from "@kaigilb/gilbplatformcode-place-claims";

export const noop = () => true;
export const field = (claimId: string, o: Partial<PlaceFieldClaim> & Pick<PlaceFieldClaim, "id" | "subject">): PlaceFieldClaim =>
  ({ uri: `u/${o.id}`, detailOf: `u/${claimId}`, streetLine: "", placeId: null, etag: null, ...o }) as PlaceFieldClaim;
export const claim = (id: string, label: string, fields: PlaceFieldClaim[], over: Partial<PlaceClaim> = {}): PlaceClaim =>
  ({ id, uri: `u/${id}`, label, streetLine: "", memberOf: [], subjects: [], hiddenFieldCount: 0, etag: null, fields, ...over }) as PlaceClaim;
