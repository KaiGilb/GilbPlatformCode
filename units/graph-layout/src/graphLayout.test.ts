import { describe, it, expect } from "vitest";
import {
  computeLayout,
  countCrossingsBetweenRanks,
  LAYER_DY,
  layoutSettleKey,
} from "./graphLayout";
import type { AssembledEdge, PendantNodeSpec, RelationNodeSpec } from "./graphTypes";

// Cycle054: layout is DERIVED every pass (BASEAPP_02 / 3P.C.AppVaultSeparation) — determinism
// is the property that makes "nothing to drop" safe.
// Cycle055 VDS-2: selection-centred T-B — inbound above (up), outbound below (down), hop
// layers, no fabricated edges; layout does not change who is visible.
// Cycle055 VDS-3: directed longest-path ranks + barycentre reorder within ranks.

const memberEdge = (rel: string, source: string): AssembledEdge => ({
  id: `member:${rel}:${source}`,
  source,
  target: `rel:${rel}`,
  kind: "member",
  relationUri: rel,
  role: "member",
  oriented: false,
});

const pairOriented = (rel: string, source: string, target: string): AssembledEdge => ({
  id: `pair:${rel}`,
  source,
  target,
  kind: "pair",
  relationUri: rel,
  role: "role:source",
  oriented: true,
});

const pairUndirected = (rel: string, a: string, b: string): AssembledEdge => ({
  id: `pair:${rel}`,
  source: a,
  target: b,
  kind: "pair",
  relationUri: rel,
  role: "member",
  oriented: false,
});

describe("computeLayout — deterministic, fully-derived positions (BASEAPP_02 'nothing to drop')", () => {
  it("produces identical positions across repeated calls with the same input", () => {
    const recordIds = ["a", "b", "c", "d"];
    const relationNodes: RelationNodeSpec[] = [
      { id: "rel:x", relationUri: "x", ref: "x", memberCount: 3 },
    ];
    const pendantNodes: PendantNodeSpec[] = [
      { id: "pend:rec-a/rel-y", relationUri: "y", ref: "y", role: "owner", anchorRecordId: "a" },
    ];
    const edges = [memberEdge("x", "a"), memberEdge("x", "b"), memberEdge("x", "c")];

    const first = computeLayout(recordIds, relationNodes, pendantNodes, edges);
    const second = computeLayout(recordIds, relationNodes, pendantNodes, edges);

    expect([...second.entries()].sort()).toEqual([...first.entries()].sort());
  });

  it("assigns a position to every record, relation, and pendant node", () => {
    const recordIds = ["a", "b", "c"];
    const relationNodes: RelationNodeSpec[] = [
      { id: "rel:x", relationUri: "x", ref: "x", memberCount: 3 },
    ];
    const pendantNodes: PendantNodeSpec[] = [
      { id: "pend:rec-a/rel-y", relationUri: "y", ref: "y", role: "owner", anchorRecordId: "a" },
    ];
    const edges = [memberEdge("x", "a"), memberEdge("x", "b"), memberEdge("x", "c")];

    const pos = computeLayout(recordIds, relationNodes, pendantNodes, edges);
    for (const id of [...recordIds, "rel:x", "pend:rec-a/rel-y"]) {
      const p = pos.get(id);
      expect(p, `missing position for ${id}`).toBeDefined();
      expect(Number.isFinite(p!.x) && Number.isFinite(p!.y)).toBe(true);
    }
  });

  it("places a pendant strictly outside its anchor record (radially further from centre)", () => {
    const recordIds = ["a", "b"];
    const pendantNodes: PendantNodeSpec[] = [
      { id: "pend:rec-a/rel-y", relationUri: "y", ref: "y", role: "owner", anchorRecordId: "a" },
    ];
    const pos = computeLayout(recordIds, [], pendantNodes, []);
    const anchor = pos.get("a")!;
    const pend = pos.get("pend:rec-a/rel-y")!;
    const anchorR = Math.hypot(anchor.x, anchor.y);
    const pendR = Math.hypot(pend.x, pend.y);
    expect(pendR).toBeGreaterThan(anchorR);
  });
});

describe("computeLayout — Cycle055 VDS-2 top-to-bottom around selection", () => {
  it("places the selected record at the focus origin (top of vertical flow)", () => {
    const recordIds = ["sel", "in", "out"];
    const edges = [
      pairOriented("r-in", "in", "sel"), // inbound into selected
      pairOriented("r-out", "sel", "out"), // outbound from selected
    ];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    const s = pos.get("sel")!;
    expect(Math.abs(s.x)).toBeLessThan(1);
    expect(Math.abs(s.y)).toBeLessThan(1);
  });

  it("places directed inbound neighbours ABOVE the selected node (smaller y)", () => {
    const recordIds = ["sel", "inbound"];
    const edges = [pairOriented("r1", "inbound", "sel")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect(pos.get("inbound")!.y).toBeLessThan(pos.get("sel")!.y - 10);
  });

  it("places directed outbound neighbours BELOW the selected node (larger y)", () => {
    const recordIds = ["sel", "outbound"];
    const edges = [pairOriented("r1", "sel", "outbound")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect(pos.get("outbound")!.y).toBeGreaterThan(pos.get("sel")!.y + 10);
  });

  it("radiates hop layers by distance (hop-2 further out than hop-1 on the same side)", () => {
    // sel → a → b  (chain of oriented edges, outbound down)
    const recordIds = ["sel", "a", "b"];
    const edges = [pairOriented("r1", "sel", "a"), pairOriented("r2", "a", "b")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect(pos.get("a")!.y).toBeCloseTo(LAYER_DY, 0);
    expect(pos.get("b")!.y).toBeCloseTo(2 * LAYER_DY, 0);
    expect(pos.get("b")!.y).toBeGreaterThan(pos.get("a")!.y);
  });

  it("is deterministic for the same selection + edges", () => {
    const recordIds = ["sel", "in", "out", "u"];
    const edges = [
      pairOriented("r-in", "in", "sel"),
      pairOriented("r-out", "sel", "out"),
      pairUndirected("r-u", "sel", "u"),
    ];
    const a = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    const b = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });

  it("does not invent node ids — only positions for the ids it was given", () => {
    const recordIds = ["sel", "a"];
    const edges = [pairOriented("r1", "sel", "a")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect([...pos.keys()].sort()).toEqual(["a", "sel"]);
  });

  it("re-settles when the visible set shrinks (hop filter simulation) — positions not frozen stale", () => {
    const full = ["sel", "near", "far"];
    const edges = [
      pairOriented("r1", "sel", "near"),
      pairOriented("r2", "near", "far"),
    ];
    const fullPos = computeLayout(full, [], [], edges, { selectedRecordId: "sel" });
    // Hop-1 visible set drops `far`
    const hop1 = ["sel", "near"];
    const hop1Pos = computeLayout(hop1, [], [], edges, { selectedRecordId: "sel" });
    expect(hop1Pos.has("far")).toBe(false);
    expect(hop1Pos.has("sel")).toBe(true);
    expect(hop1Pos.has("near")).toBe(true);
    // Settle key must change so the view is not frozen on the full-set layout
    expect(layoutSettleKey("sel", hop1, "1")).not.toEqual(layoutSettleKey("sel", full, "2"));
    // Selected stays focus origin after re-layout
    expect(Math.abs(hop1Pos.get("sel")!.y)).toBeLessThan(1);
    // near still outbound-down (and full-set far was further out)
    expect(fullPos.get("far")!.y).toBeGreaterThan(fullPos.get("near")!.y);
  });

  it("separates co-row nodes so they do not share the same x (collision cleanup within rank)", () => {
    // Two outbound neighbours of selection → same y rank, stacked x
    const recordIds = ["sel", "o1", "o2"];
    const edges = [pairOriented("r1", "sel", "o1"), pairOriented("r2", "sel", "o2")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect(pos.get("o1")!.y).toBeCloseTo(pos.get("o2")!.y, 0);
    expect(Math.abs(pos.get("o1")!.x - pos.get("o2")!.x)).toBeGreaterThanOrEqual(100);
  });

  it("without selection + no oriented edges still assigns finite, non-collapsed positions", () => {
    const recordIds = ["a", "b", "c"];
    const pos = computeLayout(recordIds, [], [], [], { selectedRecordId: null });
    for (const id of recordIds) {
      expect(Number.isFinite(pos.get(id)!.x)).toBe(true);
    }
    // Not all forced to origin
    const xs = recordIds.map((id) => pos.get(id)!.x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });

  it("without selection + oriented chain sorts top-to-bottom on first load (global directed)", () => {
    // First Graph open, hop=all, nothing selected: y order must respect A→B→C.
    const recordIds = ["C", "A", "B"]; // deliberate non-topo input order
    const edges = [pairOriented("r1", "A", "B"), pairOriented("r2", "B", "C")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: null });
    expect(pos.get("A")!.y).toBeLessThan(pos.get("B")!.y);
    expect(pos.get("B")!.y).toBeLessThan(pos.get("C")!.y);
    expect(posYOrder(pos, ["A", "B", "C"])).toEqual(["A", "B", "C"]);
  });
});

describe("layoutSettleKey", () => {
  it("changes when hop filter or visible membership changes", () => {
    const k1 = layoutSettleKey("sel", ["sel", "a"], "1");
    const k2 = layoutSettleKey("sel", ["sel", "a", "b"], "2");
    const k3 = layoutSettleKey("sel", ["sel", "a"], "2");
    expect(k1).not.toEqual(k2);
    expect(k1).not.toEqual(k3);
  });
});

describe("computeLayout — Cycle055 VDS-3 directed ranks + barycentre", () => {
  it("oriented chain A→B→C with selection A: y(A) < y(B) < y(C)", () => {
    const recordIds = ["A", "B", "C"];
    const edges = [pairOriented("r1", "A", "B"), pairOriented("r2", "B", "C")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "A" });
    expect(pos.get("A")!.y).toBeLessThan(pos.get("B")!.y);
    expect(pos.get("B")!.y).toBeLessThan(pos.get("C")!.y);
    expect(pos.get("B")!.y).toBeCloseTo(LAYER_DY, 0);
    expect(pos.get("C")!.y).toBeCloseTo(2 * LAYER_DY, 0);
  });

  it("inbound-only chain into selection still places ancestors above selection", () => {
    // X → Y → sel  (all arrows point toward selection)
    const recordIds = ["sel", "X", "Y"];
    const edges = [pairOriented("r1", "X", "Y"), pairOriented("r2", "Y", "sel")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect(pos.get("Y")!.y).toBeLessThan(pos.get("sel")!.y - 10);
    expect(pos.get("X")!.y).toBeLessThan(pos.get("Y")!.y - 10);
  });

  it("diamond multi-parent: longest path puts sink below both parents", () => {
    // A → B, A → C, B → D, C → D ; select A
    const recordIds = ["A", "B", "C", "D"];
    const edges = [
      pairOriented("ab", "A", "B"),
      pairOriented("ac", "A", "C"),
      pairOriented("bd", "B", "D"),
      pairOriented("cd", "C", "D"),
    ];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "A" });
    expect(pos.get("A")!.y).toBeLessThan(pos.get("B")!.y);
    expect(pos.get("A")!.y).toBeLessThan(pos.get("C")!.y);
    expect(pos.get("B")!.y).toBeLessThan(pos.get("D")!.y);
    expect(pos.get("C")!.y).toBeLessThan(pos.get("D")!.y);
    expect(pos.get("D")!.y).toBeCloseTo(2 * LAYER_DY, 0);
  });

  it("barycentre uncrosses a known 2-rank crossing pair", () => {
    // sel → L, sel → R on rank 1; L → botR, R → botL on rank 2.
    // Seed order botL before botR would cross; barycentre should put botR left of botL
    // (under L) and reduce measured crossings to 0.
    const recordIds = ["sel", "L", "R", "botL", "botR"];
    const edges = [
      pairOriented("sl", "sel", "L"),
      pairOriented("sr", "sel", "R"),
      pairOriented("l_br", "L", "botR"),
      pairOriented("r_bl", "R", "botL"),
    ];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });

    // Same ranks
    expect(pos.get("L")!.y).toBeCloseTo(pos.get("R")!.y, 0);
    expect(pos.get("botL")!.y).toBeCloseTo(pos.get("botR")!.y, 0);
    expect(pos.get("botL")!.y).toBeGreaterThan(pos.get("L")!.y);

    // Upper order by x
    const upper = ["L", "R"].sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
    const lower = ["botL", "botR"].sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
    const pairs: Array<[string, string]> = [
      ["L", "botR"],
      ["R", "botL"],
    ];
    const crossings = countCrossingsBetweenRanks(upper, lower, pairs);
    expect(crossings).toBe(0);

    // Explicit geometry: botR under L, botL under R (same left-to-right as parents)
    // After uncross: if L is left of R, botR should be left of botL.
    if (pos.get("L")!.x < pos.get("R")!.x) {
      expect(pos.get("botR")!.x).toBeLessThan(pos.get("botL")!.x);
    } else {
      expect(pos.get("botR")!.x).toBeGreaterThan(pos.get("botL")!.x);
    }
  });

  it("countCrossingsBetweenRanks reports 1 for the seed-crossing order", () => {
    // Diagnostic helper: the pre-barycentre bad order has one crossing.
    expect(
      countCrossingsBetweenRanks(
        ["L", "R"],
        ["botL", "botR"],
        [
          ["L", "botR"],
          ["R", "botL"],
        ],
      ),
    ).toBe(1);
    expect(
      countCrossingsBetweenRanks(
        ["L", "R"],
        ["botR", "botL"],
        [
          ["L", "botR"],
          ["R", "botL"],
        ],
      ),
    ).toBe(0);
  });

  it("is deterministic for the same directed multi-hop inputs", () => {
    const recordIds = ["sel", "a", "b", "c", "d"];
    const edges = [
      pairOriented("r1", "sel", "a"),
      pairOriented("r2", "sel", "b"),
      pairOriented("r3", "a", "c"),
      pairOriented("r4", "b", "d"),
      pairOriented("r5", "c", "d"),
    ];
    const p1 = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    const p2 = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    expect([...p2.entries()].sort()).toEqual([...p1.entries()].sort());
  });

  it("hop filter + layout still compose (subset re-ranks without inventing ids)", () => {
    const full = ["sel", "near", "far"];
    const edges = [
      pairOriented("r1", "sel", "near"),
      pairOriented("r2", "near", "far"),
    ];
    const fullPos = computeLayout(full, [], [], edges, { selectedRecordId: "sel" });
    const hop1 = ["sel", "near"];
    const hop1Pos = computeLayout(hop1, [], [], edges, { selectedRecordId: "sel" });
    expect(hop1Pos.has("far")).toBe(false);
    expect([...hop1Pos.keys()].sort()).toEqual(["near", "sel"]);
    expect(posYOrder(fullPos, ["sel", "near", "far"])).toEqual(["sel", "near", "far"]);
    expect(hop1Pos.get("near")!.y).toBeGreaterThan(hop1Pos.get("sel")!.y);
    expect(layoutSettleKey("sel", hop1, "1")).not.toEqual(layoutSettleKey("sel", full, "2"));
  });

  it("does not invent direction for undirected pairs (still places by hop, finite y)", () => {
    const recordIds = ["sel", "u1", "u2"];
    const edges = [pairUndirected("u", "sel", "u1"), pairUndirected("u2", "u1", "u2")];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: "sel" });
    // Default undirected from selection is down — not a direction claim on the edge,
    // but hop layers still separate.
    expect(pos.get("u1")!.y).toBeGreaterThan(pos.get("sel")!.y);
    expect(pos.get("u2")!.y).toBeGreaterThan(pos.get("u1")!.y);
  });

  it("empty selection global layout: diamond longest-path ranks without changing selection", () => {
    // A → B, A → C, B → D, C → D — no selectedRecordId
    const recordIds = ["D", "B", "A", "C"];
    const edges = [
      pairOriented("ab", "A", "B"),
      pairOriented("ac", "A", "C"),
      pairOriented("bd", "B", "D"),
      pairOriented("cd", "C", "D"),
    ];
    const pos = computeLayout(recordIds, [], [], edges, { selectedRecordId: null });
    expect(pos.get("A")!.y).toBeLessThan(pos.get("B")!.y);
    expect(pos.get("A")!.y).toBeLessThan(pos.get("C")!.y);
    expect(pos.get("B")!.y).toBeLessThan(pos.get("D")!.y);
    expect(pos.get("C")!.y).toBeLessThan(pos.get("D")!.y);
    // Deterministic across calls
    const pos2 = computeLayout(recordIds, [], [], edges, { selectedRecordId: null });
    expect([...pos2.entries()].sort()).toEqual([...pos.entries()].sort());
  });
});

/** Stable ascending y order of ids (ties broken by id). */
function posYOrder(pos: Map<string, { x: number; y: number }>, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const dy = pos.get(a)!.y - pos.get(b)!.y;
    if (dy !== 0) return dy;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
