export interface VaultParentRef {
  entity?: string;
  vaultId: string;
}

export interface VaultListItem {
  vaultId: string;
  name?: string | null;
  entity?: string;
  parent?: VaultParentRef | null;
  parentAmbiguous?: boolean;
  isLanding?: boolean;
  modes?: readonly string[];
}

export interface VaultTreeRow {
  vault: VaultListItem;
  depth: number;
}

/** The stored name, else the first hostname label when the path is `/base`, else the last path part. */
export function vaultLabel(vault: { name?: string | null; vaultId: string }): string {
  const named = vault.name?.trim();
  if (named) return named;
  try {
    const u = new URL(vault.vaultId);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (path === "/base") {
      const label = u.hostname.split(".")[0]?.trim();
      if (label) return label;
    }
  } catch {
    /* not a URL */
  }
  const tail = vault.vaultId.slice(vault.vaultId.lastIndexOf("/") + 1);
  return tail && tail !== "base" ? tail : `Vault ${vault.vaultId.slice(-8)}`;
}

export function canWriteVault(vault: { modes?: readonly string[] }): boolean {
  return (vault.modes ?? []).includes("write");
}

export function canReadVault(vault: { modes?: readonly string[] }): boolean {
  return (vault.modes ?? []).includes("read");
}

/** Unknown and empty both mean nowhere to write. Order is the order given. */
export function writableVaults(vaults: readonly VaultListItem[] | null | undefined): VaultListItem[] {
  return (vaults ?? []).filter(canWriteVault);
}

/**
 * The vault on screen when it can be written, else the landing vault, else the first writable one.
 * Nowhere to write returns null. It does not invent a destination.
 */
export function defaultWriteVaultId(
  vaults: readonly VaultListItem[] | null | undefined,
  viewedVaultId: string | null | undefined,
): string | null {
  const writable = writableVaults(vaults);
  if (writable.length === 0) return null;
  const viewed = viewedVaultId ? writable.find((p) => p.vaultId === viewedVaultId) : undefined;
  if (viewed) return viewed.vaultId;
  const landing = writable.find((p) => p.isLanding);
  if (landing) return landing.vaultId;
  const first = writable[0];
  return first ? first.vaultId : null;
}

/**
 * Landing vault first, then other roots, children under a parent that is also in the list.
 * A parent outside the list, or an ambiguous parent, is a root. A loop stops.
 */
export function orderVaultsAsTree(vaults: readonly VaultListItem[]): VaultTreeRow[] {
  const byEntity = new Map<string, VaultListItem>();
  const byVaultId = new Map<string, VaultListItem>();
  for (const p of vaults) {
    byVaultId.set(p.vaultId, p);
    if (p.entity) byEntity.set(p.entity, p);
  }

  const childrenOf = new Map<string, VaultListItem[]>();
  const roots: VaultListItem[] = [];

  for (const p of vaults) {
    if (p.parentAmbiguous || !p.parent) {
      roots.push(p);
      continue;
    }
    const parentInList = (p.parent.entity ? byEntity.has(p.parent.entity) : false) || byVaultId.has(p.parent.vaultId);
    if (!parentInList) {
      roots.push(p);
      continue;
    }
    const parentKey = (p.parent.entity ? byEntity.get(p.parent.entity)?.vaultId : undefined) ?? p.parent.vaultId;
    const list = childrenOf.get(parentKey) ?? [];
    list.push(p);
    childrenOf.set(parentKey, list);
  }

  const byLabel = (a: VaultListItem, b: VaultListItem) =>
    vaultLabel(a).localeCompare(vaultLabel(b), undefined, { sensitivity: "base" });
  roots.sort(byLabel);
  for (const kids of childrenOf.values()) kids.sort(byLabel);

  const out: VaultTreeRow[] = [];
  const seen = new Set<string>();

  function walk(p: VaultListItem, depth: number) {
    if (seen.has(p.vaultId)) return;
    seen.add(p.vaultId);
    out.push({ vault: p, depth });
    for (const kid of childrenOf.get(p.vaultId) ?? []) walk(kid, depth + 1);
  }

  const landing = vaults.find((p) => p.isLanding) ?? null;
  if (landing) walk(landing, 0);
  for (const r of roots) walk(r, 0);
  for (const p of vaults) {
    if (!seen.has(p.vaultId)) out.push({ vault: p, depth: 0 });
  }
  return out;
}
