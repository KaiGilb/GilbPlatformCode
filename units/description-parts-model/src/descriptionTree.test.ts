// The tree of parts and the plans for moving one: step, in, out, reorder, drop. The step cases are ported from the app's
// step-plan test (same inputs and expectations; the host is example.test and the person Ben stays as the tag prefix).
import { describe, expect, it } from "vitest";
import {
  closeGap,
  descriptionTree,
  dropPlan,
  effectiveOrder,
  moveInPlan,
  moveOutPlan,
  reorderPlan,
  stepPlan,
  type DescriptionNode,
  type PartRow,
} from "./planParts";

const SOL = { id: "sol", entityUri: "https://vault.example.test/base/e/sol" };

function row(id: string, order: number | null, over: Partial<PartRow> & { parent?: string } = {}): PartRow {
  const served: Record<string, unknown> = {
    unitTag: `Ben.${id.toUpperCase()}`,
    partOf: { "@id": over.parent ? `https://vault.example.test/base/e/${over.parent}` : SOL.entityUri },
  };
  if (order != null) served.elementOrder = order;
  return {
    id,
    entityUri: `https://vault.example.test/base/e/${id}`,
    typeUri: over.typeUri ?? "t:SpecificationElement",
    facts: { unitTag: `Ben.${id.toUpperCase()}` },
    served: { facts: served },
  };
}

function level(spec: readonly (readonly [string, number | null])[]) {
  return descriptionTree(
    SOL,
    spec.map(([id, order]) => row(id, order)),
  );
}

const ids = (nodes: readonly DescriptionNode[]) => nodes.map((n) => n.row.id);
const changes = (list: readonly { node: DescriptionNode; order: number }[]) => list.map((o) => [o.node.row.id, o.order]);

describe("descriptionTree", () => {
  it("orders siblings by element order, a missing order last, ties by tag and then id", () => {
    const rows = [row("c", 2), row("a", 1), row("n1", null), row("b", 2), row("n0", null)];
    expect(ids(descriptionTree(SOL, rows))).toEqual(["a", "b", "c", "n0", "n1"]);
    const sameTag: PartRow = { ...row("z", 1), facts: { unitTag: "Ben.A" } };
    const other: PartRow = { ...row("y", 1), facts: { unitTag: "Ben.A" } };
    expect(ids(descriptionTree(SOL, [sameTag, other]))).toEqual(["y", "z"]);
  });

  it("nests a part under the part its partOf names, at any depth", () => {
    const tree = descriptionTree(SOL, [row("g", 1, { parent: "k" }), row("k", 1), row("h", 2, { parent: "k" })]);
    expect(ids(tree)).toEqual(["k"]);
    expect(ids(tree[0]!.children)).toEqual(["g", "h"]);
    expect(tree[0]!.children[0]!.children).toEqual([]);
  });

  it("gives each node its row, tag, keyword, order and children", () => {
    const tree = descriptionTree(SOL, [row("k", 3), row("m", null)]);
    expect(tree[0]).toMatchObject({ tag: "Ben.K", keyword: "K", order: 3, children: [] });
    expect(tree[0]!.row.id).toBe("k");
    expect(tree[1]!.order).toBeNaN();
  });

  it("reads only specification elements and assumptions", () => {
    const tree = descriptionTree(SOL, [row("a", 1), row("n", 2, { typeUri: "t:Note" }), row("s", 3, { typeUri: "t:Assumption" })]);
    expect(ids(tree)).toEqual(["a", "s"]);
  });

  it("leaves out a part whose partOf names nothing here, and a part under a record that is not a part", () => {
    const stray = row("x", 1, { parent: "nowhere" });
    const underNote = row("y", 1, { parent: "n" });
    expect(descriptionTree(SOL, [row("a", 1), stray, row("n", 2, { typeUri: "t:Note" }), underNote]).map((n) => n.row.id)).toEqual(["a"]);
  });

  it("reads each part once and ends on a loop in the data", () => {
    const loopA = row("a", 1, { parent: "b" });
    const loopB = row("b", 1, { parent: "a" });
    expect(descriptionTree(SOL, [loopA, loopB])).toEqual([]);
    expect(descriptionTree(SOL, [row("k", 1), loopA, loopB])).toHaveLength(1);
  });

  it("finds a part by the owner's id or address, whatever the host in the address", () => {
    const byId: PartRow = { ...row("p", 1), served: { facts: { partOf: { "@id": "https://other.example.test/base/e/sol" } } } };
    expect(ids(descriptionTree(SOL, [byId]))).toEqual(["p"]);
    expect(ids(descriptionTree({ id: "sol" }, [byId]))).toEqual(["p"]);
    expect(descriptionTree({ id: "elsewhere" }, [byId])).toEqual([]);
  });

  it("is empty for an empty pool", () => {
    expect(descriptionTree(SOL, [])).toEqual([]);
  });
});

describe("effectiveOrder", () => {
  it("is the part's own order when finite, else its place counted from 1", () => {
    const list = [{ order: 5 }, { order: Number.NaN }, { order: 0 }, { order: Number.POSITIVE_INFINITY }];
    expect(effectiveOrder(list, 0)).toBe(5);
    expect(effectiveOrder(list, 1)).toBe(2);
    expect(effectiveOrder(list, 2)).toBe(0);
    expect(effectiveOrder(list, 3)).toBe(4);
    expect(effectiveOrder(list, 9)).toBe(10);
    expect(effectiveOrder([], 0)).toBe(1);
  });
});

describe("stepPlan", () => {
  it("is null at either end", () => {
    const nodes = level([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(stepPlan(nodes, 0, -1)).toBeNull();
    expect(stepPlan(nodes, nodes.length - 1, 1)).toBeNull();
    expect(stepPlan(nodes, -1, 1)).toBeNull();
    expect(stepPlan(nodes, nodes.length, -1)).toBeNull();
  });

  it("renumbers equal orders 2, 2, 2 as 1..n", () => {
    const nodes = level([
      ["a", 2],
      ["b", 2],
      ["c", 2],
    ]);
    const plan = stepPlan(nodes, 0, 1);
    expect(plan).not.toBeNull();
    expect(plan!.order).toBe(2);
    expect(plan!.others.map((o) => [o.node.row.id, o.order])).toEqual([
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("lists a duplicated order even when the new number equals the stored one", () => {
    const nodes = level([
      ["a", 1],
      ["b", 1],
    ]);
    const down = stepPlan(nodes, 0, 1);
    expect(down!.order).toBe(2);
    // B's new number is 1, the same as its stored order, but that order is not unique.
    expect(down!.others.map((o) => [o.node.row.id, o.order])).toEqual([["b", 1]]);
  });

  it("lists a missing order", () => {
    const nodes = level([
      ["a", null],
      ["b", null],
    ]);
    const plan = stepPlan(nodes, 1, -1);
    expect(plan!.order).toBe(1);
    expect(plan!.others.map((o) => [o.node.row.id, o.order])).toEqual([["a", 2]]);
  });

  it("lists only the parts whose stored order differs", () => {
    const nodes = level([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const plan = stepPlan(nodes, 0, 1);
    expect(plan!.order).toBe(2);
    expect(plan!.others.map((o) => [o.node.row.id, o.order])).toEqual([["b", 1]]);
  });

  it("swaps two clean orders across a gap, and writes the moved part first", () => {
    const nodes = level([
      ["a", 1],
      ["b", 5],
      ["c", 9],
    ]);
    const plan = stepPlan(nodes, 2, -1);
    expect(plan!.order).toBe(5);
    expect(changes(plan!.others)).toEqual([["b", 9]]);
  });

  it("is null for a single part", () => {
    const nodes = level([["a", 1]]);
    expect(stepPlan(nodes, 0, 1)).toBeNull();
    expect(stepPlan(nodes, 0, -1)).toBeNull();
  });
});

describe("closeGap", () => {
  it("moves the siblings below the gap up into the places the list had", () => {
    const nodes = level([["a", 1], ["b", 2], ["c", 3]]);
    expect(changes(closeGap(nodes, 0))).toEqual([["b", 1], ["c", 2]]);
    expect(changes(closeGap(nodes, 1))).toEqual([["c", 2]]);
    expect(closeGap(nodes, 2)).toEqual([]);
    expect(closeGap(nodes, 7)).toEqual([]);
    expect(closeGap([], 0)).toEqual([]);
  });

  it("lists nothing for a part already where it belongs, and every part with no order", () => {
    // b already holds the place a leaves; c takes b's place, so b and c now share the order 1.
    const nodes = level([["a", 1], ["b", 1], ["c", 2]]);
    expect(changes(closeGap(nodes, 0))).toEqual([["c", 1]]);
    const unordered = level([["a", 1], ["b", null], ["c", null]]);
    expect(changes(closeGap(unordered, 0))).toEqual([["b", 1], ["c", 2]]);
  });
});

describe("moveInPlan", () => {
  it("makes the part the last child of the sibling above it, and closes the gap", () => {
    const nodes = level([["a", 1], ["b", 2], ["c", 3]]);
    const plan = moveInPlan(nodes, 1)!;
    expect(plan.parent.row.id).toBe("a");
    expect(plan.order).toBe(1);
    expect(changes(plan.closeGap)).toEqual([["c", 2]]);
  });

  it("goes after the parent's last child, counting a child with no order by its place", () => {
    const tree = descriptionTree(SOL, [row("a", 1), row("b", 2), row("a1", 4, { parent: "a" }), row("a2", null, { parent: "a" })]);
    expect(moveInPlan(tree, 1)!.order).toBe(5);
    const bare = descriptionTree(SOL, [row("a", 1), row("b", 2), row("a1", null, { parent: "a" })]);
    expect(moveInPlan(bare, 1)!.order).toBe(2);
  });

  it("is null for the first sibling and for an index outside the list", () => {
    const nodes = level([["a", 1], ["b", 2]]);
    expect(moveInPlan(nodes, 0)).toBeNull();
    expect(moveInPlan(nodes, -1)).toBeNull();
    expect(moveInPlan([], 0)).toBeNull();
  });
});

describe("moveOutPlan", () => {
  it("puts the part directly after its parent, shifts the later siblings of that level up by one and closes the old gap", () => {
    const parents = level([["p1", 1], ["p2", 2], ["p3", 3]]);
    const own = descriptionTree(SOL, [row("p1", 1), row("k1", 1, { parent: "p1" }), row("k2", 2, { parent: "p1" }), row("k3", 3, { parent: "p1" })])[0]!.children;
    const plan = moveOutPlan(own, 0, parents, 0);
    expect(plan.order).toBe(2);
    expect(changes(plan.shift)).toEqual([["p2", 3], ["p3", 4]]);
    expect(changes(plan.closeGap)).toEqual([["k2", 1], ["k3", 2]]);
  });

  it("has nothing to shift for the last parent", () => {
    const parents = level([["p1", 1], ["p2", 2]]);
    const own = level([["k1", 1]]);
    const plan = moveOutPlan(own, 0, parents, 1);
    expect(plan).toEqual({ order: 3, shift: [], closeGap: [] });
  });

  it("counts a parent with no order by its place", () => {
    const parents = level([["p1", null], ["p2", null]]);
    const plan = moveOutPlan([], 0, parents, 0);
    expect(plan.order).toBe(2);
    expect(changes(plan.shift)).toEqual([["p2", 3]]);
  });
});

describe("reorderPlan", () => {
  it("moves a part to the end and moves the parts in between up one place, keeping the orders the list had", () => {
    const nodes = level([["a", 1], ["b", 5], ["c", 9]]);
    const plan = reorderPlan(nodes, 0, 2);
    expect(plan.order).toBe(9);
    expect(changes(plan.others)).toEqual([["b", 1], ["c", 5]]);
  });

  it("gives the same two writes as the up and down buttons for one place: the part, then its neighbour", () => {
    const nodes = level([["a", 1], ["b", 2], ["c", 3]]);
    const drop = reorderPlan(nodes, 0, 1);
    const step = stepPlan(nodes, 0, 1)!;
    expect(drop.order).toBe(step.order);
    expect(changes(drop.others)).toEqual(changes(step.others));
    expect(drop.order).toBe(2);
    expect(changes(drop.others)).toEqual([["b", 1]]);
  });

  it("moves a part up", () => {
    const nodes = level([["a", 1], ["b", 2], ["c", 3]]);
    const plan = reorderPlan(nodes, 2, 0);
    expect(plan.order).toBe(1);
    expect(changes(plan.others)).toEqual([["a", 2], ["b", 3]]);
  });

  it("makes the places strictly rising when orders repeat, and lists every part whose order changes", () => {
    const nodes = level([["a", 1], ["b", 1], ["c", 1]]);
    const plan = reorderPlan(nodes, 0, 2);
    expect(plan.order).toBe(3);
    // b already holds the first slot (1), so only c changes.
    expect(changes(plan.others)).toEqual([["c", 2]]);
  });

  it("lists a part with no order even when its slot is the number it would be read at", () => {
    const nodes = level([["a", null], ["b", null]]);
    const plan = reorderPlan(nodes, 0, 1);
    expect(plan.order).toBe(2);
    expect(changes(plan.others)).toEqual([["b", 1]]);
  });

  it("leaves a part in its place when its order already is the slot", () => {
    const nodes = level([["a", 1], ["b", 2], ["c", 3]]);
    const plan = reorderPlan(nodes, 0, 0);
    expect(plan.order).toBe(1);
    expect(plan.others).toEqual([]);
  });
});

describe("dropPlan", () => {
  it("drops last: the largest order of the target + 1, and the old gap is closed", () => {
    const own = level([["a", 1], ["b", 2], ["c", 3]]);
    const target = level([["x", 1], ["y", 4]]);
    const plan = dropPlan(own, 0, target, 2);
    expect(plan.order).toBe(5);
    expect(plan.shift).toEqual([]);
    expect(changes(plan.closeGap)).toEqual([["b", 1], ["c", 2]]);
  });

  it("drops into an empty target as order 1", () => {
    const own = level([["a", 1]]);
    expect(dropPlan(own, 0, [], 0)).toEqual({ order: 1, shift: [], closeGap: [] });
    expect(dropPlan(own, 0, [], 5).order).toBe(1);
  });

  it("takes the place it is dropped on and moves the parts from there on up only as far as they must", () => {
    const own = level([["a", 1]]);
    const target = level([["x", 1], ["y", 2], ["z", 3]]);
    const first = dropPlan(own, 0, target, 0);
    expect(first.order).toBe(1);
    expect(changes(first.shift)).toEqual([["x", 2], ["y", 3], ["z", 4]]);
    const gapped = level([["x", 1], ["y", 5], ["z", 9]]);
    const mid = dropPlan(own, 0, gapped, 1);
    expect(mid.order).toBe(5);
    expect(changes(mid.shift)).toEqual([["y", 6]]);
  });

  it("goes one past the part before it when that part's order is not below the place's own", () => {
    const own = level([["a", 1]]);
    const target = level([["x", 3], ["y", 3]]);
    const plan = dropPlan(own, 0, target, 1);
    expect(plan.order).toBe(4);
    expect(changes(plan.shift)).toEqual([["y", 5]]);
  });

  it("moves a part with no order along, whatever number the shift reaches", () => {
    const own = level([["a", 1]]);
    const target = level([["x", 1], ["y", null]]);
    const plan = dropPlan(own, 0, target, 1);
    expect(plan.order).toBe(2);
    expect(changes(plan.shift)).toEqual([["y", 3]]);
  });
});
