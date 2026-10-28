// Where a dragged row of a tree lands. Pure: no DOM, no @dnd-kit, no I/O.
//
// The tree is read as a flat list of visible rows, top to bottom, each with its depth. A drop is a place BETWEEN
// two rows (`gap` = how many rows are above the line) at a `depth`. The depth decides the parent: the nearest row above
// the line one level up. A row cannot go inside itself or its own parts; the caller may refuse anything else.

export type TreeRow = {
  id: string;
  /** The row this one is a child of; null for a top-level row. */
  parentId: string | null;
  depth: number;
  /** What is said for it, e.g. "Hip". */
  label: string;
};

export type DropTarget = {
  ok: true;
  activeId: string;
  /** The new parent (null: the top level). */
  parentId: string | null;
  /** Place among the new parent's children, the dragged row not counted. */
  index: number;
  /** The line: rows above it (in the list as drawn, the dragged row counted) and the depth it is drawn at. */
  gap: number;
  depth: number;
  /** True when this is where the row already is. */
  unchanged: boolean;
  /** For the words said: the new parent's label and the sibling it goes after (null: first). */
  parentLabel: string | null;
  afterLabel: string | null;
};

export type DropRefusal = { ok: false; activeId: string; reason: string; gap: number; depth: number };

export type DropVerdict = DropTarget | DropRefusal;

/** The caller's own rule. Return a sentence to refuse this move, or null. */
export type RefuseMove = (move: { activeId: string; parentId: string | null; index: number }) => string | null;

/** The row and the rows that follow it deeper than it: the whole part moves with its own parts. */
export function subtreeSize(rows: readonly TreeRow[], at: number): number {
  const top = rows[at];
  if (!top) return 0;
  let size = 1;
  while (at + size < rows.length && rows[at + size]!.depth > top.depth) size += 1;
  return size;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** The depths a line at `gap` can sit at, in the rows given: as deep as a child of the row above, as shallow as the row below. */
export function depthRange(rows: readonly TreeRow[], gap: number): { min: number; max: number } {
  const above = rows[gap - 1];
  const below = rows[gap];
  return { min: below ? below.depth : 0, max: above ? above.depth + 1 : 0 };
}

export function insideItself(label: string): string {
  return `${label} cannot be put inside itself or its own parts.`;
}

export function resolveDrop(
  rows: readonly TreeRow[],
  activeId: string,
  rawGap: number,
  rawDepth: number,
  refuse?: RefuseMove,
): DropVerdict {
  const at = rows.findIndex((r) => r.id === activeId);
  const gap = clamp(Math.trunc(rawGap), 0, rows.length);
  if (at < 0) return { ok: false, activeId, reason: "That part is not in the list.", gap, depth: 0 };
  const active = rows[at]!;
  const size = subtreeSize(rows, at);
  if (gap > at && gap < at + size) {
    const full = depthRange(rows, gap);
    return { ok: false, activeId, reason: insideItself(active.label), gap, depth: clamp(rawDepth, full.min, full.max) };
  }
  // Without the dragged row and its parts: the list the drop is read in.
  const rest = rows.filter((_, i) => i < at || i >= at + size);
  const restGap = gap <= at ? gap : gap - size;
  const { min, max } = depthRange(rest, restGap);
  const depth = clamp(Math.trunc(rawDepth), min, max);
  const above = rest.slice(0, restGap);
  let parent: TreeRow | null = null;
  if (depth > 0) {
    for (let k = above.length - 1; k >= 0; k--) {
      if (above[k]!.depth === depth - 1) {
        parent = above[k]!;
        break;
      }
    }
    if (!parent) return { ok: false, activeId, reason: "There is no part to go under there.", gap, depth };
  }
  const parentId = parent ? parent.id : null;
  const before = above.filter((r) => r.parentId === parentId);
  const index = before.length;
  const own = rows.slice(0, at).filter((r) => r.parentId === active.parentId).length;
  const unchanged = parentId === active.parentId && index === own;
  const reason = refuse ? refuse({ activeId, parentId, index }) : null;
  if (reason) return { ok: false, activeId, reason, gap, depth };
  return {
    ok: true,
    activeId,
    parentId,
    index,
    gap,
    depth,
    unchanged,
    parentLabel: parent ? parent.label : null,
    afterLabel: before.length ? before[before.length - 1]!.label : null,
  };
}

/** The line to draw for a verdict: below the row `rowId` (or above the first row), at `depth`. */
export function lineOf(rows: readonly TreeRow[], verdict: DropVerdict): { rowId: string; edge: "top" | "bottom"; depth: number; ok: boolean } | null {
  if (rows.length === 0) return null;
  if (verdict.gap <= 0) return { rowId: rows[0]!.id, edge: "top", depth: verdict.depth, ok: verdict.ok };
  const above = rows[Math.min(verdict.gap, rows.length) - 1]!;
  return { rowId: above.id, edge: "bottom", depth: verdict.depth, ok: verdict.ok };
}

/** What is said for a place. "Hip moved under Joints" in the words a screen reader reads out. */
export function placeWords(label: string, verdict: DropVerdict): string {
  if (!verdict.ok) return verdict.reason;
  if (verdict.unchanged) return `${label} is back where it started`;
  const where = verdict.parentLabel ? `under ${verdict.parentLabel}` : "to the top level";
  const next = verdict.afterLabel ? `, after ${verdict.afterLabel}` : ", first";
  return `${label} moved ${where}${next}`;
}

/** The gap a vertical keyboard step reaches. A one-row part has two gaps that mean "stay"; the step does not stop on both. */
export function stepGap(rows: readonly TreeRow[], activeId: string, gap: number, dir: -1 | 1): number {
  const at = rows.findIndex((r) => r.id === activeId);
  const size = at < 0 ? 1 : subtreeSize(rows, at);
  let next = gap + dir;
  if (size === 1) {
    if (dir === 1 && gap === at) next = gap + 2;
    if (dir === -1 && gap === at + 1) next = gap - 2;
  }
  return clamp(next, 0, rows.length);
}

/** Flatten nested nodes depth-first into the rows the drop is read in. */
export function flattenTree<T>(
  nodes: readonly T[],
  read: (node: T) => { id: string; label: string; children: readonly T[] },
  parentId: string | null = null,
  depth = 0,
): TreeRow[] {
  const out: TreeRow[] = [];
  for (const node of nodes) {
    const item = read(node);
    out.push({ id: item.id, parentId, depth, label: item.label });
    out.push(...flattenTree(item.children, read, item.id, depth + 1));
  }
  return out;
}
