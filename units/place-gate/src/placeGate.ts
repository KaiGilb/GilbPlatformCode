/**
 * Two gates on a place the host has already read.
 *
 * Neither function fetches. Neither function chooses an audience.
 * The host passes the test for "this tier is a tier this build can name".
 */

export interface PlaceFieldView {
  /** The stored audience tier, as served. Not trimmed here. */
  tier: string;
}

/**
 * The place fields this viewer may render.
 *
 * A field is kept only when both are true:
 * - `isNameableTier(field.tier)` is true
 * - `field.tier` is in `viewerRungs` by exact `Set` membership
 *
 * An empty viewer list is a real viewer who is admitted to nothing.
 * It returns an empty list. It does not mean "show everything".
 *
 * A tier this build cannot name is dropped even when that same text is
 * in `viewerRungs`. Do not render a blank slot in its place. Absence
 * here means "say nothing about this field", not "the field is empty"
 * and not "the field is hidden".
 *
 * No trim. Order is kept. The returned objects are the same objects.
 */
export function placeFieldsVisibleTo<T extends PlaceFieldView>(
  fields: readonly T[],
  viewerRungs: readonly string[],
  isNameableTier: (tier: string) => boolean,
): T[] {
  const admitted = new Set(viewerRungs);
  return fields.filter((field) => {
    if (!isNameableTier(field.tier)) return false;
    return admitted.has(field.tier);
  });
}

/** Why a stored place must not be split into field claims. Null means it may. */
export type MigrationRefusal = "already-decomposed" | "nothing-to-migrate" | "unreadable-rung";

/**
 * Why a migration must not run, or null when it may.
 *
 * The order is the decision. Do not reorder it.
 * 1. `alreadyDecomposed` — even when there is nothing left and the tier is blank
 * 2. no legacy fields — nothing to migrate
 * 3. `rawTier` is empty after trim — the rung cannot be read, so do not invent one
 * 4. otherwise null
 *
 * A tier this function accepts is not returned. The caller still has `rawTier`.
 * This function only says whether to refuse.
 */
export function migrationRefusalReason(input: {
  rawTier: string;
  hasLegacyFields: boolean;
  alreadyDecomposed: boolean;
}): MigrationRefusal | null {
  if (input.alreadyDecomposed) return "already-decomposed";
  if (!input.hasLegacyFields) return "nothing-to-migrate";
  if (input.rawTier.trim() === "") return "unreadable-rung";
  return null;
}
