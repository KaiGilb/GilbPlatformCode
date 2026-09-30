/**
 * Whether one command should stay in a filtered list.
 *
 * An empty query returns true. The command is kept. This function does not
 * trim. `" "` is a real query. The palette trims before it calls. If you skip
 * that trim, a space-only query matches only text that contains a space.
 *
 * Comparison is `toLowerCase()`, with no locale. `"I"` becomes `"i"`. It is
 * not `toLocaleLowerCase()`.
 *
 * The label is tried first. Then each keyword. One hit is enough. Keywords
 * are not trimmed. An empty keyword list and a label that does not contain
 * the query returns false.
 *
 * This is not `text-filter`. That unit keeps a row only when every word of
 * the query appears, and an empty query also keeps the row. This unit is one
 * substring against a label and a keyword list.
 */
export function commandMatches(
  cmd: { label: string; keywords: readonly string[] },
  query: string,
): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (cmd.label.toLowerCase().includes(q)) return true;
  return cmd.keywords.some((keyword) => keyword.toLowerCase().includes(q));
}
