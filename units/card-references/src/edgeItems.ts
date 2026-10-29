// Two pure helpers on the stored items of an edge fact, copied from the app's employment-edge module (the rest of it is not taken).

/** The `@id` of one stored edge item, or null when the item is not an edge. */
export function edgeIdOf(item: unknown): string | null {
  if (typeof item === "string") return /^https?:\/\//.test(item) ? item : null;
  if (item && typeof item === "object" && typeof (item as { "@id"?: unknown })["@id"] === "string") {
    return (item as { "@id": string })["@id"] || null;
  }
  return null;
}

/** Drop the edges to these entities; every other item is kept as stored. */
export function withoutEdges(items: readonly unknown[], uris: readonly string[]): unknown[] {
  const gone = new Set(uris);
  return items.filter((i) => {
    const id = edgeIdOf(i);
    return !id || !gone.has(id);
  });
}
