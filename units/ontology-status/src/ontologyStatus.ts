/**
 * The status word a write may store.
 *
 * Unknown text becomes Suggested. Retired and withdrawn become Deprecated.
 * Nothing here returns the word Retired. That spelling is an input only.
 *
 * This is not status-level. That unit is the list a screen shows, and it
 * keeps the word the store served. Running this function on a browse row
 * renames a served word. Do not.
 */

export type OntologyStatus = "Suggested" | "Approved" | "Deprecated";

/**
 * Suggested, Approved, or Deprecated.
 *
 * The input is trimmed and lowercased. `approved` is Approved.
 * `retired`, `deprecated`, and `withdrawn` are Deprecated.
 * Everything else, including a missing value, a blank, and `suggested`, is
 * Suggested. `approve` without the d is Suggested. It is not close enough.
 */
export function normalizeOntologyStatus(raw: string | undefined | null): OntologyStatus {
  const s = (raw || "").trim().toLowerCase();
  if (s === "approved") return "Approved";
  if (s === "retired" || s === "deprecated" || s === "withdrawn") return "Deprecated";
  return "Suggested";
}
