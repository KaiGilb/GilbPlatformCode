// Ported from the app's hostile tests of the pure planner (same inputs, seed and expectations): a seeded random walk over
// levels with missing, duplicated, gapped, fractional and negative orders. A clean step swaps two unique orders; every
// other plan, and a repair, leaves 1..n.
import { describe, expect, it } from "vitest";
import { planFullLevelMove, type LevelMove, type StoredPart } from "./planLevelRead";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function level(r: () => number): StoredPart[] {
  const n = 1 + Math.floor(r() * 8);
  const out: StoredPart[] = [];
  for (let i = 0; i < n; i++) {
    const roll = r();
    // Orders as agents leave them: missing, duplicated, gapped, fractional, negative.
    const order = roll < 0.2 ? null : roll < 0.4 ? 1 : roll < 0.5 ? -2 : roll < 0.6 ? 2.5 : Math.floor(r() * 6) + 1;
    out.push({ id: `p${String.fromCharCode(97 + ((i * 7) % 26))}${i}`, order });
  }
  return out;
}

/** The orders of the level after the plan is written: moved part at `order`, each change applied. */
function written(stored: readonly StoredPart[], movedId: string, move: LevelMove, plan: { order: number; changes: { id: string; order: number }[] }) {
  const orders = new Map<string, number | null>();
  for (const p of stored) orders.set(p.id, p.order);
  if (move.kind === "remove") orders.delete(movedId);
  else orders.set(movedId, plan.order);
  for (const c of plan.changes) orders.set(c.id, c.order);
  return [...orders.values()];
}

/**
 * A clean step exchanges two unique finite orders and writes nothing else.
 * A no-op is not an exchange: the two stored numbers have to change hands.
 */
function exactSwap(stored: readonly StoredPart[], movedId: string, plan: { order: number; changes: { id: string; order: number }[] }): boolean {
  const moved = stored.find((p) => p.id === movedId);
  const change = plan.changes.length === 1 ? plan.changes[0] : undefined;
  if (!moved || !change || change.id === movedId) return false;
  const neighbour = stored.find((p) => p.id === change.id);
  if (!neighbour) return false;
  const left = moved.order;
  const right = neighbour.order;
  if (typeof left !== "number" || !Number.isFinite(left) || typeof right !== "number" || !Number.isFinite(right)) return false;
  if (stored.filter((p) => p.order === left).length !== 1 || stored.filter((p) => p.order === right).length !== 1) return false;
  return plan.order === right && change.order === left;
}

describe("planFullLevelMove: a clean step swaps two unique orders; every other plan, and a repair, leaves 1..n", () => {
  it("2000 random levels and moves (no order, duplicates, gaps, fractions, negatives)", () => {
    const r = rng(20261026);
    const bad: string[] = [];
    for (let k = 0; k < 2000; k++) {
      const stored = level(r);
      const pick = stored[Math.floor(r() * stored.length)]!;
      const roll = r();
      let movedId = pick.id;
      let move: LevelMove;
      if (roll < 0.3) move = { kind: "step", dir: r() < 0.5 ? -1 : 1 };
      else if (roll < 0.5) move = { kind: "index", index: Math.floor(r() * (stored.length + 2)) - 1 };
      else if (roll < 0.7) move = { kind: "remove" };
      else {
        movedId = "incoming";
        move = { kind: "insert", index: Math.floor(r() * (stored.length + 2)) };
      }
      const plan = planFullLevelMove(stored, movedId, move);
      if (!plan) continue; // a step past either end: nothing to write
      const after = written(stored, movedId, move, plan).sort((a, b) => (a ?? 0) - (b ?? 0));
      const want = after.map((_, i) => i + 1);
      const dense = JSON.stringify(after) === JSON.stringify(want);
      // A clean step keeps a gap, a negative, or 2.5. Anything else, including a duplicate or a missing order, is still 1..n.
      if (!dense && !(move.kind === "step" && exactSwap(stored, movedId, plan))) {
        bad.push(JSON.stringify({ stored, movedId, move, plan, after }));
        if (bad.length >= 3) break;
      }
    }
    expect(bad).toEqual([]);
  });

  it("a new part's order is held by no stored part, whatever orders the level has", () => {
    const r = rng(7);
    const bad: string[] = [];
    for (let k = 0; k < 500; k++) {
      const stored = level(r);
      const { order } = planFullLevelMove(stored, "", { kind: "new" })!;
      if (stored.some((p) => p.order === order)) bad.push(JSON.stringify({ stored, order }));
    }
    expect(bad).toEqual([]);
  });
});
