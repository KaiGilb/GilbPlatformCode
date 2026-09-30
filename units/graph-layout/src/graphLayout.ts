// Connection-graph layout — Cycle054 ring + Cycle055 VDS-2 T-B + VDS-3 ranks/barycentre
// + empty-selection global directed sort (first open, hop=all, nothing selected).
//
// Pure position function (no persistence, no randomness). Positions are DERIVED every
// layout pass and never written to any device-local store (3P.C.AppVaultSeparation /
// BASEAPP_02) — "there is nothing to drop". Deterministic so the view is stable
// across reloads and unit-testable. Layout never invents edges (3P.C.RealityDisclosure).
//
// ── Cycle055 VDS-3 two-phase algorithm (Kai Option 1 — hand-rolled, zero new deps) ──
//
// Phase 1 — directed rank assignment
//   WITH selection (signed integer ranks, selected = 0):
//   • Oriented pair edges form a directed subgraph (source → target only when
//     `oriented === true`). No invented arrows for undirected / multi-member edges.
//   • Downstream (outbound from selection): longest-path ranks along directed edges
//     → rank > 0 → larger y (below selection).
//   • Upstream (inbound into selection): longest-path ranks walking reverse directed
//     edges → rank < 0 → smaller y (above selection).
//   • Multi-parent / multi-child: longest path (max) so rank(A) < rank(B) for A→B
//     when both sit on a directed path from/to the selection and that is consistent.
//   • Undirected / co-member-only nodes: undirected BFS hop from selection; rank
//     inherits signed side from the first ranked BFS parent (default +hop when the
//     parent is the selection) — hop placement only, not a direction claim.
//   • Directed edges between two already-ranked nodes are tightened iteratively so
//     rank(source) < rank(target) when possible without moving the selection.
//
//   WITHOUT selection (global directed T-B — first Graph open):
//   • Roots (no inbound oriented edges among visible records) at rank 0 (top).
//   • Longest-path ranks along oriented edges only; sinks lower (larger y).
//   • Undirected co-members / hop fill from already-ranked nodes; pure isolates rank 0.
//   • Same barycentre + separateRows; no UI selection change (layout-only).
//   • If zero oriented edges → stable pack fallback (recordIds order).
//
// Phase 2 — barycentre reorder within each rank (Sugiyama-style crossing reduction)
//   • Nodes sharing the same integer rank form a horizontal row (same y).
//   • Alternating downward / upward passes (BARY_ITERS): reorder each rank by the
//     mean x of neighbours in the adjacent rank(s); stable id tie-break.
//   • After reorder, re-pack x with LAYER_DX and run separateRows for min separation.
//
// Geometry retained from VDS-2:
//   selected focus at (0,0); inbound up; outbound down; draggable overrides live
//   outside this pure function; hop-depth visibility is the caller's filter.
// Relation hubs + pendants still place from real member/anchor geometry only.

import type { AssembledEdge, PendantNodeSpec, RelationNodeSpec } from "./graphTypes";

export interface XY {
  x: number;
  y: number;
}

export interface LayoutOptions {
  /** Shell selection — T-B focus applies when this id is among `recordIds`. */
  selectedRecordId?: string | null;
}

/** Vertical gap between hop ranks (px). Generous for multi-line node cards. */
export const LAYER_DY = 180;
/** Horizontal gap between nodes in the same rank / row (px). */
export const LAYER_DX = 280;
/** @deprecated alias — prefer LAYER_DY for vertical rank spacing after T-B re-orient. */
export const LAYER_RANK = LAYER_DY;
/** Barycentre reorder passes (down + up pair counts as two half-sweeps inside). */
export const BARY_ITERS = 6;
/** Offset for pendant stubs from their anchor along the layer ray. */
const PENDANT_OFFSET = 130;
/** Relation-hub pull toward member centroid (0..1). */
const RELATION_PULL = 0.55;
/** No-selection pack: column width / row height. */
const PACK_DX = 220;
const PACK_DY = 100;
const PACK_COLS = 4;
/** Legacy ring constants (still used as fallback if pack is empty). */
const RING_MIN_RADIUS = 220;
const RING_PER_NODE = 26;
/** Max iterations for directed rank-tightening (A→B ⇒ rank(A) < rank(B)). */
const RANK_TIGHTEN_ITERS = 16;
/** Orphan y when a visible record has no path on real edges. */
const ORPHAN_RANK = 4;

/**
 * Compute a stable position for every node id in the VISIBLE set.
 *
 * Callers should pass only currently displayed records / derived nodes / edges so a
 * hop-filter or selection change re-settles the visible subgraph cleanly.
 *
 * @param recordIds     ordered visible record ids (stable seed order within a rank)
 * @param relationNodes visible multi-member relation hubs
 * @param pendantNodes  visible pendant stubs
 * @param edges         visible edges (pair / member / pendant) — direction from
 *                      `oriented` pair edges only; never fabricates connectivity
 * @param options       `selectedRecordId` enables selection-centred T-B focus layout;
 *                      when null/absent, global directed T-B sort is used instead
 */
export function computeLayout(
  recordIds: readonly string[],
  relationNodes: readonly RelationNodeSpec[],
  pendantNodes: readonly PendantNodeSpec[],
  edges: readonly AssembledEdge[],
  options: LayoutOptions = {},
): Map<string, XY> {
  const selected = options.selectedRecordId ?? null;
  const pos =
    selected && recordIds.includes(selected)
      ? layoutTopBottom(recordIds, selected, edges)
      : layoutGlobalDirected(recordIds, edges);

  placeRelationNodes(pos, relationNodes, edges);
  placePendants(pos, pendantNodes);
  return pos;
}

// ── Default pack (no oriented edges / empty-selection fallback) ──────────────

function layoutDefaultPack(recordIds: readonly string[]): Map<string, XY> {
  const pos = new Map<string, XY>();
  const n = recordIds.length;
  if (n === 0) return pos;

  // Small sets stay on a ring so the empty-selection view still reads as a graph.
  if (n <= 8) {
    const radius = Math.max(RING_MIN_RADIUS, n * RING_PER_NODE);
    recordIds.forEach((id, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      pos.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    return pos;
  }

  const cols = Math.min(PACK_COLS, n);
  recordIds.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * PACK_DX;
    const y = row * PACK_DY;
    pos.set(id, { x, y });
  });
  return pos;
}

// ── Empty selection: global directed T-B (roots top, sinks lower) ────────────

/**
 * First-open / nothing-selected layout: global longest-path ranks on oriented edges
 * + barycentre within ranks. Does not change UI selection. Falls back to pack when
 * there are no oriented edges to sort by.
 */
function layoutGlobalDirected(
  recordIds: readonly string[],
  edges: readonly AssembledEdge[],
): Map<string, XY> {
  if (recordIds.length === 0) return new Map();

  const directed = buildDirectedMaps(recordIds, edges);
  if (directed.pairs.length === 0) {
    // Nothing directed to sort by — stable pack in caller order.
    return layoutDefaultPack(recordIds);
  }

  const pos = new Map<string, XY>();
  const undirected = buildUndirectedAdj(recordIds, edges);
  const rankOf = assignGlobalDirectedRanks(recordIds, undirected, directed);

  // Seed x from stable recordIds order within each rank (pre-barycentre).
  const byRank = new Map<number, string[]>();
  for (const id of recordIds) {
    const r = rankOf.get(id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(id);
    byRank.set(r, list);
  }
  for (const [r, ids] of byRank) {
    packRankX(ids, pos, r * LAYER_DY);
  }

  // Phase 2 — barycentre (no focus pin)
  barycentreReorder(rankOf, undirected, pos, null);
  separateRows(pos, recordIds);
  return pos;
}

/**
 * Global (unsigned) ranks: roots = 0, longest path along oriented edges, undirected
 * hop fill for co-members / isolates. Deterministic; no invented directions.
 */
function assignGlobalDirectedRanks(
  recordIds: readonly string[],
  undirected: Map<string, string[]>,
  directed: { out: Map<string, string[]>; inn: Map<string, string[]>; pairs: Array<[string, string]> },
): Map<string, number> {
  const rank = new Map<string, number>();
  const n = recordIds.length;
  const maxLen = Math.max(0, n - 1);

  const onDirected = new Set<string>();
  const inDeg = new Map<string, number>();
  for (const id of recordIds) inDeg.set(id, 0);
  for (const [s, t] of directed.pairs) {
    onDirected.add(s);
    onDirected.add(t);
    inDeg.set(t, (inDeg.get(t) ?? 0) + 1);
  }

  // Seed roots: zero inbound among oriented subgraph; cycle-only → min id.
  const seedRoots = (): void => {
    const unranked = [...onDirected].filter((id) => !rank.has(id));
    if (unranked.length === 0) return;
    const roots = unranked.filter((id) => (inDeg.get(id) ?? 0) === 0).sort(cmpId);
    if (roots.length > 0) {
      for (const r of roots) rank.set(r, 0);
    } else {
      const first = unranked.sort(cmpId)[0];
      if (first !== undefined) rank.set(first, 0);
    }
  };

  seedRoots();

  // Longest-path relaxation; re-seed remaining cycle components until all directed nodes ranked.
  for (let guard = 0; guard < n + 2; guard++) {
    let changed = false;
    for (let sweep = 0; sweep < n; sweep++) {
      let sweepChanged = false;
      for (const [src, tgt] of directed.pairs) {
        const rs = rank.get(src);
        if (rs === undefined) continue;
        const next = rs + 1;
        if (next > maxLen) continue;
        const prev = rank.get(tgt);
        if (prev === undefined || next > prev) {
          rank.set(tgt, next);
          sweepChanged = true;
          changed = true;
        }
      }
      if (!sweepChanged) break;
    }
    const still = [...onDirected].some((id) => !rank.has(id));
    if (!still) break;
    seedRoots();
    if (!changed && still) {
      // Progress stuck (e.g. pure cycle already seeded): break after seed.
      const after = [...onDirected].some((id) => !rank.has(id));
      if (after) {
        // Force remaining min-id onto rank 0 and continue once more.
        const left = [...onDirected].filter((id) => !rank.has(id)).sort(cmpId);
        if (left.length === 0) break;
        const firstLeft = left[0];
        if (firstLeft !== undefined) rank.set(firstLeft, 0);
      } else break;
    }
  }

  // Undirected / co-member fill from already-ranked nodes (hop +1, not a direction claim).
  const queue = [...rank.keys()].sort(cmpId);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curRank = rank.get(cur) ?? 0;
    for (const next of undirected.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (!rank.has(next)) {
        rank.set(next, curRank + 1);
      }
      queue.push(next);
    }
  }

  // Pure isolates (no directed/undirected path): park at rank 0 (top band).
  for (const id of recordIds) {
    if (!rank.has(id)) rank.set(id, 0);
  }

  // Tighten oriented edges: prefer rank(source) < rank(target).
  for (let iter = 0; iter < RANK_TIGHTEN_ITERS; iter++) {
    let changed = false;
    for (const [src, tgt] of directed.pairs) {
      const rs = rank.get(src);
      const rt = rank.get(tgt);
      if (rs === undefined || rt === undefined) continue;
      if (rs < rt) continue;
      const next = rs + 1;
      if (next !== rt) {
        rank.set(tgt, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return rank;
}

// ── Graph construction (real edges only) ────────────────────────────────────

/**
 * Build undirected record–record adjacency from real assembled edges only.
 * - pair edges: both endpoints are records
 * - multi-member: co-reporters of the same relation hub are co-adjacent (same honesty
 *   as hop BFS — no fabricated partners)
 */
function buildUndirectedAdj(
  recordIds: readonly string[],
  edges: readonly AssembledEdge[],
): Map<string, string[]> {
  const inSet = new Set(recordIds);
  const adj = new Map<string, Set<string>>();
  for (const id of recordIds) adj.set(id, new Set());

  for (const e of edges) {
    if (e.kind !== "pair") continue;
    if (!inSet.has(e.source) || !inSet.has(e.target)) continue;
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const membersOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "member") continue;
    if (!inSet.has(e.source)) continue;
    const list = membersOf.get(e.target) ?? [];
    list.push(e.source);
    membersOf.set(e.target, list);
  }
  for (const members of membersOf.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        if (a === undefined || b === undefined) continue;
        adj.get(a)!.add(b);
        adj.get(b)!.add(a);
      }
    }
  }

  const out = new Map<string, string[]>();
  for (const [id, set] of adj) {
    out.set(id, [...set].sort());
  }
  return out;
}

/**
 * Directed neighbour maps from oriented pair edges only.
 * RealityDisclosure: undirected / non-oriented pairs never appear here.
 */
function buildDirectedMaps(
  recordIds: readonly string[],
  edges: readonly AssembledEdge[],
): { out: Map<string, string[]>; inn: Map<string, string[]>; pairs: Array<[string, string]> } {
  const inSet = new Set(recordIds);
  const outSets = new Map<string, Set<string>>();
  const inSets = new Map<string, Set<string>>();
  const pairs: Array<[string, string]> = [];

  for (const e of edges) {
    if (e.kind !== "pair" || !e.oriented) continue;
    if (!inSet.has(e.source) || !inSet.has(e.target)) continue;
    if (e.source === e.target) continue;
    let o = outSets.get(e.source);
    if (!o) {
      o = new Set();
      outSets.set(e.source, o);
    }
    let i = inSets.get(e.target);
    if (!i) {
      i = new Set();
      inSets.set(e.target, i);
    }
    if (!o.has(e.target)) {
      o.add(e.target);
      i.add(e.source);
      pairs.push([e.source, e.target]);
    }
  }

  const toSorted = (m: Map<string, Set<string>>): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const [k, set] of m) out.set(k, [...set].sort());
    return out;
  };

  // Stable pair order (source then target id) for deterministic tightening sweeps.
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });

  return { out: toSorted(outSets), inn: toSorted(inSets), pairs };
}

// ── Phase 1: directed ranks ─────────────────────────────────────────────────

/**
 * Longest-path distances from `root` following `adj` (forward edges).
 * Bellman–Ford–style relaxation, |V| sweeps, path length capped at |V|-1 so directed
 * cycles cannot inflate ranks without bound. Deterministic over Map iteration order
 * of `adj` (built with sorted neighbour lists).
 */
function longestPathFrom(
  root: string,
  adj: Map<string, string[]>,
  recordIds: readonly string[],
): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(root, 0);
  const n = recordIds.length;
  const maxLen = Math.max(0, n - 1);
  for (let sweep = 0; sweep < n; sweep++) {
    let changed = false;
    for (const [u, vs] of adj) {
      const du = dist.get(u);
      if (du === undefined) continue;
      for (const v of vs) {
        if (v === root) continue;
        const next = du + 1;
        if (next > maxLen) continue;
        const prev = dist.get(v);
        if (prev === undefined || next > prev) {
          dist.set(v, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return dist;
}

/**
 * Assign signed integer ranks: selected = 0, directed upstream negative, directed
 * downstream positive, undirected hop fill, then tighten oriented edges.
 */
function assignDirectedRanks(
  recordIds: readonly string[],
  selected: string,
  undirected: Map<string, string[]>,
  directed: { out: Map<string, string[]>; inn: Map<string, string[]>; pairs: Array<[string, string]> },
): Map<string, number> {
  const rank = new Map<string, number>();
  rank.set(selected, 0);

  // Downstream: longest path from selection along directed out-edges → +rank.
  const down = longestPathFrom(selected, directed.out, recordIds);
  for (const [id, d] of down) {
    if (id === selected) continue;
    rank.set(id, d);
  }

  // Upstream: longest path from selection along reverse directed edges → −rank.
  // `inn` maps target → sources, so walking inn from selected walks reverse arrows.
  const up = longestPathFrom(selected, directed.inn, recordIds);
  for (const [id, d] of up) {
    if (id === selected) continue;
    const proposed = -d;
    const existing = rank.get(id);
    if (existing === undefined) {
      rank.set(id, proposed);
    } else if (existing > 0 && proposed < 0) {
      // Node is both up- and down-stream of selection on directed paths (cycle / bow).
      // Prefer the longer absolute displacement so both arrows still have a vertical span;
      // if equal, keep the positive (outbound default — not a new direction claim on an edge).
      if (Math.abs(proposed) > existing) rank.set(id, proposed);
    } else if (existing < 0 && proposed < existing) {
      rank.set(id, proposed);
    }
  }

  // Undirected / co-member fill: BFS from selection; first visit wins (sorted adj).
  // Rank = parentRank + sign, where sign comes from directed step if any, else +1 when
  // parent is selection (default down), else same sign as parentRank (or +1 if parent 0).
  const queue: string[] = [selected];
  const seen = new Set<string>([selected]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curRank = rank.get(cur) ?? 0;
    for (const next of undirected.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (!rank.has(next)) {
        const outEdge = (directed.out.get(cur) ?? []).includes(next);
        const inEdge = (directed.out.get(next) ?? []).includes(cur);
        let step: number;
        if (outEdge) {
          step = 1; // cur → next: next further down-stream of cur
        } else if (inEdge) {
          step = -1; // next → cur: next further up-stream of cur
        } else if (cur === selected) {
          step = 1; // undirected from selection: default down (documented, not a claim)
        } else if (curRank < 0) {
          step = -1;
        } else {
          step = 1;
        }
        rank.set(next, curRank + step);
      }
      queue.push(next);
    }
  }

  // Orphans (no undirected path): park at ORPHAN_RANK so they stay visible.
  for (const id of recordIds) {
    if (!rank.has(id)) rank.set(id, ORPHAN_RANK);
  }

  // Tighten oriented edges: prefer rank(source) < rank(target). Never move selection.
  // Push target down when both free / source is selection; pull source up when target is selection.
  for (let iter = 0; iter < RANK_TIGHTEN_ITERS; iter++) {
    let changed = false;
    for (const [src, tgt] of directed.pairs) {
      const rs = rank.get(src);
      const rt = rank.get(tgt);
      if (rs === undefined || rt === undefined) continue;
      if (rs < rt) continue;
      // Violation: rank(src) >= rank(tgt).
      if (tgt === selected) {
        // Keep selected at 0; pull source strictly above (rt is 0 → src becomes ≤ −1).
        const next = Math.min(rs, rt) - 1;
        if (next !== rs) {
          rank.set(src, next);
          changed = true;
        }
      } else {
        // Source is selection or both free: push target just below source.
        const next = rs + 1;
        if (next !== rt) {
          rank.set(tgt, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Selection is always rank 0 (overwrite any mishap).
  rank.set(selected, 0);
  return rank;
}

// ── Phase 2: barycentre reorder within ranks ────────────────────────────────

function cmpId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Count edge crossings between two consecutive ranks given left-to-right orders.
 * Used by tests and as an optional diagnostic; layout itself optimises via barycentre.
 */
export function countCrossingsBetweenRanks(
  orderUpper: readonly string[],
  orderLower: readonly string[],
  undirectedPairs: ReadonlyArray<readonly [string, string]>,
): number {
  const iu = new Map(orderUpper.map((id, i) => [id, i]));
  const il = new Map(orderLower.map((id, i) => [id, i]));
  const edges: Array<[number, number]> = [];
  for (const [a, b] of undirectedPairs) {
    let u = iu.get(a);
    let l = il.get(b);
    if (u !== undefined && l !== undefined) {
      edges.push([u, l]);
      continue;
    }
    u = iu.get(b);
    l = il.get(a);
    if (u !== undefined && l !== undefined) edges.push([u, l]);
  }
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i];
      const e2 = edges[j];
      if (e1 === undefined || e2 === undefined) continue;
      const [u1, l1] = e1;
      const [u2, l2] = e2;
      if ((u1 - u2) * (l1 - l2) < 0) crossings++;
    }
  }
  return crossings;
}

function packRankX(order: readonly string[], pos: Map<string, XY>, y: number): void {
  const n = order.length;
  order.forEach((id, i) => {
    const x = (i - (n - 1) / 2) * LAYER_DX;
    pos.set(id, { x, y });
  });
}

function barycentreOf(
  id: string,
  neighbourRank: readonly string[],
  pos: Map<string, XY>,
  undirected: Map<string, string[]>,
): number | null {
  const neighSet = new Set(neighbourRank);
  const xs: number[] = [];
  for (const n of undirected.get(id) ?? []) {
    if (!neighSet.has(n)) continue;
    const p = pos.get(n);
    if (p) xs.push(p.x);
  }
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/**
 * Sugiyama-style barycentre reorder: alternate downward / upward sweeps over ranks.
 * Neighbours are undirected co-adjacents in the adjacent rank (pair + co-member).
 * Oriented direction already fixed y-ranks; here we only permute x to cut crossings.
 */
function barycentreReorder(
  rankOf: Map<string, number>,
  undirected: Map<string, string[]>,
  pos: Map<string, XY>,
  selected: string | null,
): void {
  // Group nodes by rank (stable seed: current x, then id).
  const ranks = new Map<number, string[]>();
  for (const [id, r] of rankOf) {
    const list = ranks.get(r) ?? [];
    list.push(id);
    ranks.set(r, list);
  }
  const sortedRankKeys = [...ranks.keys()].sort((a, b) => a - b);
  for (const r of sortedRankKeys) {
    ranks.get(r)!.sort((a, b) => {
      const xa = pos.get(a)?.x ?? 0;
      const xb = pos.get(b)?.x ?? 0;
      if (xa !== xb) return xa - xb;
      return cmpId(a, b);
    });
  }

  for (let iter = 0; iter < BARY_ITERS; iter++) {
    // Downward: reorder rank r using neighbours in rank r-1 (upper).
    for (let ri = 1; ri < sortedRankKeys.length; ri++) {
      const r = sortedRankKeys[ri];
      const prevR = sortedRankKeys[ri - 1];
      // Only use immediately previous key if it is r-1? Adjacent in sorted keys may skip
      // empty ranks — use the previous non-empty rank as the "upper" reference.
      if (r === undefined || prevR === undefined || r <= prevR) continue;
      reorderOneRank(ranks, r, ranks.get(prevR) ?? [], pos, undirected, selected);
    }
    // Upward: reorder rank r using neighbours in rank r+1 (lower).
    for (let ri = sortedRankKeys.length - 2; ri >= 0; ri--) {
      const r = sortedRankKeys[ri];
      const nextR = sortedRankKeys[ri + 1];
      if (r === undefined || nextR === undefined || r >= nextR) continue;
      reorderOneRank(ranks, r, ranks.get(nextR) ?? [], pos, undirected, selected);
    }
  }

  // Final pack: apply uniform spacing from final order.
  for (const r of sortedRankKeys) {
    const order = ranks.get(r)!;
    // Keep selected at x=0 when alone on rank 0; when co-ranked (shouldn't be) still pack.
    packRankX(order, pos, r * LAYER_DY);
  }
  // Selected focus origin only when selection-centred layout.
  if (selected) pos.set(selected, { x: 0, y: 0 });
}

function reorderOneRank(
  ranks: Map<number, string[]>,
  r: number,
  neighbourOrder: readonly string[],
  pos: Map<string, XY>,
  undirected: Map<string, string[]>,
  selected: string | null,
): void {
  const order = ranks.get(r);
  if (!order || order.length < 2) return;
  // Selection on rank 0 stays; if selected is in this rank alone we already returned.
  // Do not reorder away selected from centre preference when it is the only fixed root:
  // if selected is in this rank, pin it and order others around — rare (only rank 0).
  const scored = order.map((id, idx) => {
    const bary = barycentreOf(id, neighbourOrder, pos, undirected);
    return { id, bary, idx };
  });
  scored.sort((a, b) => {
    // Nodes with no neighbour bary keep relative order (stable) but sort after those with bary
    // only when both lack — use previous index. Prefer finite bary ascending.
    if (a.bary === null && b.bary === null) return a.idx - b.idx || cmpId(a.id, b.id);
    if (a.bary === null) return 1;
    if (b.bary === null) return -1;
    if (a.bary !== b.bary) return a.bary - b.bary;
    return cmpId(a.id, b.id);
  });
  // If selected is in this rank, force it to the median slot after sort so focus stays central.
  if (selected && r === 0 && order.includes(selected)) {
    const without = scored.filter((s) => s.id !== selected).map((s) => s.id);
    const mid = Math.floor(without.length / 2);
    const next = [...without.slice(0, mid), selected, ...without.slice(mid)];
    ranks.set(r, next);
    packRankX(next, pos, r * LAYER_DY);
    pos.set(selected, { x: 0, y: 0 });
    return;
  }
  const next = scored.map((s) => s.id);
  ranks.set(r, next);
  packRankX(next, pos, r * LAYER_DY);
}

// ── Selection-centred top-to-bottom layout ───────────────────────────────────

function layoutTopBottom(
  recordIds: readonly string[],
  selected: string,
  edges: readonly AssembledEdge[],
): Map<string, XY> {
  const pos = new Map<string, XY>();
  const undirected = buildUndirectedAdj(recordIds, edges);
  const directed = buildDirectedMaps(recordIds, edges);

  // Phase 1 — ranks
  const rankOf = assignDirectedRanks(recordIds, selected, undirected, directed);

  // Seed x from stable recordIds order within each rank (pre-barycentre).
  const byRank = new Map<number, string[]>();
  for (const id of recordIds) {
    const r = rankOf.get(id) ?? ORPHAN_RANK;
    const list = byRank.get(r) ?? [];
    list.push(id);
    byRank.set(r, list);
  }
  for (const [r, ids] of byRank) {
    packRankX(ids, pos, r * LAYER_DY);
  }
  pos.set(selected, { x: 0, y: 0 });

  // Phase 2 — barycentre reorder within ranks
  barycentreReorder(rankOf, undirected, pos, selected);

  // Collision cleanup: min horizontal separation within each y-rank row.
  separateRows(pos, recordIds);

  // Selected always focus origin after collision pass.
  pos.set(selected, { x: 0, y: 0 });
  return pos;
}

/** Push nodes in the same rank row apart horizontally when they still overlap. Deterministic. */
function separateRows(pos: Map<string, XY>, recordIds: readonly string[]): void {
  const byY = new Map<number, string[]>();
  for (const id of recordIds) {
    const p = pos.get(id);
    if (!p) continue;
    const yKey = Math.round(p.y);
    const list = byY.get(yKey) ?? [];
    list.push(id);
    byY.set(yKey, list);
  }
  for (const ids of byY.values()) {
    if (ids.length < 2) continue;
    ids.sort((a, b) => {
      const xa = pos.get(a)!.x;
      const xb = pos.get(b)!.x;
      if (xa !== xb) return xa - xb;
      return cmpId(a, b);
    });
    for (let i = 1; i < ids.length; i++) {
      const prevId = ids[i - 1];
      const curId = ids[i];
      if (prevId === undefined || curId === undefined) continue;
      const prev = pos.get(prevId);
      const cur = pos.get(curId);
      if (prev === undefined || cur === undefined) continue;
      const minX = prev.x + LAYER_DX;
      if (cur.x < minX) {
        pos.set(curId, { x: minX, y: cur.y });
      }
    }
  }
}

// ── Relation hubs + pendants (shared) ───────────────────────────────────────

function placeRelationNodes(
  pos: Map<string, XY>,
  relationNodes: readonly RelationNodeSpec[],
  edges: readonly AssembledEdge[],
): void {
  const membersOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "member") continue;
    const list = membersOf.get(e.target) ?? [];
    list.push(e.source);
    membersOf.set(e.target, list);
  }
  for (const rel of relationNodes) {
    const members = membersOf.get(rel.id) ?? [];
    const pts = members.map((id) => pos.get(id)).filter((p): p is XY => !!p);
    if (pts.length === 0) {
      pos.set(rel.id, { x: 0, y: 0 });
      continue;
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    pos.set(rel.id, { x: cx * RELATION_PULL, y: cy * RELATION_PULL });
  }
}

function placePendants(pos: Map<string, XY>, pendantNodes: readonly PendantNodeSpec[]): void {
  for (const p of pendantNodes) {
    const anchor = pos.get(p.anchorRecordId) ?? { x: 0, y: 0 };
    // Offset further out along the ray from centre through the anchor; if anchor is
    // at centre (selected with only pendants), park below (outbound default).
    const len = Math.hypot(anchor.x, anchor.y);
    if (len < 1e-6) {
      pos.set(p.id, { x: 0, y: PENDANT_OFFSET });
      continue;
    }
    const ux = anchor.x / len;
    const uy = anchor.y / len;
    pos.set(p.id, { x: anchor.x + ux * PENDANT_OFFSET, y: anchor.y + uy * PENDANT_OFFSET });
  }
}

/**
 * Build a stable string key for the layout inputs that should trigger a re-settle
 * (selection, hop filter already reflected in the visible id set, visible membership).
 * Used by RecordGraph to clear drag overrides and fitView.
 */
export function layoutSettleKey(
  selectedRecordId: string | null | undefined,
  visibleRecordIds: readonly string[],
  hopFilter: string,
): string {
  return `${selectedRecordId ?? ""}|${hopFilter}|${visibleRecordIds.join("\0")}`;
}
