// Accent-folding for the optional fold: decompose, drop diacritic marks, lower-case.
const fold = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Options for `textHits`. */
export type TextHitsOptions = {
  /** Ignore accents as well as case: "cafe" finds "Café". Off by default. Note: it also drops the ASCII characters ^ and the backtick, which count as diacritics. */
  foldAccents?: boolean;
};

/** Every word of the query must appear. An empty query keeps the row. Null fields are skipped. */
export function textHits(query: string, fields: readonly (string | null | undefined)[], options: TextHitsOptions = {}): boolean {
  if (options.foldAccents === true) {
    const tokens = fold(query).trim().split(/\s+/).filter((t) => t !== "");
    if (tokens.length === 0) return true;
    const hay = fold(fields.filter((f): f is string => typeof f === "string").join("\n"));
    return tokens.every((t) => hay.includes(t));
  }
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token !== "");
  if (tokens.length === 0) return true;
  const hay = fields
    .filter((field): field is string => typeof field === "string")
    .join("\n")
    .toLowerCase();
  return tokens.every((token) => hay.includes(token));
}
