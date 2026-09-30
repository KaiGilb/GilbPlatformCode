/**
 * Which vaults to load when a parent may include its children.
 *
 * The query flag is off by default. A parent then loads only itself.
 * Turning it on adds descendants that are already in the list you pass.
 * This does not invent a vault, and it does not fetch.
 *
 * An empty selection does not mean "every vault". See {@link contentVaultIds}.
 */

/** Query key the app already uses. A host may pass a different key to the readers. */
export const INCLUDE_CHILDREN_PARAM = "wsc";

export interface VaultChildNode {
  vaultId: string;
  /** Direct parent. Null or omitted means this vault is not a child. */
  parent?: { vaultId: string } | null;
  /**
   * True when the store could not say which parent.
   * An ambiguous parent is not a child of anyone, even if `parent` is filled in.
   */
  parentAmbiguous?: boolean;
}

/**
 * True only when the query value is the string `"1"`.
 * `"true"`, `"yes"`, `"0"`, and a missing value are false.
 */
export function parseIncludeChildren(
  get: (key: string) => string | null,
  param = INCLUDE_CHILDREN_PARAM,
): boolean {
  return get(param) === "1";
}

/**
 * Writes `"1"` when on, and `null` when off.
 * `null` means remove the key. It does not write `"0"`.
 * A host that writes `"0"` still parses as off.
 */
export function writeIncludeChildren(
  on: boolean,
  set: (key: string, value: string | null) => void,
  param = INCLUDE_CHILDREN_PARAM,
): void {
  set(param, on ? "1" : null);
}

/** True when `child` sits directly under `parentVaultId`. Ambiguous is false. */
export function isDirectChildOf(child: VaultChildNode, parentVaultId: string): boolean {
  if (child.parentAmbiguous || !child.parent) return false;
  return child.parent.vaultId === parentVaultId;
}

/** Direct children of `parentVaultId`, in the order they appear in `vaults`. */
export function directChildVaults(
  parentVaultId: string,
  vaults: readonly VaultChildNode[],
): VaultChildNode[] {
  return vaults.filter((vault) => isDirectChildOf(vault, parentVaultId));
}

/**
 * True when any selected vault has a direct, unambiguous child in `vaults`.
 * An empty `vaultIds` asks the question of the whole list: true when any vault's
 * parent id is also a vault in the list, and that link is not ambiguous.
 * A parent id that is not in the list does not count, for the empty question.
 */
export function selectionHasChildren(
  vaultIds: readonly string[],
  vaults: readonly VaultChildNode[],
): boolean {
  const parents = vaultIds.length > 0 ? vaultIds : vaults.map((vault) => vault.vaultId);
  const parentSet = new Set(parents);
  return vaults.some(
    (vault) =>
      vault.parent != null && parentSet.has(vault.parent.vaultId) && !vault.parentAmbiguous,
  );
}

/**
 * The ids you passed, then their descendants, breadth-first.
 *
 * - An id you asked for is kept even when it is not in `vaults`.
 * - A descendant is added only when it appears in `vaults` as an unambiguous child.
 * - Each id is emitted once, the first time it is reached. A loop stops.
 * - Children of one parent come out in the order those children appear in `vaults`.
 * - An empty input returns an empty array. It does not return every vault.
 */
export function expandWithDescendants(
  vaultIds: readonly string[],
  vaults: readonly VaultChildNode[],
): string[] {
  if (vaultIds.length === 0) return [];
  const childrenOf = new Map<string, string[]>();
  for (const vault of vaults) {
    if (!vault.parent || vault.parentAmbiguous) continue;
    const list = childrenOf.get(vault.parent.vaultId) ?? [];
    list.push(vault.vaultId);
    childrenOf.set(vault.parent.vaultId, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [...vaultIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return out;
}

/**
 * Vault ids whose content should be loaded for this selection.
 *
 * - A non-empty `workingSet.vaultIds` → those ids, plus descendants when `includeChildren` is true.
 * - An empty selection and a shell id → that one shell id, plus its descendants when children are on.
 * - An empty selection and no shell id → `[]`.
 *
 * An empty selection does not load every reachable vault. A search across all vaults is a different job.
 * A blank shell id (`""`) is treated as no shell.
 * The result is de-duplicated. First occurrence wins. Order is the order from {@link expandWithDescendants},
 * or the base order when children are off.
 * Only `vaultIds` is read off `workingSet`. Other fields are ignored.
 */
export function contentVaultIds(
  workingSet: { vaultIds: readonly string[] },
  shellVaultId: string | null | undefined,
  vaults: readonly VaultChildNode[],
  includeChildren: boolean,
): string[] {
  const base =
    workingSet.vaultIds.length > 0
      ? [...workingSet.vaultIds]
      : shellVaultId
        ? [shellVaultId]
        : [];
  if (base.length === 0) return [];
  const expanded = includeChildren ? expandWithDescendants(base, vaults) : base;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of expanded) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Ids to keep when you filter a merged list.
 *
 * When children are off, or the selection is empty, the same array you passed is returned.
 * Do not mutate it. When children are on, a new array is returned, with descendants added.
 * Merge it back yourself:
 *
 * ```ts
 * const vaultIds = filterWorkingSetVaultIds(workingSet.vaultIds, vaults, includeChildren);
 * const next = vaultIds === workingSet.vaultIds ? workingSet : { ...workingSet, vaultIds };
 * ```
 */
export function filterWorkingSetVaultIds(
  vaultIds: readonly string[],
  vaults: readonly VaultChildNode[],
  includeChildren: boolean,
): readonly string[] {
  if (vaultIds.length === 0 || !includeChildren) return vaultIds;
  return expandWithDescendants(vaultIds, vaults);
}
