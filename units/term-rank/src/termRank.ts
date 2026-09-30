/** Lower is better: exact label or name, then prefix, then word start, then the rest. */

function lower(v: string | undefined | null): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

/** Built once per search. Escaped so a query may contain `C++` or `(draft)`. */
export function wordStartMatcher(q: string): RegExp {
  return new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
}

/**
 * Rank of one candidate. `q` is already lowercased.
 * `wordStart` is {@link wordStartMatcher} for that `q`.
 */
export function rankOf(label: string, name: string, q: string, wordStart: RegExp): number {
  const l = lower(label);
  const n = lower(name);
  if (l === q || n === q) return 0;
  if (l.startsWith(q) || n.startsWith(q)) return 1;
  if (wordStart.test(l)) return 2;
  return 3;
}

/** Sort key. Ties keep the order the caller already had. */
export function compareByRank(
  a: { label: string; name: string },
  b: { label: string; name: string },
  q: string,
): number {
  const query = q.trim().toLowerCase();
  if (query === "") return 0;
  const word = wordStartMatcher(query);
  return rankOf(a.label, a.name, query, word) - rankOf(b.label, b.name, query, word);
}
