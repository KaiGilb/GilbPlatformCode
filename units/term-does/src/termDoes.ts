/**
 * The definition stated on a term document that was already read.
 * There is no third state here. A request that failed is not a document, and must not be passed in.
 */

export type TermDoes = { state: "defined"; does: string } | { state: "none" };

/**
 * `a:does` is consulted first. A present value hides `does`, even when that value is blank,
 * a number, or only spaces. A string is trimmed. A one-level `@value` string is trimmed.
 * Anything else is none.
 */
export function termDoesFromDocument(doc: Record<string, unknown>): TermDoes {
  if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(
      "termDoesFromDocument: pass the document that was read. A failed read has no definition to report.",
    );
  }
  const does = doesOf(doc["a:does"] ?? doc.does);
  return does ? { state: "defined", does } : { state: "none" };
}

function doesOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "@value" in value) {
    const inner = (value as { "@value": unknown })["@value"];
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }
  return null;
}
