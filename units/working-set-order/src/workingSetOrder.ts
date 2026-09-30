/**
 * Display order for a working set the host already loaded, and the address parameters
 * that name that set. This is not a search. It does not drop rows. It does not know types.
 */

export interface WorkingSetParams {
  vaultIds: readonly string[];
  typeIds: readonly string[];
}

export type SortKey = "date" | "name" | "type";
export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: "date", dir: "desc" };

export interface FacetableItem {
  id: string;
  vaultId: string;
  typeUri: string;
  name: string;
  updatedAt: number;
}

export const EMPTY_WORKING_SET: WorkingSetParams = { vaultIds: [], typeIds: [] };

export const WORKING_SET_URL = {
  vaults: "wsp",
  types: "wst",
  sort: "sort",
} as const;

export interface VaultPathNode {
  vaultId: string;
  label: string;
  parentVaultId?: string | null;
}

export function isAllVaults(params: WorkingSetParams): boolean {
  return params.vaultIds.length === 0;
}

export function isAllTypes(params: WorkingSetParams): boolean {
  return params.typeIds.length === 0;
}

function alphaKey(name: string): string {
  return (name || "").trim().toLowerCase() || "\uffff";
}

/**
 * A new array. The input is not reordered.
 * Date, name, and type use `dir`. A tie then sorts by name A to Z, and that secondary
 * order is not reversed. A remaining tie sorts by id, and that is not reversed either.
 * `typeLabel` is used only for a type sort. Omit it and the raw type address is the label,
 * which is not the label the register shows.
 */
export function sortWorkingSetItems<T extends FacetableItem>(
  items: readonly T[],
  sort: SortState = DEFAULT_SORT,
  typeLabel?: (typeUri: string) => string,
): T[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const copy = [...items];
  copy.sort((a, b) => {
    let primary = 0;
    switch (sort.key) {
      case "date":
        primary = a.updatedAt - b.updatedAt;
        break;
      case "name":
        primary = alphaKey(a.name).localeCompare(alphaKey(b.name), undefined, {
          sensitivity: "base",
        });
        break;
      case "type": {
        const left = typeLabel?.(a.typeUri) ?? a.typeUri;
        const right = typeLabel?.(b.typeUri) ?? b.typeUri;
        primary = left.localeCompare(right, undefined, { sensitivity: "base" });
        break;
      }
    }
    if (primary !== 0) return primary * dir;
    if (sort.key !== "name") {
      const secondary = alphaKey(a.name).localeCompare(alphaKey(b.name), undefined, {
        sensitivity: "base",
      });
      if (secondary !== 0) return secondary;
    }
    return a.id.localeCompare(b.id);
  });
  return copy;
}

/** Same column flips direction. A new date column starts newest-first. Name and type start A to Z. */
export function nextSortState(current: SortState, column: SortKey): SortState {
  if (current.key === column) {
    return { key: column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key: column, dir: column === "date" ? "desc" : "asc" };
}

/** Null or a blank raw value is a new default object. An unknown key is the same. "date" alone is oldest-first. */
export function parseSortParam(raw: string | null): SortState {
  if (!raw) return { key: DEFAULT_SORT.key, dir: DEFAULT_SORT.dir };
  const desc = raw.endsWith("-");
  const key = (desc ? raw.slice(0, -1) : raw) as SortKey;
  if (key !== "date" && key !== "name" && key !== "type") {
    return { key: DEFAULT_SORT.key, dir: DEFAULT_SORT.dir };
  }
  if (raw === "date" || raw === "date-") {
    return { key: "date", dir: raw === "date" ? "asc" : "desc" };
  }
  return { key, dir: desc ? "desc" : "asc" };
}

/** The default newest-first date is null, not the text "date-". */
export function serializeSortParam(sort: SortState): string | null {
  if (sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir) return null;
  if (sort.key === "date" && sort.dir === "desc") return null;
  return sort.dir === "desc" ? `${sort.key}-` : sort.key;
}

export function parseWorkingSetParams(get: (key: string) => string | null): WorkingSetParams {
  const vaults = (get(WORKING_SET_URL.vaults) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const types = (get(WORKING_SET_URL.types) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return { vaultIds: vaults, typeIds: types };
}

/** Writes the vault and type parameters only. An empty list is null, not "". Does not write the sort. */
export function writeWorkingSetParams(
  params: WorkingSetParams,
  set: (key: string, value: string | null) => void,
): void {
  set(WORKING_SET_URL.vaults, params.vaultIds.length ? params.vaultIds.join(",") : null);
  set(WORKING_SET_URL.types, params.typeIds.length ? params.typeIds.join(",") : null);
}

/**
 * Root first, then the open vault. An id that is not in the list is an empty path.
 * A parent that is not in the list stops the walk. A repeated id is not added again.
 */
export function vaultPathTowardRoot(
  vaultId: string | null | undefined,
  vaults: readonly VaultPathNode[],
): { vaultId: string; label: string }[] {
  if (!vaultId) return [];
  const byId = new Map(vaults.map((node) => [node.vaultId, node]));
  const chain: { vaultId: string; label: string }[] = [];
  let current: string | null | undefined = vaultId;
  const seen = new Set<string>();
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    chain.push({ vaultId: node.vaultId, label: node.label });
    current = node.parentVaultId ?? null;
  }
  return chain.reverse();
}
