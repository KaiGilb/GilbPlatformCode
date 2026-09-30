/** Every word of the query must appear. An empty query keeps the row. Null fields are skipped. */
export function textHits(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token !== "");
  if (tokens.length === 0) return true;
  const hay = fields
    .filter((field): field is string => typeof field === "string")
    .join("\n")
    .toLowerCase();
  return tokens.every((token) => hay.includes(token));
}
