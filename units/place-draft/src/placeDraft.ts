// The address a person is filling in, before it is saved: its parts, the places picked into it, and the rules that move a pick through it.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` (commit in the README). Changes are marked CHANGED.
import { resolveAncestry, resolveGeoGrains, type GeoAncestry, type GeoPlace, type GeoRung } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { PLACE_TEXT_SLOTS, type PlaceClaimInput } from "@kaigilb/gilbplatformcode-place-claims";

const EMPTY_PLACE: GeoAncestry = { city: null, region: null, country: null };

/**
 * A pick that did not land in the box it was made in, recorded so it can be said.
 *
 * The City box searches administrative areas too, and a row lands at the rung the ontology gives it, not the box it was typed
 * into. Without a record of that, the page after the pick is the same as after picking the same row in the box it belongs to.
 *
 * It belongs to the draft only and is never saved: `draftToInput` leaves it out. It describes what the person just did, not a
 * fact about the place.
 */
export interface RungDivergence {
  /** The rung the row actually occupies, per the ontology. */
  readonly rung: GeoRung;
  /** The box the person searched in. */
  readonly boxRung: GeoRung;
  /** The row's label, so a notice can name the thing. */
  readonly label: string;
}

export interface PlaceClaimDraft {
  label: string;
  streetLine: string;
  /** "Address 1" / "Address 2": open text, each its own field. */
  addressLine1: string;
  addressLine2: string;
  /** "Postal Code": open text, its own field, kept as typed ("0150"). */
  postalCode: string;
  place: GeoAncestry;
  /** Which rungs the cascade filled rather than the person picking directly. */
  cascaded: { city: boolean; region: boolean; country: boolean };
  /** The person's last pick, when it landed at a rung other than the box they used. */
  divergence: RungDivergence | null;
}

export function emptyDraft(): PlaceClaimDraft {
  return {
    label: "",
    streetLine: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    place: EMPTY_PLACE,
    cascaded: { city: false, region: false, country: false },
    divergence: null,
  };
}

/** What the store is handed: the draft without its cascade marks and its notice. */
export function draftToInput(d: PlaceClaimDraft): PlaceClaimInput {
  return {
    label: d.label,
    streetLine: d.streetLine,
    addressLine1: d.addressLine1,
    addressLine2: d.addressLine2,
    postalCode: d.postalCode,
    place: d.place,
  };
}

/**
 * The cascade: a pick at any rung fills the rungs above it.
 *
 * The walk is this client's instrument (`a:memberOf` is not transitive and no server route does it), so a rung it cannot reach
 * stays empty and is left for the person to fill. It never guesses a country from a label.
 *
 * A direct pick is never overwritten by a cascade. If the person chose the country themselves and then picks a city that
 * resolves elsewhere, their own choice stands.
 */
export async function cascadeFrom(draft: PlaceClaimDraft, picked: GeoPlace, boxRung: GeoRung): Promise<PlaceClaimDraft> {
  // The rung comes from the ontology, not from the box the person typed in. New York is held only as an administrative area,
  // Oslo only as a municipality, so the City box searches wider and the picked row lands at the rung the ontology says it
  // occupies. Calling New York a city here, to make the box look right, would put a false fact in the person's vault.
  const grains = await resolveGeoGrains();
  const rung = grains.rungOf.get(picked.type) ?? boxRung;
  const ancestry = await resolveAncestry(picked.id);
  const next: PlaceClaimDraft = {
    ...draft,
    place: { ...draft.place, [rung]: picked },
    cascaded: { ...draft.cascaded, [rung]: false },
    // The divergence is recorded here or it is lost.
    divergence: rung === boxRung ? null : { rung, boxRung, label: picked.label },
  };
  for (const r of ["city", "region", "country"] as const) {
    if (r === rung) continue;
    const heldDirectly = draft.place[r] !== null && !draft.cascaded[r];
    if (heldDirectly) continue; // never overwrite a person's own pick
    const found = ancestry[r];
    if (found) {
      next.place = { ...next.place, [r]: found };
      next.cascaded = { ...next.cascaded, [r]: true };
    }
  }
  return next;
}

/**
 * What the person typed into the add form while its first save was in flight. `sent` is the draft that save carried; `latest` is
 * the form as it stood when the save confirmed.
 */
export interface CarriedDraft {
  readonly sent: PlaceClaimDraft;
  readonly latest: PlaceClaimDraft;
}

/** True when the form holds something the save that just confirmed did not carry. */
export function draftChangedSince(latest: PlaceClaimDraft, sent: PlaceClaimDraft): boolean {
  return JSON.stringify(snapshotOf(latest)) !== JSON.stringify(snapshotOf(sent));
}

/**
 * The stored address's draft with every part the person changed after `sent` taken from `latest`.
 * Only what changed is carried: a part the person left alone is the store's, so a value the store normalised (a trimmed space)
 * is not written back over it.
 */
export function applyCarried(stored: PlaceClaimDraft, c: CarriedDraft): PlaceClaimDraft {
  const out: PlaceClaimDraft = { ...stored, place: { ...stored.place }, cascaded: { ...stored.cascaded } };
  if (c.latest.label !== c.sent.label) out.label = c.latest.label;
  for (const { term } of PLACE_TEXT_SLOTS) {
    if (c.latest[term] !== c.sent[term]) out[term] = c.latest[term];
  }
  for (const r of ["city", "region", "country"] as const) {
    if (placeId(c.latest.place[r]) !== placeId(c.sent.place[r])) {
      out.place = { ...out.place, [r]: c.latest.place[r] };
      out.cascaded = { ...out.cascaded, [r]: c.latest.cascaded[r] };
    }
  }
  return out;
}

/** What a new address's save answers. The new address's id: confirmed, and this is the address. `true`: confirmed, but the caller cannot name the address. `false` / `null`: not confirmed. */
export type PlaceSaveOutcome = string | boolean | null;

/** The id of a bound place, or `null`. Compared by id: object identity changes with every read. */
function placeId(p: GeoPlace | null): string | null {
  return p ? p.id : null;
}

/**
 * The comparable shape of a draft: scalars only, and places by id. A re-read hands back fresh objects every time, so an identity
 * comparison would read every field as changed on every read and hold the whole row permanently dirty.
 */
export interface FieldSnapshot {
  label: string;
  streetLine: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

export function snapshotOf(d: PlaceClaimDraft): FieldSnapshot {
  return {
    label: d.label,
    streetLine: d.streetLine,
    addressLine1: d.addressLine1,
    addressLine2: d.addressLine2,
    postalCode: d.postalCode,
    city: placeId(d.place.city),
    region: placeId(d.place.region),
    country: placeId(d.place.country),
  };
}
