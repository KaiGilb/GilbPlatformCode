// The pure planners of planLevelRead. The first two blocks (planFullLevelMove, planStep) are ported from the app's tests
// (same inputs and expectations); the rest pin the other exports and the odd cases.
import { describe, expect, it } from "vitest";
import {
  ORDER_CAP,
  ORDER_TOO_MANY,
  ORDER_UNREAD,
  REMOVAL_MAX_DEPTH,
  REMOVAL_MAX_PARTS,
  REMOVAL_TOO_DEEP,
  REMOVAL_TOO_MANY,
  SUBPART_UNREAD,
  indexBefore,
  otherRecordsSentence,
  planFullLevelMove,
  planStep,
  type LevelMove,
  type StoredPart,
} from "./planLevelRead";

function parts(...rows: StoredPart[]): StoredPart[] {
  return rows;
}

describe("planFullLevelMove", () => {
  it("puts parts with no stored order last, by id, and numbers the level 1..n", () => {
    const stored = parts(
      { id: "mid", order: 2 },
      { id: "none-b", order: null },
      { id: "none-a", order: null },
      { id: "top", order: 1 },
    );
    const plan = planFullLevelMove(stored, "none-a", { kind: "step", dir: -1 });
    expect(plan).toEqual({
      order: 2,
      changes: [
        { id: "mid", order: 3 },
        { id: "none-b", order: 4 },
      ],
    });
  });

  it("repairs a duplicated order on the next move", () => {
    const stored = parts(
      { id: "a", order: 1 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
    );
    const plan = planFullLevelMove(stored, "c", { kind: "step", dir: -1 });
    expect(plan).toEqual({
      order: 2,
      changes: [
        { id: "a", order: 1 },
        { id: "b", order: 3 },
      ],
    });
  });

  it("gives a new part one past the highest stored order", () => {
    expect(planFullLevelMove(parts({ id: "a", order: 4 }, { id: "b", order: null }), "", { kind: "new" })).toEqual({
      order: 5,
      changes: [],
    });
    expect(planFullLevelMove([], "", { kind: "new" })).toEqual({ order: 1, changes: [] });
  });

  it("moves a part from one level to another: the source closes up and the destination inserts", () => {
    const source = parts(
      { id: "a", order: 1 },
      { id: "b", order: 2 },
      { id: "c", order: 3 },
    );
    const dest = parts(
      { id: "x", order: 1 },
      { id: "y", order: 2 },
    );
    expect(planFullLevelMove(source, "b", { kind: "remove" })).toEqual({
      order: 0,
      changes: [{ id: "c", order: 2 }],
    });
    expect(planFullLevelMove(dest, "b", { kind: "insert", index: 1 })).toEqual({
      order: 2,
      changes: [{ id: "y", order: 3 }],
    });
  });

  it("steps over a hidden part to the next shown sibling", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 });
    const shown = new Set(["a", "c"]);
    expect(planFullLevelMove(stored, "c", { kind: "step", dir: -1 }, shown)).toEqual({
      order: 1,
      changes: [
        { id: "a", order: 2 },
        { id: "b", order: 3 },
      ],
    });
  });
});

describe("planStep", () => {
  it("swaps a clean full level: ↑ on 3 writes two orders", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 });
    expect(planStep(stored, "c", -1)).toEqual({
      kind: "swap",
      writes: [
        { id: "c", order: 2 },
        { id: "b", order: 3 },
      ],
    });
  });

  it("swaps across a gap: ↓ on 1 exchanges 1 and 5", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: 5 }, { id: "c", order: 9 });
    const step = {
      kind: "swap" as const,
      writes: [
        { id: "a", order: 5 },
        { id: "b", order: 1 },
      ],
    };
    expect(planStep(stored, "a", 1)).toEqual(step);
    expect(planFullLevelMove(stored, "a", { kind: "step", dir: 1 })).toEqual({
      order: 5,
      changes: [{ id: "b", order: 1 }],
    });
  });

  it("renumbers a duplicated order instead of swapping", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 2 });
    expect(planStep(stored, "c", -1)).toEqual({
      kind: "renumber",
      writes: [
        { id: "c", order: 2 },
        { id: "b", order: 3 },
      ],
    });
  });

  it("renumbers when the neighbour has no stored order", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: null });
    expect(planStep(stored, "b", -1)).toEqual({
      kind: "renumber",
      writes: [
        { id: "b", order: 1 },
        { id: "a", order: 2 },
      ],
    });
  });

  it("renumbers a partial level when a hidden order lies between the two shown parts", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 });
    const shown = new Set(["a", "c"]);
    expect(planStep(stored, "c", -1, shown)).toEqual({
      kind: "renumber",
      writes: [
        { id: "c", order: 1 },
        { id: "a", order: 2 },
        { id: "b", order: 3 },
      ],
    });
  });

  it("swaps a partial level when no hidden order lies between the two shown parts", () => {
    const stored = parts({ id: "a", order: 1 }, { id: "b", order: 9 }, { id: "c", order: 2 });
    const shown = new Set(["a", "c"]);
    expect(planStep(stored, "c", -1, shown)).toEqual({
      kind: "swap",
      writes: [
        { id: "c", order: 1 },
        { id: "a", order: 2 },
      ],
    });
  });
});

describe("the constants and sentences", () => {
  it("are the caps and the verbatim sentences", () => {
    expect(ORDER_CAP).toBe(1000);
    expect(ORDER_TOO_MANY).toBe("This level has more than 1000 parts, so a new part cannot be numbered here.");
    expect(ORDER_UNREAD).toBe("Some parts at this level could not be read, so their order cannot be changed now. Try again.");
    expect(REMOVAL_MAX_DEPTH).toBe(12);
    expect(REMOVAL_MAX_PARTS).toBe(300);
    expect(REMOVAL_TOO_DEEP).toBe("too many levels to remove at once");
    expect(REMOVAL_TOO_MANY).toBe("more than 300 parts would be removed");
    expect(SUBPART_UNREAD).toBe("a sub-part could not be read");
  });
});

describe("planStep: the neighbour, and the ends", () => {
  const abc = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 });

  it("is null for an id that is not in the list, and at either end", () => {
    expect(planStep(abc, "nobody", 1)).toBeNull();
    expect(planStep(abc, "a", -1)).toBeNull();
    expect(planStep(abc, "c", 1)).toBeNull();
    expect(planStep([], "a", 1)).toBeNull();
  });

  it("is null when every part that way is hidden, and steps over a hidden part to the next shown one", () => {
    expect(planStep(abc, "a", 1, new Set(["a"]))).toBeNull();
    expect(planStep(abc, "c", -1, new Set(["c"]))).toBeNull();
    // The neighbour of a is c (b is hidden), but b's order lies between them: not a swap, the level is numbered 1..n.
    expect(planStep(abc, "a", 1, new Set(["a", "c"]))).toEqual({
      kind: "renumber",
      writes: [{ id: "a", order: 3 }, { id: "b", order: 1 }, { id: "c", order: 2 }],
    });
  });

  it("writes the moved part first, in a swap and in a renumber", () => {
    expect(planStep(abc, "a", 1)?.writes[0]).toEqual({ id: "a", order: 2 });
    expect(planStep(parts({ id: "a", order: 1 }, { id: "b", order: 1 }), "b", -1)).toEqual({
      kind: "renumber",
      writes: [{ id: "b", order: 1 }, { id: "a", order: 2 }],
    });
  });

  it("renumbers when the moved part has no stored order, listing only the parts whose number changes", () => {
    expect(planStep(parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: null }), "c", -1)).toEqual({
      kind: "renumber",
      writes: [{ id: "c", order: 2 }, { id: "b", order: 3 }],
    });
  });
});

describe("planFullLevelMove: the other targets", () => {
  const abc = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 });

  it("moves to an index (clamped), numbering the level 1..n and leaving the moved part out of 'changes'", () => {
    expect(planFullLevelMove(abc, "a", { kind: "index", index: 2 })).toEqual({
      order: 3,
      changes: [{ id: "b", order: 1 }, { id: "c", order: 2 }],
    });
    expect(planFullLevelMove(abc, "a", { kind: "index", index: -5 })).toEqual({ order: 1, changes: [] });
    expect(planFullLevelMove(abc, "a", { kind: "index", index: 99 })).toEqual({
      order: 3,
      changes: [{ id: "b", order: 1 }, { id: "c", order: 2 }],
    });
  });

  it("is null to move a part that is not in the list to an index, and for a step with no neighbour", () => {
    expect(planFullLevelMove(abc, "nobody", { kind: "index", index: 0 })).toBeNull();
    expect(planFullLevelMove(abc, "a", { kind: "step", dir: -1 })).toBeNull();
    expect(planFullLevelMove(abc, "nobody", { kind: "step", dir: 1 })).toBeNull();
  });

  it("inserts a part that is not in the list at an index (clamped), and numbers it", () => {
    expect(planFullLevelMove(abc, "x", { kind: "insert", index: 1 })).toEqual({
      order: 2,
      changes: [{ id: "b", order: 3 }, { id: "c", order: 4 }],
    });
    expect(planFullLevelMove(abc, "x", { kind: "insert", index: 99 })).toEqual({ order: 4, changes: [] });
    expect(planFullLevelMove(abc, "x", { kind: "insert", index: -3 })).toEqual({
      order: 1,
      changes: [{ id: "a", order: 2 }, { id: "b", order: 3 }, { id: "c", order: 4 }],
    });
  });

  it("removes a part, closing the gap; the moved part's order is 0; an unknown id changes nothing on a dense level", () => {
    expect(planFullLevelMove(abc, "b", { kind: "remove" })).toEqual({ order: 0, changes: [{ id: "c", order: 2 }] });
    expect(planFullLevelMove(abc, "nobody", { kind: "remove" })).toEqual({ order: 0, changes: [] });
  });

  it("numbers a new part one past the largest finite order, with 0 as the floor, so a level of negative orders gives 1", () => {
    expect(planFullLevelMove(parts({ id: "a", order: -2 }), "", { kind: "new" })).toEqual({ order: 1, changes: [] });
    expect(planFullLevelMove(parts({ id: "a", order: 2.5 }), "", { kind: "new" })).toEqual({ order: 3.5, changes: [] });
    expect(planFullLevelMove(parts({ id: "a", order: null }), "", { kind: "new" })).toEqual({ order: 1, changes: [] });
  });

  it("sorts the level first: by finite order, then no order, ties by tag and then id (a missing tag is '')", () => {
    const stored = parts({ id: "z", order: 1, tag: "B" }, { id: "y", order: 1, tag: "A" }, { id: "x", order: null });
    const plan = planFullLevelMove(stored, "x", { kind: "step", dir: -1 });
    // Sorted: y (A), z (B), x. x steps up over z; the duplicated 1 is repaired.
    expect(plan).toEqual({ order: 2, changes: [{ id: "y", order: 1 }, { id: "z", order: 3 }] });
  });

  it("does not change the list it is given", () => {
    const stored = parts({ id: "b", order: 2 }, { id: "a", order: 1 });
    const copy = JSON.parse(JSON.stringify(stored)) as StoredPart[];
    planFullLevelMove(stored, "b", { kind: "step", dir: -1 });
    expect(stored).toEqual(copy);
  });

  it("takes each LevelMove kind", () => {
    const kinds: LevelMove[] = [{ kind: "step", dir: 1 }, { kind: "index", index: 0 }, { kind: "remove" }, { kind: "insert", index: 0 }, { kind: "new" }];
    for (const move of kinds) expect(planFullLevelMove(abc, "b", move), move.kind).not.toBeUndefined();
  });
});

describe("indexBefore", () => {
  const stored = parts({ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 });

  it("is where the part goes if it is put before 'beforeId', once the moved part is taken out", () => {
    expect(indexBefore(stored, "x", "b")).toBe(1);
    expect(indexBefore(stored, "x", "a")).toBe(0);
    expect(indexBefore(stored, "a", "c")).toBe(1);
    expect(indexBefore(stored, "c", "a")).toBe(0);
  });

  it("is the end of the list for no 'beforeId', an empty one, a missing one, or the moved part itself", () => {
    expect(indexBefore(stored, "x", null)).toBe(3);
    expect(indexBefore(stored, "x", "")).toBe(3);
    expect(indexBefore(stored, "x", "nobody")).toBe(3);
    expect(indexBefore(stored, "a", null)).toBe(2);
    expect(indexBefore(stored, "a", "a")).toBe(2);
    expect(indexBefore([], "x", "a")).toBe(0);
  });

  it("counts places in stored order (finite orders, then none, ties by tag and id), not in the order given", () => {
    const shuffled = parts({ id: "c", order: 3 }, { id: "n", order: null }, { id: "a", order: 1 });
    expect(indexBefore(shuffled, "x", "n")).toBe(2);
    expect(indexBefore(shuffled, "x", "c")).toBe(1);
  });
});

describe("otherRecordsSentence", () => {
  const rec = (id: string, facts: Record<string, string>) => ({ id, typeUri: "t:Function", facts, opaqueFacts: [], etag: null });

  it("names one other record in the singular", () => {
    expect(otherRecordsSentence("Step", [rec("r1", { unitTag: "Fn.A" })])).toBe(
      "Step is not removed: 1 other record names it as its part-of (Fn.A). Change those first.",
    );
  });

  it("names several in the plural, the first three only, by tag or by id when it has none", () => {
    const others = [rec("r1", { unitTag: "Fn.A" }), rec("r2", { tag: "Fn.B" }), rec("r3", {}), rec("r4", { unitTag: "Fn.D" })];
    expect(otherRecordsSentence("Step", others)).toBe(
      "Step is not removed: 4 other records name it as their part-of (Fn.A, Fn.B, r3). Change those first.",
    );
  });

  it("counts none as plural, with an empty list of names", () => {
    expect(otherRecordsSentence("Step", [])).toBe("Step is not removed: 0 other records name it as their part-of (). Change those first.");
  });
});
