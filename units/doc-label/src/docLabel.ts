/** The name a document states. Blank when it does not state one. */
export function labelFromDocument(doc: object | null | undefined): string {
  if (!doc) return "";
  const record = doc as Record<string, unknown>;
  const value = record["a:label"] ?? record["label"] ?? record["name"] ?? record["https://schema.org/name"];
  return typeof value === "string" ? value.trim() : "";
}
