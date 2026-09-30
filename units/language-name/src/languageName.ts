/** The name for the screen language. Falls back to the document's own label. */
export function languageDisplayName(doc: { label?: unknown; labelByLang?: unknown }, uiLang: string): string {
  const by = doc.labelByLang;
  if (by && typeof by === "object" && !Array.isArray(by)) {
    const value = (by as Record<string, unknown>)[uiLang];
    if (typeof value === "string" && value.trim()) return value;
  }
  return typeof doc.label === "string" ? doc.label : "";
}

/** Other names for one language. A single name may arrive as a string. Several stay an array. */
export function altNamesForLang(altLabelByLang: unknown, lang: string): string[] {
  if (!altLabelByLang || typeof altLabelByLang !== "object" || Array.isArray(altLabelByLang)) return [];
  const value = (altLabelByLang as Record<string, unknown>)[lang];
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}
