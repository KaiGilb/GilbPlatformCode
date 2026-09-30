/**
 * Whether the address that was read back still holds what was written.
 *
 * Pass the three facts the address accessors already returned:
 * the label, the street line, and the place ids. This function does not
 * open a claim, and it does not know which field a street lives on.
 *
 * If you pass the old composite street when the street now lives on its
 * own field, a good save looks like a loss. Read the field first. The
 * place-lines unit is that read. This unit is only the comparison.
 *
 * Label and street are compared with `String.trim` on both sides. A
 * spaces-only street and an empty street are the same for this check.
 * Place ids are not trimmed. `" a "` is not `"a"`.
 *
 * Place ids are compared as sets. Order does not matter. Duplicates
 * collapse, so `["a", "a"]` and `["a"]` match. Do not compare the arrays
 * with `===` or with a join.
 *
 * The audience is not an argument. A tier that round-trips through a
 * default would fail a good save. Do not add it.
 */
export interface PlaceKeptFacts {
  label: string;
  streetLine: string;
  placeIds: readonly string[];
}

export function factsSurvived(kept: PlaceKeptFacts, written: PlaceKeptFacts): boolean {
  if (kept.label.trim() !== written.label.trim()) return false;
  if (kept.streetLine.trim() !== written.streetLine.trim()) return false;
  const want = new Set(written.placeIds);
  const got = new Set(kept.placeIds);
  if (want.size !== got.size) return false;
  for (const id of want) {
    if (!got.has(id)) return false;
  }
  return true;
}
