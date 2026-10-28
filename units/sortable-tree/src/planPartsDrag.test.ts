// @vitest-environment node
// Ported from the app's planPartsDrag test: the two pure cases that need only flattenTree and resolveDrop.
// In the app they build their nested nodes with the description-parts model (descriptionTree); here the same nodes
// (same ids, parents and order) are written by hand. The other two pure cases of that group use the plan builders
// dropPlan and reorderPlan, which belong to a later unit, and are not ported.
import { describe, expect, it } from "vitest";
import { flattenTree, resolveDrop } from "./index";

type Node = { row: { id: string }; keyword: string; children: Node[] };
const node = (id: string, keyword: string, children: Node[] = []): Node => ({ row: { id }, keyword, children });

describe("where a drop lands (pure)", () => {
  const nodes = (): Node[] => [
    node("a", "A"),
    node("b", "B", [node("bc", "C"), node("bd", "D")]),
    node("e", "E"),
  ];
  const flat = () => flattenTree(nodes(), (n) => ({ id: n.row.id, label: n.keyword, children: n.children }));

  it("reads the rows depth first and refuses a place inside the part itself", () => {
    expect(flat().map((r) => `${r.id}:${r.depth}:${r.parentId}`)).toEqual(["a:0:null", "b:0:null", "bc:1:b", "bd:1:b", "e:0:null"]);
    const inside = resolveDrop(flat(), "b", 3, 1);
    expect(inside.ok).toBe(false);
    const stay = resolveDrop(flat(), "b", 1, 0);
    expect(stay.ok && stay.unchanged).toBe(true);
    const after = resolveDrop(flat(), "b", 5, 0);
    expect(after.ok && after.parentId === null && after.index === 2).toBe(true);
  });

  it("the depth is how far a line can go: a child of the row above at most, the row below's level at least", () => {
    // Below the last row of B's parts, B's own level or deeper.
    const v = resolveDrop(flat(), "a", 4, 0);
    expect(v.ok && v.parentId === null && v.index === 1).toBe(true);
    const deep = resolveDrop(flat(), "a", 4, 5);
    expect(deep.ok && deep.depth === 2 && deep.parentId === "bd").toBe(true);
    const mid = resolveDrop(flat(), "a", 4, 1);
    expect(mid.ok && mid.parentId === "b" && mid.index === 2).toBe(true);
  });
});
