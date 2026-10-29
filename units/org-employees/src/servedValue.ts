// Inline pure copies of the served-fact readers the employees reader needs (the source file also holds ontology-term code, which is in no unit here).
/** One value of a served fact as the addresses it holds: a string, an `{"@id"}`, or an array of either. */
export function refsOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string" ? (x as { "@id": string })["@id"].trim() : ""))
    .filter((x) => x !== "");
}

/** A served document's value under a stored/bare key, read under either spelling (Base frames one `a:` off). */
export function servedValue(doc: Record<string, unknown>, bare: string): unknown {
  return doc[bare] ?? doc[`a:${bare}`];
}
