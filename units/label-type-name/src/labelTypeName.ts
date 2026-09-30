/**
 * A type name made from a label.
 *
 * `work in teams` becomes `WorkInTeams`. Only the first character of each
 * word is uppercased. The rest of the word is not lowercased, so `WORK`
 * stays `WORK`.
 *
 * A character outside ASCII letters and digits is a break, not part of the
 * name. This is not label-hyphen, which lowercases and joins with hyphens.
 * This is not search-words, which inserts spaces and does not change case.
 */

/**
 * The joined name, or `""` when the label has no ASCII letter or digit.
 *
 * The label is trimmed, then split on every run of characters that are not
 * `A-Z`, `a-z`, or `0-9`. Empty pieces are dropped. Each piece keeps every
 * character after the first. `toUpperCase` is called with no locale.
 */
export function labelToTypeName(label: string): string {
  const parts = label
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
