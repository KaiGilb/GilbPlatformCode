/**
 * The person's ordered `a:employment` edge list, written on the person's RECORD.
 *
 *   - THE STORED LIST IS THE BASE. Every change is applied to the edge list AS STORED NOW (read fresh before each write),
 *     never to the list a card resolved: an edge this session could not read, or one another session added a moment ago, is
 *     carried verbatim. An item that is not an edge (a plain text value an older writer left) is carried as it is, never
 *     re-encoded;
 *   - order is array position, a new employment is appended;
 *   - a scalar for one, an array for several; when nothing is left the key is retracted (a null: the person removed the last);
 *   - the write is a merge PATCH of the one edge key, conditional on the version just read (`If-Match`); a 412 re-reads and
 *     re-applies the change; one write at a time per record. The writer is `changeRecordFactItems` of `record-fact-items`: a
 *     read with no usable ETag sends nothing.
 *
 * A card's own save keeps the edge key, so it neither writes nor retracts it.
 */
import { changeRecordFactItems, storedFactItems } from "@kaigilb/gilbplatformcode-record-fact-items";
/** The `@id` of one stored edge item, or null when the item is not an edge. */
export function edgeIdOf(item: unknown): string | null {
  if (typeof item === "string") return /^https?:\/\//.test(item) ? item : null;
  if (item && typeof item === "object" && typeof (item as { "@id"?: unknown })["@id"] === "string") {
    return (item as { "@id": string })["@id"] || null;
  }
  return null;
}

/** The stored items of the edge fact, in order (a scalar is a one-item list): the record-fact writer's. */
export const storedEdgeItems = storedFactItems;

/** Append one edge (no-op when the list already holds it). */
export function withEdge(items: readonly unknown[], uri: string): unknown[] {
  return items.some((i) => edgeIdOf(i) === uri) ? [...items] : [...items, { "@id": uri }];
}

/** Drop the edges to these entities; every other item is kept as stored. */
export function withoutEdges(items: readonly unknown[], uris: readonly string[]): unknown[] {
  const gone = new Set(uris);
  return items.filter((i) => {
    const id = edgeIdOf(i);
    return !id || !gone.has(id);
  });
}

/**
 * Change the record's stored edge list. `change` is handed the items AS STORED NOW and returns the next
 * list; when it returns the same items nothing is written. Resolves with the list as written.
 */
export function changeEmploymentEdges(
  recordId: string,
  recordEntityUri: string | null,
  edgeKey: string,
  change: (stored: readonly unknown[]) => unknown[],
): Promise<unknown[]> {
  return changeRecordFactItems(recordId, recordEntityUri, edgeKey, change, "their employments were not changed");
}
