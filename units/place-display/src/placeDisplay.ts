/**
 * What one card line paints for a value that may be a catalogue place.
 * The host already resolved the row, or has not. This does not fetch.
 */

export type PlaceRung = "city" | "region" | "country";

export const RUNG_HEADING: Readonly<Record<PlaceRung, string>> = Object.freeze({
  city: "City",
  region: "Region/State",
  country: "Country",
});

export interface ResolvedPlaceHit {
  readonly label: string;
  readonly rung: PlaceRung | null;
}

export interface PlaceDisplay {
  readonly heading: string;
  readonly text: string;
  readonly resolved: boolean;
}

/**
 * No hit: the heading the caller would have used, the raw value, resolved false.
 * A hit: the rung heading when the rung is one of the three, otherwise the caller's heading.
 * The text is the trimmed label, or the raw value when that trim is empty. The value is not trimmed.
 * A blank label is still resolved.
 */
export function placeDisplayFor(
  value: string,
  unresolvedHeading: string,
  hit: ResolvedPlaceHit | null | undefined,
): PlaceDisplay {
  if (!hit) {
    return { heading: unresolvedHeading, text: value, resolved: false };
  }
  return {
    heading: hit.rung ? RUNG_HEADING[hit.rung] : unresolvedHeading,
    text: hit.label.trim() || value,
    resolved: true,
  };
}
