export type SearchPhase<T> =
  | { kind: "idle" }
  | { kind: "keep-typing"; query: string }
  | { kind: "loading"; query: string }
  | { kind: "results"; query: string; hits: readonly T[] }
  | { kind: "empty"; query: string }
  | { kind: "error"; query: string; message: string };

/** Before a request. Short text is not a search. */
export function phaseOnType<T>(query: string, minChars: number): SearchPhase<T> {
  const q = query.trim();
  if (q.length === 0) return { kind: "idle" };
  if (q.length < minChars) return { kind: "keep-typing", query: q };
  return { kind: "loading", query: q };
}

/**
 * After a request. An empty list and a failed request are different.
 * An empty list does not mean the thing does not exist.
 */
export function phaseFromAnswer<T>(query: string, hits: readonly T[] | null, error: string | null): SearchPhase<T> {
  const q = query.trim();
  if (error) return { kind: "error", query: q, message: error };
  if (!hits || hits.length === 0) return { kind: "empty", query: q };
  return { kind: "results", query: q, hits };
}

export const SEARCH_COPY = {
  keepTyping: "Keep typing.",
  loading: "Searching.",
  empty: "Nothing matched. That does not mean it is absent.",
  error: "The search failed. The catalogue was not read.",
} as const;
