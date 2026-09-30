/** Last segment of a namespaced tag. `ReuseRegistry.Marbesa` → `Marbesa`. */
export function lookupValueLeaf(tag: string | null | undefined): string {
  if (typeof tag !== "string") return "";
  const t = tag.trim();
  if (t === "") return "";
  const i = t.lastIndexOf(".");
  return i >= 0 ? t.slice(i + 1) : t;
}

/** The painted body is the stored body. A leading byte-order mark is not part of the text. */
export function presentLookupValueBody(body: string): string {
  return body.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

/** The stored tag is the leaf the person typed. The table name is not glued on. */
export function namespacedLookupUnitTag(leaf: string): string {
  const raw = leaf.trim();
  return lookupValueLeaf(raw) || raw;
}
