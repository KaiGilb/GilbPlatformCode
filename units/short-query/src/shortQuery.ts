/**
 * The sentence that says how many more letters a type search still needs.
 *
 * The minimum is an argument. The app reads it from its own setting and passes
 * it here. This unit does not read an environment variable, and it does not
 * decide that the search must not run. It only builds the sentence.
 *
 * The query text is not in the sentence. Only its length is. Nothing is trimmed,
 * so a space counts as a letter.
 */

/**
 * `Type N more letter(s) to search types that currently resolve.`
 *
 * `N` is `minLetters - query.length`. It is not clamped. Zero and a negative
 * number are still printed, and they use the plural `letters`.
 * The singular `letter` is only when `N` is exactly 1.
 */
export function vaultPurposeShortQueryReach(query: string, minLetters: number): string {
  const need = minLetters - query.length;
  return `Type ${need} more letter${need === 1 ? "" : "s"} to search types that currently resolve.`;
}
