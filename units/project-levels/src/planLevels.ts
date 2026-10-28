// A project's levels are CauseEffectLevel records in its vault. A record's a:level
// stays the token: the level's tag without the leading "Level.".
// The host writes the defaults, and only when a level is set or added, after a fresh
// read of every level in the vault succeeded and found none. Never on a view.

import { useCallback, useContext, useMemo } from "react";
import { rowServedFact } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { isTypeName } from "@kaigilb/gilbplatformcode-type-key";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { ProjectLevelsHostContext } from "./projectLevelsHost";

const LEVELS_UNREAD = "Could not read every level of this vault.";

export const NOT_A_PROJECT_LEVEL = "not one of this project's levels";

/** Select value that opens the add-level form. Never stored as a:level. */
export const ADD_LEVEL = "__add_level__";

export const DEFAULT_LEVELS: readonly {
  token: string;
  label: string;
  position: number;
  ontologyTerm: string;
}[] = [
  {
    token: "Business",
    label: "Business",
    position: 1,
    get ontologyTerm() {
      return `${termOrigin()}/base/t/BusinessLevel`;
    },
  },
  {
    token: "Stakeholder",
    label: "Stakeholder",
    position: 2,
    get ontologyTerm() {
      return `${termOrigin()}/base/t/StakeholderLevel`;
    },
  },
  {
    token: "Product",
    label: "Product",
    position: 3,
    get ontologyTerm() {
      return `${termOrigin()}/base/t/ProductLevel`;
    },
  },
  {
    token: "Solution",
    label: "Solution",
    position: 4,
    get ontologyTerm() {
      return `${termOrigin()}/base/t/SolutionLevel`;
    },
  },
];

export type LevelRecord = {
  id: string;
  entityUri?: string | null;
  typeUri: string;
  facts: Record<string, string>;
  served?: { facts?: Readonly<Record<string, unknown>> } | null;
};

export type LevelNode = {
  token: string;
  label: string;
  depth: number;
  record: LevelRecord | null;
};

/** The level token a tag names. `Level.Product.Sub` → `Product.Sub`. */
export function tokenOf(tag: string): string {
  const t = tag.trim();
  if (t.startsWith("Level.")) return t.slice("Level.".length);
  return t;
}

/** The tag a token is stored under. `Product.Sub` → `Level.Product.Sub`. */
export function tagOf(token: string): string {
  const t = token.trim();
  if (!t) return "";
  if (t.startsWith("Level.")) return t;
  return `Level.${t}`;
}

/** "Sub Product" → "SubProduct". Words split on anything that is not a letter or digit. */
export function pascalCase(label: string): string {
  return label
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export function isDefaultLevelToken(token: string): boolean {
  return DEFAULT_LEVELS.some((d) => d.token === token);
}

/** Empty is unset. A tree member or one of the four defaults is a project level. */
export function levelKnown(token: string, tree: readonly { token: string }[]): boolean {
  const t = token.trim();
  if (!t) return true;
  return tree.some((n) => n.token === t) || isDefaultLevelToken(t);
}

export function isCauseEffectLevel(record: { typeUri?: string | null }): boolean {
  return isTypeName(record.typeUri ?? "", "CauseEffectLevel");
}

function rawFact(record: LevelRecord, slug: string): unknown {
  return rowServedFact(record, slug);
}

function refOf(raw: unknown): string | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return refOf(JSON.parse(text) as unknown);
      } catch {
        return null;
      }
    }
    return text;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = refOf(item);
      if (id) return id;
    }
    return null;
  }
  if (raw && typeof raw === "object") {
    const id = (raw as Record<string, unknown>)["@id"];
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function parentRef(record: LevelRecord): string | null {
  return refOf(rawFact(record, "partOf"));
}

function positionOf(record: LevelRecord | null): number {
  if (!record) return Number.POSITIVE_INFINITY;
  const raw = rawFact(record, "levelPosition");
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function tokenOfRecord(record: LevelRecord): string {
  const raw = rawFact(record, "unitTag");
  if (typeof raw === "string" && raw.trim()) return tokenOf(raw);
  return record.id;
}

function labelOf(record: LevelRecord, token: string): string {
  const raw = rawFact(record, "label");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const last = token.split(".").pop();
  return last || token;
}

function sameLevel(ref: string, record: LevelRecord): boolean {
  if (ref === record.id) return true;
  if (record.entityUri && ref === record.entityUri) return true;
  return ref.endsWith(`/${record.id}`);
}

function compareLevels(a: LevelRecord, b: LevelRecord): number {
  const pa = positionOf(a);
  const pb = positionOf(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  const la = labelOf(a, tokenOfRecord(a));
  const lb = labelOf(b, tokenOfRecord(b));
  if (la !== lb) return la < lb ? -1 : 1;
  const ta = tokenOfRecord(a);
  const tb = tokenOfRecord(b);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/**
 * Depth-first. Siblings by a:levelPosition, then label, then token.
 * A self-parent is a root. A cycle is walked once and does not hang.
 */
export function levelTree(records: readonly LevelRecord[]): LevelNode[] {
  const levels = records.filter((r) => r && isCauseEffectLevel(r));
  const children = new Map<string, LevelRecord[]>();
  const roots: LevelRecord[] = [];
  for (const record of levels) {
    const ref = parentRef(record);
    const self = !!ref && sameLevel(ref, record);
    const parent = !ref || self ? null : levels.find((other) => other.id !== record.id && sameLevel(ref, other)) ?? null;
    if (!parent) roots.push(record);
    else {
      const list = children.get(parent.id) ?? [];
      list.push(record);
      children.set(parent.id, list);
    }
  }
  roots.sort(compareLevels);
  for (const list of children.values()) list.sort(compareLevels);

  const out: LevelNode[] = [];
  const seen = new Set<string>();
  const walk = (node: LevelRecord, depth: number) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const token = tokenOfRecord(node);
    out.push({ token, label: labelOf(node, token), depth, record: node });
    for (const child of children.get(node.id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  if (seen.size < levels.length) {
    const rest = levels.filter((r) => !seen.has(r.id)).sort(compareLevels);
    for (const node of rest) walk(node, 0);
  }
  return out;
}

export function defaultLevelTree(): LevelNode[] {
  return DEFAULT_LEVELS.map((d) => ({ token: d.token, label: d.label, depth: 0, record: null }));
}

/** A stored default missing from a custom tree stays selected. An unknown token is not offered. */
export function pickerNodes(tree: readonly LevelNode[], stored: string): LevelNode[] {
  const token = stored.trim();
  if (!token || tree.some((n) => n.token === token) || !isDefaultLevelToken(token)) return [...tree];
  return [{ token, label: token, depth: 0, record: null }, ...tree];
}

export function optionLabel(node: LevelNode): string {
  const indent = "\u00A0\u00A0".repeat(node.depth);
  const token = node.token !== node.label ? ` · ${node.token}` : "";
  return `${indent}${node.label}${token}`;
}
export function directChildren(tree: readonly LevelNode[], parentToken: string): LevelNode[] {
  const parent = tree.find((n) => n.token === parentToken);
  if (!parent) return [];
  const start = tree.indexOf(parent);
  const out: LevelNode[] = [];
  for (let i = start + 1; i < tree.length; i++) {
    const node = tree[i]!;
    if (node.depth <= parent.depth) break;
    if (node.depth === parent.depth + 1) out.push(node);
  }
  return out;
}

export function nextPosition(tree: readonly LevelNode[], parentToken: string | null): number {
  const siblings = parentToken ? directChildren(tree, parentToken) : tree.filter((n) => n.depth === 0);
  const positions = siblings.map((n) => positionOf(n.record)).filter((n) => Number.isFinite(n));
  return positions.length ? Math.max(...positions) + 1 : 1;
}

export function levelTag(node: LevelNode): string {
  if (node.record) {
    const raw = rawFact(node.record, "unitTag");
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return tagOf(node.token);
}

function unreadError(error: unknown): Error {
  return error instanceof Error ? error : new Error(LEVELS_UNREAD);
}

/**
 * The vault's level tree, or the four defaults when it has no level records.
 * Reading does not write. `ensure` / `add` write, and only when a level is set or added.
 */
export function useProjectLevels(vaultId: string): {
  tree: LevelNode[];
  hasStored: boolean;
  ensure: () => Promise<GridRecord[]>;
  add: (label: string, parentToken: string | null) => Promise<string>;
} {
  const host = useContext(ProjectLevelsHostContext);
  if (!host) throw new Error("project-levels: wrap the app in <ProjectLevelsHostContext.Provider value={host}>");
  const levels = host.useAllLevels(vaultId);
  const stored = levels.data ?? [];
  const hasStored = levels.isSuccess && stored.length >= 1;
  const tree = useMemo(() => (hasStored ? levelTree(stored) : defaultLevelTree()), [hasStored, stored]);
  const ensure = useCallback(async () => {
    if (levels.isError) throw unreadError(levels.error);
    if (!levels.isSuccess) await host.waitForLevels(vaultId);
    return host.ensureDefaultLevels(vaultId);
  }, [vaultId, host, levels.isError, levels.error, levels.isSuccess]);
  const add = useCallback(async (label: string, parentToken: string | null) => {
    if (levels.isError) throw unreadError(levels.error);
    if (!levels.isSuccess) await host.waitForLevels(vaultId);
    return host.addProjectLevel(vaultId, label, parentToken);
  }, [vaultId, host, levels.isError, levels.error, levels.isSuccess]);
  return { tree, hasStored, ensure, add };
}
