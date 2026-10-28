// How a type is named in a working-set facet (`typeFacetKey`), and the text match over the loaded holdings.
// Taken from the app's working-set facet file: the symbols the hooks and the host reach.

import { normalizeTypeUri, resolveType } from "@kaigilb/gilbplatformcode-record-types";

export interface FacetableItem {
  id: string;
  /** Vault namespace the item belongs to (authorized holdings attribution). */
  vaultId: string;
  /** Wire / CURIE type URI. */
  typeUri: string;
  /** Display name for alpha sort / search. */
  name: string;
  /** Epoch ms for date sort (newest first = higher first when desc). */
  updatedAt: number;
}

/** Normalize a type facet token to the registry id when known, else bare lowercased name. */
export function typeFacetKey(typeUriOrId: string): string {
  const spec = resolveType(typeUriOrId);
  if (spec) return spec.id;
  const n = normalizeTypeUri(typeUriOrId);
  const bare = n.includes("/base/t/")
    ? n.slice(n.lastIndexOf("/") + 1)
    : n.startsWith("t:")
      ? n.slice(2)
      : n;
  return bare.toLowerCase() || typeUriOrId.toLowerCase();
}

/**
 * Text match over a working-set item (name + type label). Used when Register search
 * filters the already-loaded facet-composed list (and as fallback when server Find fails).
 * Case-insensitive substring; empty query matches nothing (caller should not call).
 */
export function matchWorkingSetQuery<T extends FacetableItem>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    const typeKey = typeFacetKey(item.typeUri);
    if (typeKey.includes(q)) return true;
    const spec = resolveType(item.typeUri);
    if (spec?.label?.toLowerCase().includes(q)) return true;
    return false;
  });
}
