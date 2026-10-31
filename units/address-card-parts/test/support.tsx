// Test-only. Builders for stored addresses and a frame that decides `editMode` as the address card does (A: PlaceClaimsCard.tsx :499), so the
// parts are driven by the same props the card gives them. The card itself (the list, the add form) is H15g's.
import type { PlaceClaim, PlaceFieldClaim } from "@kaigilb/gilbplatformcode-place-claims";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { SavedAddress, type SavedAddressProps } from "../src/index";

export const noop = () => true;

export const field = (claimId: string, o: Partial<PlaceFieldClaim> & Pick<PlaceFieldClaim, "id" | "subject">): PlaceFieldClaim =>
  ({ uri: `u/${o.id}`, detailOf: `u/${claimId}`, streetLine: "", placeId: null, etag: null, ...o }) as PlaceFieldClaim;

export const claim = (id: string, label: string, fields: PlaceFieldClaim[], over: Partial<PlaceClaim> = {}): PlaceClaim =>
  ({ id, uri: `u/${id}`, label, streetLine: "", memberOf: [], subjects: [], hiddenFieldCount: 0, etag: null, fields, ...over }) as PlaceClaim;

/** One stored address whose only field is the picked place. */
export const addressIn = (place: string, streetLine = "", label = "home", over: Partial<PlaceClaim> = {}) =>
  claim("c-home", label, [...(streetLine ? [field("c-home", { id: "h-s", subject: "street", streetLine })] : []), field("c-home", { id: "h-c", subject: "place", placeId: place })], over);

export function Frame(props: Omit<SavedAddressProps, "editMode"> & { editMode: boolean }) {
  const cardMode = useCardMode();
  return <SavedAddress {...props} editMode={props.editMode && !(cardMode.managed && cardMode.presentation)} />;
}

export const list = (claims: PlaceClaim[], p: Partial<SavedAddressProps> & { editMode?: boolean } = {}) => (
  <div data-testid="place-claims-list">
    {claims.map((c) => (
      <Frame key={c.id} claim={c} busy={false} editMode={false} onAmend={noop} onRemove={noop} {...p} />
    ))}
  </div>
);
