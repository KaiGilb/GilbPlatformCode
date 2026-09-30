/**
 * The failures of one people search, as one string a surface can show, or null.
 *
 * Only three fields are read, in this order: `nameError`, `skillError`,
 * `placeError`. A null, an undefined, and `""` are dropped. A string of spaces
 * is kept. Nothing is trimmed. The kept strings are joined with ` · `
 * (space, middle dot, space). One failure is that string alone, with no dot.
 * No failures returns null, not `""`.
 *
 * Any other field is ignored. In particular, a flag that the place catalogue
 * cannot be asked is not an error. Do not fold it in. Showing it as a failure
 * hides the honest empty result.
 *
 * This does not search, and it does not decide that an empty list means failure.
 */

export interface FacetErrors {
  nameError?: string | null;
  skillError?: string | null;
  placeError?: string | null;
}

export function facetErrorText(res: FacetErrors): string | null {
  const errs = [res.nameError, res.skillError, res.placeError].filter(
    (error): error is string => Boolean(error),
  );
  return errs.length > 0 ? errs.join(" \u00b7 ") : null;
}
