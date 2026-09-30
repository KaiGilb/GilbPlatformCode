/**
 * The line a person reads after the catalogue names have already been resolved.
 * Does not drop a blank label, does not trim, and does not fetch.
 */

export interface NamedPlace {
  readonly label: string;
}

/** Joined with space, middle dot U+00B7, space. An empty list is "". */
export function placeLine(places: readonly NamedPlace[]): string {
  return places.map((place) => place.label).join(" \u00b7 ");
}
