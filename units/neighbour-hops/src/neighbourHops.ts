/**
 * How many hops to walk outward from the selected record.
 *
 * The four filter words are the same four as `units/relation-count`
 * `hopDepthForFilter`: `"1"`, `"2"`, `"3"`, `"all"`.
 * That function returns null for `"all"`. This function turns that null
 * into 3, and only when a real selection is present. Do not change one
 * without the other.
 */

export type RelationCountFilter = "1" | "2" | "3" | "all";

/** Hops walked when the filter is `all` and a record is selected. */
export const ALL_SELECTED_HOPS = 3;

/**
 * Hop depth for this filter and this selection.
 *
 * No selection, or a selection whose id starts with `temp:` → 0.
 * `"1"` `"2"` `"3"` → that number.
 * `"all"` → 3.
 *
 * `temp:` is exact and case-sensitive. `temporary` is a real id.
 * An empty string is no selection.
 */
export function neighbourhoodHopsFor(
  filter: RelationCountFilter,
  selectedId: string | null | undefined,
): number {
  if (!selectedId || selectedId.startsWith("temp:")) return 0;
  if (filter === "1") return 1;
  if (filter === "2") return 2;
  if (filter === "3") return 3;
  return ALL_SELECTED_HOPS;
}
