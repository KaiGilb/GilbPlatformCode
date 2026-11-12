export interface VaultParentRef {
  entity?: string;
  vaultId: string;
}

export interface VaultListItem {
  vaultId: string;
  name?: string | null;
  shortName?: string | null;
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

/**
 * How to name a vault, first match wins: (1) the stored `name`, trimmed; (2) `shortName`, trimmed; (3) when the address path is exactly
 * `/base` or exactly `/vault` (trailing slashes ignored), the first hostname label; (4) the last path part, never the bare words
 * "vault" or "base" and never empty; (5) `Vault <last 8 characters of the address>`.
 */
export function vaultLabel(vault: { name?: string | null; shortName?: string | null; vaultId: string }): string {
  const named = vault.name?.trim();
  if (named) return named;
  const short = vault.shortName?.trim();
  if (short) return short;
  try {
    const u = new URL(vault.vaultId);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (path === "/base" || path === "/vault") {
      const label = u.hostname.split(".")[0]?.trim();
      if (label) return label;
    }
  } catch {
    /* not a URL */
  }
  const tail = vault.vaultId.slice(vault.vaultId.lastIndexOf("/") + 1);
  const bare = tail.toLowerCase();
  return tail && bare !== "vault" && bare !== "base" ? tail : `Vault ${vault.vaultId.slice(-8)}`;
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

function hostOf(text: string): string | null {
  try {
    return new URL(text).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The vault's one root, exactly as the vault list gives it (`vaultId`), for a host (`kai.example.test`, or any
 * address on it) or a stored name. A host match wins over a name. `null` when nothing is listed for it, or when
 * a name fits more than one vault. ⛔ The root is never composed: a user vault ends in `/vault`, a platform one
 * in `/base`, and only the list knows which.
 */
export function vaultRootFromList(
  vaults: readonly { vaultId: string; name?: string | null }[] | null | undefined,
  hostOrName: string,
): string | null {
  const asked = hostOrName.trim().toLowerCase();
  if (!asked || !vaults) return null;
  const host = hostOf(asked) ?? hostOf(`https://${asked}`);
  if (host) {
    const byHost = vaults.find((v) => hostOf(v.vaultId) === host);
    if (byHost) return byHost.vaultId;
  }
  const byName = vaults.filter((v) => (v.name ?? "").trim().toLowerCase() === asked);
  return byName.length === 1 ? (byName[0] as { vaultId: string }).vaultId : null;
}

/** One row of a vault chooser: a vault, how to name it, whose it is, and whether it can only be read. */
export interface VaultChoice {
  vaultId: string;
  /** `vaultLabel` of the vault. */
  label: string;
  /** `isYours` said yes for it. */
  yours: boolean;
  /** The vault lists no `write` mode: it can be read, not changed. */
  viewOnly: boolean;
}

/**
 * The rows of a vault chooser: one per vault, the person's own first, then the rest, each group in the order given. `label` is
 * `vaultLabel`, and `viewOnly` is "no write mode" (a vault with no `modes` is view only, as `canWriteVault` reads it). The caller decides
 * what "yours" means (a remembered vault id, a name rule), because the list carries no owner field.
 *
 * @param vaults the vaults to offer (already filtered to the app's type, if it wants only one)
 * @param isYours true for the person's own vault(s)
 */
export function vaultChoices<V extends { vaultId: string; name?: string | null; shortName?: string | null; modes?: readonly string[] }>(
  vaults: readonly V[],
  isYours: (v: V) => boolean,
): VaultChoice[] {
  const rows = vaults.map((v) => ({ vaultId: v.vaultId, label: vaultLabel(v), yours: isYours(v), viewOnly: !canWriteVault(v) }));
  return [...rows.filter((r) => r.yours), ...rows.filter((r) => !r.yours)];
}

/** The words of a {@link choiceLine}. */
export interface ChoiceWords {
  yours: string;
  shared: string;
  viewOnly: string;
}

const DEFAULT_CHOICE_WORDS: ChoiceWords = { yours: "Yours", shared: "Shared with you", viewOnly: "View only" };

/**
 * The second line of a chooser row: "Yours" or "Shared with you", then " · View only" when the vault cannot be written.
 * `words` replaces any of the three phrases (for another language or tone).
 */
export function choiceLine(c: Pick<VaultChoice, "yours" | "viewOnly">, words: Partial<ChoiceWords> = {}): string {
  const w = { ...DEFAULT_CHOICE_WORDS, ...words };
  return `${c.yours ? w.yours : w.shared}${c.viewOnly ? ` · ${w.viewOnly}` : ""}`;
}
