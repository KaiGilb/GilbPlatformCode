// Ported from the app's hostile tests of the pure planner (same inputs, seed and expectations): planStep over a seeded
// random walk of levels with missing, shared, gapped, fractional and negative orders, full and partial, up and down:
// swap only when clean, never a needless renumber, the screen moves one shown place.
import { describe, expect, it } from "vitest";
import { planFullLevelMove, planStep, type StoredPart } from "./planLevelRead";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function finite(o: number | null): o is number {
  return typeof o === "number" && Number.isFinite(o);
}

/** The order planFullLevelMove sorts by: finite ascending, then no order, ties by id. */
function byStored(a: StoredPart, b: StoredPart): number {
  if (finite(a.order) && finite(b.order) && a.order !== b.order) return a.order - b.order;
  if (finite(a.order) !== finite(b.order)) return finite(a.order) ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function randomLevel(r: () => number): StoredPart[] {
  const n = 2 + Math.floor(r() * 7);
  const pool = [1, 2, 3, 5, 9, 2.5, -2, 4, 6];
  return Array.from({ length: n }, (_, i) => {
    const x = r();
    const order = x < 0.12 ? null : x < 0.3 ? pool[Math.floor(r() * 3)]! : x < 0.5 ? pool[Math.floor(r() * pool.length)]! : i + 1;
    return { id: `p${String.fromCharCode(97 + Math.floor(r() * 26))}${i}`, order };
  });
}

describe("planStep: swap only when clean, never a needless renumber, the screen moves one shown place", () => {
  it("3000 random levels, full and partial, ↑ and ↓", () => {
    const r = rng(20261026 + 5);
    const bad: string[] = [];
    let swaps = 0;
    let renumbers = 0;
    for (let k = 0; k < 3000 && bad.length < 3; k++) {
      const stored = randomLevel(r);
      const partial = r() < 0.5;
      const shown = partial ? new Set(stored.filter(() => r() < 0.6).map((p) => p.id)) : undefined;
      const candidates = shown ? stored.filter((p) => shown.has(p.id)) : stored;
      if (candidates.length === 0) continue;
      const moved = candidates[Math.floor(r() * candidates.length)]!.id;
      const dir: -1 | 1 = r() < 0.5 ? -1 : 1;
      const list = [...stored].sort(byStored);
      const step = planStep(list, moved, dir, shown);
      const full = planFullLevelMove(stored, moved, { kind: "step", dir }, shown);
      const isShown = (id: string) => !shown || shown.has(id);
      // The expected neighbour: the next shown part that way in stored order.
      const at = list.findIndex((p) => p.id === moved);
      let c = at + dir;
      while (c >= 0 && c < list.length && !isShown(list[c]!.id)) c += dir;
      const neighbour = c >= 0 && c < list.length ? list[c]! : null;
      const why = (msg: string) => bad.push(`${msg}: ${JSON.stringify({ stored, shown: shown && [...shown], moved, dir, step, full })}`);
      if (!neighbour) {
        if (step !== null || full !== null) why("a step with no shown neighbour wrote something");
        continue;
      }
      if (!step || !full) {
        why("no plan although a shown neighbour exists");
        continue;
      }
      const m = list[at]!;
      const clean =
        finite(m.order) &&
        finite(neighbour.order) &&
        stored.filter((p) => p.order === m.order).length === 1 &&
        stored.filter((p) => p.order === neighbour.order).length === 1 &&
        !stored.some(
          (p) =>
            !isShown(p.id) &&
            finite(p.order) &&
            p.order > Math.min(m.order as number, neighbour.order as number) &&
            p.order < Math.max(m.order as number, neighbour.order as number),
        );
      if (clean !== (step.kind === "swap")) why(`clean=${clean} but kind=${step.kind}`);
      if (step.writes[0]?.id !== moved) why("the moved part is not written first");
      if (step.kind === "swap") {
        swaps += 1;
        if (step.writes.length !== 2 || step.writes[1]!.id !== neighbour.id) why("a swap that is not exactly M then N");
      } else renumbers += 1;
      // planFullLevelMove says the same as planStep.
      if (full.order !== step.writes[0]!.order || JSON.stringify(full.changes) !== JSON.stringify(step.writes.slice(1))) {
        why("planFullLevelMove and planStep disagree");
      }
      // Apply, re-sort, and read the screen.
      const after = new Map(stored.map((p) => [p.id, p.order] as const));
      for (const w of step.writes) after.set(w.id, w.order);
      const resorted = stored.map((p) => ({ id: p.id, order: after.get(p.id) ?? null })).sort(byStored);
      const shownBefore = list.filter((p) => isShown(p.id)).map((p) => p.id);
      const want = [...shownBefore];
      const i = want.indexOf(moved);
      const j = want.indexOf(neighbour.id);
      [want[i], want[j]] = [want[j]!, want[i]!];
      const shownAfter = resorted.filter((p) => isShown(p.id)).map((p) => p.id);
      if (JSON.stringify(shownAfter) !== JSON.stringify(want)) why(`screen ${shownAfter} ≠ ${want}`);
      const hiddenBefore = list.filter((p) => !isShown(p.id)).map((p) => p.id);
      const hiddenAfter = resorted.filter((p) => !isShown(p.id)).map((p) => p.id);
      if (JSON.stringify(hiddenBefore) !== JSON.stringify(hiddenAfter)) why("hidden parts changed their own order");
      if (step.kind === "renumber") {
        const orders = resorted.map((p) => p.order);
        if (JSON.stringify(orders) !== JSON.stringify(orders.map((_, n) => n + 1))) why("a renumber did not leave 1..n");
      } else {
        const orders = resorted.map((p) => p.order).filter(finite);
        const before = stored.map((p) => p.order).filter(finite);
        if (new Set(orders).size !== orders.length && new Set(before).size === before.length) why("a swap made a duplicate");
      }
    }
    expect({ bad, sawBoth: swaps > 300 && renumbers > 300 }).toEqual({ bad: [], sawBoth: true });
  });

  it("known answers: the gap after ×, a hidden part outside the pair, a hidden part with no order, two hidden parts", () => {
    // After × of order 3 on [1..5]: ↑ on 4 swaps with 2.
    expect(planStep([{ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "d", order: 4 }, { id: "e", order: 5 }], "d", -1)).toEqual({
      kind: "swap",
      writes: [
        { id: "d", order: 2 },
        { id: "b", order: 4 },
      ],
    });
    // Partial: hidden h has no order. Not between, so a swap.
    const noOrder = planStep([{ id: "a", order: 1 }, { id: "c", order: 4 }, { id: "h", order: null }], "c", -1, new Set(["a", "c"]));
    expect(noOrder?.kind).toBe("swap");
    // Partial: hidden h1 below the pair and h2 above: neither between, so a swap that jumps nothing.
    const outside = planStep(
      [{ id: "h1", order: 0 }, { id: "a", order: 1 }, { id: "c", order: 4 }, { id: "h2", order: 7 }],
      "c",
      -1,
      new Set(["a", "c"]),
    );
    expect(outside).toEqual({ kind: "swap", writes: [{ id: "c", order: 1 }, { id: "a", order: 4 }] });
    // Partial: a hidden part that shares the moved part's order is not "between" but makes the pair unclean.
    const shared = planStep([{ id: "a", order: 1 }, { id: "c", order: 4 }, { id: "h", order: 4 }], "c", -1, new Set(["a", "c"]));
    expect(shared?.kind).toBe("renumber");
  });
});
