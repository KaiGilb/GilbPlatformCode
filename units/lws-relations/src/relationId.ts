/**
 * Path id for PUT `/base/r/:id`. The recorded CREATE door requires an id in the path.
 * That is the upsert contract, ⛔ not a computed field-fill of content (HT3a).
 * Base has no POST `/base/r` mint Location (`mintShortRelationId` is supersession only).
 *
 * 104 random bits (26 hex): it says nothing about the relation's ends, its predicate or its holder, so a reader who sees only the
 * address learns nothing from it.
 */
export function mintRelationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 26);
}
