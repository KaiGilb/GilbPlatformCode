/**
 * Bare type names for a word search that is limited to named types.
 *
 * `typeLocalName` here is a private copy of units/type-curie. It must stay
 * the same function. It is also the same private copy as units/record-plane.
 * It is not units/type-name. type-name returns null when a slash remains,
 * strips a leading `veda:` and a trailing `.png`, and accepts `/t/` on any
 * path. This function does not.
 *
 * - `t:Name` → `Name` (only the `t:` is removed)
 * - `prefix:Name` when the prefix is letters and digits, and the name is
 *   letters, digits, `_`, or `-` → `Name`
 * - an address containing `/base/t/Name` → `Name`, decoded once
 * - anything else, including `/vault/t/Name`, → the trimmed input
 * A broken percent-encoding in the `/base/t/` segment throws.
 */

/**
 * The value a caller passes when the search must not filter by type.
 * It is not an empty list. An empty list means "no types named", and the
 * host must not turn that into a search of every record.
 * This unit does not perform the search. It only names the sentinel.
 */
export const UNTYPED_FIND = "untyped-find" as const;

export type UntypedFind = typeof UNTYPED_FIND;

/** Same cut as type-curie `typeLocalName`. See the file note. */
export function typeLocalName(typeUri: string): string {
  const t = typeUri.trim();
  if (t.startsWith("t:")) return t.slice(2);
  const curie = t.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  const curieName = curie?.[1];
  if (curieName) return curieName;
  const m = t.match(/\/base\/t\/([^/#?]+)/i);
  const pathName = m?.[1];
  if (pathName) return decodeURIComponent(pathName);
  return t;
}

/**
 * Trim each name, drop blanks, and drop later duplicates.
 * The first spelling wins. " Note " and "Note" are both kept if both survive
 * trim as different strings — trim makes them the same, so the second is dropped.
 * Null and undefined become []. The input list is not changed.
 * This does not split on commas. This does not strip `t:`.
 */
export function bareTypeNames(types: readonly string[] | null | undefined): string[] {
  return [...new Set((types ?? []).map((t) => t.trim()).filter((n) => n.length > 0))];
}

/**
 * True when the bare name of `typeUri` is one of `types`.
 * The bare name is {@link typeLocalName}. Comparison is exact, not trimmed
 * again, and not case-folded.
 * An empty bare name is never a hit, even if `types` contains "".
 * A `/vault/t/Name` address is not the name Name, because this cut does not
 * read `/vault/t/`.
 */
export function isNamedBareType(
  typeUri: string | null | undefined,
  types: readonly string[],
): boolean {
  const bare = typeLocalName(typeUri ?? "");
  return bare.length > 0 && types.includes(bare);
}
