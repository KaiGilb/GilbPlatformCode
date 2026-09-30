/**
 * Which street text and which place ids an address still holds.
 *
 * An address can be one composite, or a composite plus field claims that each
 * hold one street or one place. Both shapes exist until a save migrates the
 * address. These functions read what is there. They do not save, and they do
 * not decide who can see it.
 *
 * `boundPlaceIds` is country, then region, then city. A missing rung, a null
 * rung, a non-string id, and `""` are dropped. A string of spaces is kept.
 * Nothing is trimmed.
 *
 * `claimStreetLine` uses the first field whose subject is exactly `"street"`.
 * That field's street is returned even when it is `""`. It does not fall
 * through to the composite. Any other subject, including `"Street"`, is not a
 * street field. No street field means the composite's street.
 *
 * `claimPlaceIds` uses field subjects that are exactly `"place"` and whose
 * place id is not null. `""` is not null, so it is kept. The first time that
 * list is non-empty, the composite's ids are not used, even if every field id
 * is blank. An empty field list, or only null ids, copies `memberOf`. The
 * copy is a new array. Ids are not trimmed and not deduped.
 *
 * `isDecomposed` is true when `fields` has any member, including a blank street.
 *
 * `needsFieldMigration` looks only at the composite. True when the composite
 * street trims to something, or `memberOf` has any member, including `""`.
 * It does not look at fields. A whitespace-only composite street is not a
 * reason. A fully migrated address, with the street and the places only on
 * fields, is false here.
 */

export interface PlaceIdParts {
  country?: { id?: unknown } | null;
  region?: { id?: unknown } | null;
  city?: { id?: unknown } | null;
}

export interface PlaceLineField {
  subject: string;
  streetLine: string;
  placeId: string | null;
}

export interface PlaceLineClaim {
  streetLine: string;
  memberOf: readonly string[];
  fields: readonly PlaceLineField[];
}

export function boundPlaceIds(place: PlaceIdParts): string[] {
  return [place.country?.id, place.region?.id, place.city?.id].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
}

export function claimStreetLine(claim: PlaceLineClaim): string {
  const field = claim.fields.find((candidate) => candidate.subject === "street");
  if (field) return field.streetLine;
  return claim.streetLine;
}

export function claimPlaceIds(claim: PlaceLineClaim): string[] {
  const fromFields = claim.fields
    .filter((candidate) => candidate.subject === "place" && candidate.placeId !== null)
    .map((candidate) => candidate.placeId as string);
  if (fromFields.length > 0) return fromFields;
  return [...claim.memberOf];
}

export function isDecomposed(claim: Pick<PlaceLineClaim, "fields">): boolean {
  return claim.fields.length > 0;
}

export function needsFieldMigration(
  claim: Pick<PlaceLineClaim, "streetLine" | "memberOf">,
): boolean {
  return claim.streetLine.trim() !== "" || claim.memberOf.length > 0;
}
