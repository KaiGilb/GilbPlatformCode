/**
 * Whether one address field is a street, a place, or not a field this reader
 * can use.
 *
 * - A non-empty street and a non-null place id together return null. Do not
 *   pick a side. A street and a place on one field would share one audience,
 *   and showing one of them would show the other.
 * - An empty street and a null place id return null. There is nothing to show.
 * - A non-null place id with an empty street is `"place"`.
 * - A non-empty street with a null place id is `"street"`.
 *
 * Empty means the exact string `""`. A string of spaces is a street. Nothing
 * is trimmed. This does not read who can see the field, and it does not turn
 * an unknown audience into a default.
 */

export type PlaceFieldKind = "street" | "place";

export function placeFieldKind(streetLine: string, placeId: string | null): PlaceFieldKind | null {
  if (streetLine !== "" && placeId !== null) return null;
  if (streetLine === "" && placeId === null) return null;
  return placeId !== null ? "place" : "street";
}
