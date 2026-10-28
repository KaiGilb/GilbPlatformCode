// @vitest-environment node
// Pinning tests for treeDrop: every export, and the odd cases as the code does them.
import { describe, expect, it, vi } from "vitest";
import {
  depthRange,
  flattenTree,
  insideItself,
  lineOf,
  placeWords,
  resolveDrop,
  stepGap,
  subtreeSize,
  type DropRefusal,
  type DropTarget,
  type DropVerdict,
  type RefuseMove,
  type TreeRow,
} from "./index";

// a, b (bc, bd), e   -- depth first, as drawn
const ROWS: TreeRow[] = [
  { id: "a", parentId: null, depth: 0, label: "A" },
  { id: "b", parentId: null, depth: 0, label: "B" },
  { id: "bc", parentId: "b", depth: 1, label: "C" },
  { id: "bd", parentId: "b", depth: 1, label: "D" },
  { id: "e", parentId: null, depth: 0, label: "E" },
];
// a, b (bc (bcx), bd), e
const DEEP: TreeRow[] = [
  { id: "a", parentId: null, depth: 0, label: "A" },
  { id: "b", parentId: null, depth: 0, label: "B" },
  { id: "bc", parentId: "b", depth: 1, label: "C" },
  { id: "bcx", parentId: "bc", depth: 2, label: "X" },
  { id: "bd", parentId: "b", depth: 1, label: "D" },
  { id: "e", parentId: null, depth: 0, label: "E" },
];

const ok = (v: DropVerdict): DropTarget => {
  if (!v.ok) throw new Error(`refused: ${v.reason}`);
  return v;
};
const no = (v: DropVerdict): DropRefusal => {
  if (v.ok) throw new Error("expected a refusal");
  return v;
};

describe("subtreeSize", () => {
  it("is the row and the deeper rows that follow it", () => {
    expect(subtreeSize(ROWS, 0)).toBe(1);
    expect(subtreeSize(ROWS, 1)).toBe(3);
    expect(subtreeSize(ROWS, 2)).toBe(1);
    expect(subtreeSize(ROWS, 4)).toBe(1);
    expect(subtreeSize(DEEP, 1)).toBe(4);
    expect(subtreeSize(DEEP, 2)).toBe(2);
  });
  it("is 0 for a place that is not a row", () => {
    expect(subtreeSize(ROWS, 5)).toBe(0);
    expect(subtreeSize(ROWS, -1)).toBe(0);
    expect(subtreeSize([], 0)).toBe(0);
  });
});

describe("depthRange", () => {
  it("is as deep as a child of the row above, as shallow as the row below", () => {
    expect(depthRange(ROWS, 0)).toEqual({ min: 0, max: 0 });
    expect(depthRange(ROWS, 1)).toEqual({ min: 0, max: 1 });
    expect(depthRange(ROWS, 2)).toEqual({ min: 1, max: 1 });
    expect(depthRange(ROWS, 3)).toEqual({ min: 1, max: 2 });
    expect(depthRange(ROWS, 4)).toEqual({ min: 0, max: 2 });
    expect(depthRange(ROWS, 5)).toEqual({ min: 0, max: 1 });
  });
  it("an empty list has one place, at the top level", () => {
    expect(depthRange([], 0)).toEqual({ min: 0, max: 0 });
  });
});

describe("insideItself", () => {
  it("is the sentence for a part put inside itself", () => {
    expect(insideItself("Hip")).toBe("Hip cannot be put inside itself or its own parts.");
  });
});

describe("flattenTree", () => {
  type N = { id: string; name: string; kids?: N[] };
  const read = (n: N) => ({ id: n.id, label: n.name, children: n.kids ?? [] });
  it("lists the nodes depth first with their depth and parent", () => {
    const tree: N[] = [{ id: "a", name: "A" }, { id: "b", name: "B", kids: [{ id: "c", name: "C", kids: [{ id: "x", name: "X" }] }, { id: "d", name: "D" }] }, { id: "e", name: "E" }];
    expect(flattenTree(tree, read)).toEqual([
      { id: "a", parentId: null, depth: 0, label: "A" },
      { id: "b", parentId: null, depth: 0, label: "B" },
      { id: "c", parentId: "b", depth: 1, label: "C" },
      { id: "x", parentId: "c", depth: 2, label: "X" },
      { id: "d", parentId: "b", depth: 1, label: "D" },
      { id: "e", parentId: null, depth: 0, label: "E" },
    ]);
  });
  it("an empty list is empty", () => {
    expect(flattenTree([] as N[], read)).toEqual([]);
  });
  it("starts from the parent and depth it is given", () => {
    expect(flattenTree([{ id: "a", name: "A", kids: [{ id: "b", name: "B" }] }], read, "root", 3)).toEqual([
      { id: "a", parentId: "root", depth: 3, label: "A" },
      { id: "b", parentId: "a", depth: 4, label: "B" },
    ]);
  });
  it("reads each node once", () => {
    const spy = vi.fn(read);
    flattenTree([{ id: "a", name: "A", kids: [{ id: "b", name: "B" }] }], spy);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("resolveDrop: before, after, inside", () => {
  it("before the first row: the top level, first", () => {
    const v = ok(resolveDrop(ROWS, "e", 0, 0));
    expect(v).toEqual({ ok: true, activeId: "e", parentId: null, index: 0, gap: 0, depth: 0, unchanged: false, parentLabel: null, afterLabel: null });
  });
  it("after the last row at the top level: after its last sibling", () => {
    const v = ok(resolveDrop(ROWS, "a", 5, 0));
    expect(v).toMatchObject({ parentId: null, index: 2, gap: 5, depth: 0, unchanged: false, parentLabel: null, afterLabel: "E" });
  });
  it("after the last row at a deeper level: inside the part above, last", () => {
    const v = ok(resolveDrop(ROWS, "a", 5, 1));
    expect(v).toMatchObject({ parentId: "e", index: 0, depth: 1, parentLabel: "E", afterLabel: null });
  });
  it("inside a part, between its children", () => {
    const v = ok(resolveDrop(ROWS, "a", 3, 1));
    expect(v).toMatchObject({ parentId: "b", index: 1, depth: 1, parentLabel: "B", afterLabel: "C", unchanged: false });
  });
  it("inside a part, first (just under it)", () => {
    const v = ok(resolveDrop(ROWS, "a", 2, 1));
    expect(v).toMatchObject({ parentId: "b", index: 0, parentLabel: "B", afterLabel: null });
  });
  it("moving a child out to the top level, after its parent", () => {
    const v = ok(resolveDrop(ROWS, "bd", 4, 0));
    expect(v).toMatchObject({ parentId: null, index: 2, parentLabel: null, afterLabel: "B", unchanged: false });
  });
  it("moving a whole part carries its parts: the list is read without them", () => {
    // b (with bc, bd) goes after e: the rows above the line are a and e.
    const v = ok(resolveDrop(ROWS, "b", 5, 0));
    expect(v).toMatchObject({ parentId: null, index: 2, afterLabel: "E", gap: 5 });
    // b goes first: nothing above it.
    expect(ok(resolveDrop(ROWS, "b", 0, 0))).toMatchObject({ parentId: null, index: 0, afterLabel: null });
  });
  it("moving a part under a row that comes after its old place counts the rows without the part", () => {
    // a goes under e (gap 5, depth 1): e's children above the line: none.
    expect(ok(resolveDrop(ROWS, "a", 5, 1))).toMatchObject({ parentId: "e", index: 0 });
    // bd goes to the top level before e (gap 4, depth 0): top-level rows above: a, b.
    expect(ok(resolveDrop(ROWS, "bd", 4, 0))).toMatchObject({ parentId: null, index: 2 });
  });
  it("a deep part goes under the nearest row one level up above the line", () => {
    const v = ok(resolveDrop(DEEP, "a", 4, 2));
    expect(v).toMatchObject({ parentId: "bc", index: 1, depth: 2, parentLabel: "C", afterLabel: "X" });
    const shallow = ok(resolveDrop(DEEP, "a", 4, 1));
    expect(shallow).toMatchObject({ parentId: "b", index: 1, parentLabel: "B", afterLabel: "C" });
  });
});

describe("resolveDrop: staying where it is", () => {
  it("the gap just above the row and the gap just below it both mean stay", () => {
    expect(ok(resolveDrop(ROWS, "a", 0, 0)).unchanged).toBe(true);
    expect(ok(resolveDrop(ROWS, "a", 1, 0)).unchanged).toBe(true);
    expect(ok(resolveDrop(ROWS, "e", 4, 0)).unchanged).toBe(true);
    expect(ok(resolveDrop(ROWS, "e", 5, 0)).unchanged).toBe(true);
  });
  it("a part with its parts: its own gap and the gap after its last part both mean stay", () => {
    expect(ok(resolveDrop(ROWS, "b", 1, 0)).unchanged).toBe(true);
    expect(ok(resolveDrop(ROWS, "b", 4, 0)).unchanged).toBe(true);
  });
  it("a child back in its own place is unchanged, and the verdict still names its parent", () => {
    const v = ok(resolveDrop(ROWS, "bc", 3, 1));
    expect(v).toMatchObject({ parentId: "b", index: 0, unchanged: true, parentLabel: "B", afterLabel: null });
    expect(ok(resolveDrop(ROWS, "bd", 4, 1))).toMatchObject({ parentId: "b", index: 1, unchanged: true });
  });
  it("the same place at another parent is a change", () => {
    expect(ok(resolveDrop(ROWS, "bd", 4, 0)).unchanged).toBe(false);
  });
});

describe("resolveDrop: depth limits", () => {
  it("a depth below the least is lifted to the row below's level", () => {
    expect(ok(resolveDrop(ROWS, "a", 3, -5)).depth).toBe(1);
    expect(ok(resolveDrop(ROWS, "e", 2, 0))).toMatchObject({ depth: 1, parentId: "b" });
  });
  it("a depth above the most is cut to a child of the row above", () => {
    expect(ok(resolveDrop(ROWS, "e", 1, 9))).toMatchObject({ depth: 1, parentId: "a" });
    expect(ok(resolveDrop(ROWS, "a", 0, 3))).toMatchObject({ depth: 0, parentId: null });
  });
  it("a fractional depth is cut towards zero", () => {
    expect(ok(resolveDrop(ROWS, "e", 1, 0.9)).depth).toBe(0);
    expect(ok(resolveDrop(ROWS, "e", 1, 1.9)).depth).toBe(1);
    expect(ok(resolveDrop(ROWS, "e", 1, -0.9)).depth).toBe(0);
  });
  it("a gap is cut to 0 and the row count, and a fractional gap towards zero", () => {
    expect(ok(resolveDrop(ROWS, "e", -3, 0)).gap).toBe(0);
    expect(ok(resolveDrop(ROWS, "a", 99, 0)).gap).toBe(5);
    expect(ok(resolveDrop(ROWS, "a", 1.9, 0)).gap).toBe(1);
  });
  it("the verdict's depth is the depth the line is drawn at", () => {
    expect(ok(resolveDrop(DEEP, "a", 5, 9))).toMatchObject({ depth: 2, parentId: "bd" });
  });
  it("a gap that is NaN lands at the top of the list and is reported as NaN", () => {
    const v = ok(resolveDrop(ROWS, "e", Number.NaN, 0));
    expect(v.gap).toBeNaN();
    expect(v).toMatchObject({ parentId: null, index: 0, depth: 0, unchanged: false });
  });
});

describe("resolveDrop: onto itself or a descendant", () => {
  it("a place inside the part's own parts is refused, with the sentence", () => {
    const v = no(resolveDrop(ROWS, "b", 2, 1));
    expect(v.reason).toBe("B cannot be put inside itself or its own parts.");
    expect(v.gap).toBe(2);
    expect(no(resolveDrop(ROWS, "b", 3, 1)).reason).toBe(insideItself("B"));
  });
  it("the refusal's depth is cut to what that place allows, in the whole list", () => {
    expect(no(resolveDrop(ROWS, "b", 2, 0)).depth).toBe(1);
    expect(no(resolveDrop(ROWS, "b", 2, 9)).depth).toBe(1);
    expect(no(resolveDrop(ROWS, "b", 3, 9)).depth).toBe(2);
  });
  it("the places just above the part and just after its last part are not inside it", () => {
    expect(resolveDrop(ROWS, "b", 1, 0).ok).toBe(true);
    expect(resolveDrop(ROWS, "b", 4, 0).ok).toBe(true);
  });
  it("a deep part cannot go under its own grandchild", () => {
    expect(no(resolveDrop(DEEP, "b", 4, 3)).reason).toBe(insideItself("B"));
    expect(no(resolveDrop(DEEP, "bc", 3, 2)).reason).toBe(insideItself("C"));
  });
  it("a part with no parts of its own has no place inside itself", () => {
    for (let gap = 0; gap <= ROWS.length; gap++) expect(resolveDrop(ROWS, "a", gap, 0).ok, String(gap)).toBe(true);
  });
  it("a part whose id is not in the list is refused, with the gap cut", () => {
    expect(resolveDrop(ROWS, "nope", 99, 3)).toEqual({ ok: false, activeId: "nope", reason: "That part is not in the list.", gap: 5, depth: 0 });
    expect(resolveDrop([], "a", 0, 0)).toEqual({ ok: false, activeId: "a", reason: "That part is not in the list.", gap: 0, depth: 0 });
  });
});

describe("resolveDrop: places where no part can go under", () => {
  it("is refused with a sentence when the rows jump a level", () => {
    const jumpy: TreeRow[] = [
      { id: "p", parentId: null, depth: 0, label: "P" },
      { id: "q", parentId: "p", depth: 2, label: "Q" },
      { id: "r", parentId: null, depth: 0, label: "R" },
    ];
    expect(resolveDrop(jumpy, "r", 2, 2)).toEqual({ ok: false, activeId: "r", reason: "There is no part to go under there.", gap: 2, depth: 2 });
    expect(resolveDrop(jumpy, "r", 2, 3)).toMatchObject({ ok: true, parentId: "q", depth: 3 });
  });
});

describe("resolveDrop: the caller's rule", () => {
  it("is asked with the part, the new parent and the place, and its sentence refuses the move", () => {
    const refuse = vi.fn<RefuseMove>(() => "Not there.");
    const v = no(resolveDrop(ROWS, "a", 3, 1, refuse));
    expect(v).toEqual({ ok: false, activeId: "a", reason: "Not there.", gap: 3, depth: 1 });
    expect(refuse).toHaveBeenCalledWith({ activeId: "a", parentId: "b", index: 1 });
  });
  it("null lets the move through; the rule is also asked for a move that stays", () => {
    const refuse = vi.fn<RefuseMove>(() => null);
    expect(resolveDrop(ROWS, "a", 1, 0, refuse).ok).toBe(true);
    expect(refuse).toHaveBeenCalledWith({ activeId: "a", parentId: null, index: 0 });
  });
  it("an empty sentence does not refuse", () => {
    expect(resolveDrop(ROWS, "a", 3, 1, () => "").ok).toBe(true);
  });
  it("is not asked for a part inside itself or one not in the list", () => {
    const refuse = vi.fn<RefuseMove>(() => null);
    resolveDrop(ROWS, "b", 2, 1, refuse);
    resolveDrop(ROWS, "zz", 2, 1, refuse);
    expect(refuse).not.toHaveBeenCalled();
  });
});

describe("lineOf", () => {
  it("is null for no rows", () => {
    expect(lineOf([], ok(resolveDrop(ROWS, "a", 0, 0)))).toBeNull();
  });
  it("at the top, the top edge of the first row", () => {
    const v = ok(resolveDrop(ROWS, "e", 0, 0));
    expect(lineOf(ROWS, v)).toEqual({ rowId: "a", edge: "top", depth: 0, ok: true });
  });
  it("elsewhere, the bottom edge of the row above the gap", () => {
    const v = ok(resolveDrop(ROWS, "a", 3, 1));
    expect(lineOf(ROWS, v)).toEqual({ rowId: "bc", edge: "bottom", depth: 1, ok: true });
    expect(lineOf(ROWS, ok(resolveDrop(ROWS, "a", 5, 0)))).toEqual({ rowId: "e", edge: "bottom", depth: 0, ok: true });
  });
  it("a refusal is drawn too, with ok false", () => {
    expect(lineOf(ROWS, resolveDrop(ROWS, "b", 2, 1))).toEqual({ rowId: "b", edge: "bottom", depth: 1, ok: false });
  });
  it("a gap past the end is the last row", () => {
    const v: DropVerdict = { ...ok(resolveDrop(ROWS, "a", 5, 0)), gap: 99 };
    expect(lineOf(ROWS, v)?.rowId).toBe("e");
  });
});

describe("placeWords", () => {
  it("says the reason for a refusal", () => {
    expect(placeWords("B", resolveDrop(ROWS, "b", 2, 1))).toBe("B cannot be put inside itself or its own parts.");
  });
  it("says a part is back where it started", () => {
    expect(placeWords("A", resolveDrop(ROWS, "a", 1, 0))).toBe("A is back where it started");
  });
  it("says the new parent and the sibling it follows", () => {
    expect(placeWords("A", resolveDrop(ROWS, "a", 3, 1))).toBe("A moved under B, after C");
  });
  it("says first when nothing is before it, and the top level when there is no parent", () => {
    expect(placeWords("E", resolveDrop(ROWS, "e", 0, 0))).toBe("E moved to the top level, first");
    expect(placeWords("A", resolveDrop(ROWS, "a", 5, 0))).toBe("A moved to the top level, after E");
    expect(placeWords("A", resolveDrop(ROWS, "a", 2, 1))).toBe("A moved under B, first");
  });
  it("uses the label it is given, not the row's", () => {
    expect(placeWords("The thing", resolveDrop(ROWS, "e", 0, 0))).toBe("The thing moved to the top level, first");
  });
});

describe("stepGap", () => {
  it("moves a gap at a time for a part with parts", () => {
    expect(stepGap(ROWS, "b", 1, 1)).toBe(2);
    expect(stepGap(ROWS, "b", 2, -1)).toBe(1);
  });
  it("for a one-row part does not stop on both gaps that mean stay", () => {
    // a is row 0: gaps 0 and 1 both mean stay.
    expect(stepGap(ROWS, "a", 0, 1)).toBe(2);
    expect(stepGap(ROWS, "a", 1, 1)).toBe(2);
    expect(stepGap(ROWS, "e", 5, -1)).toBe(3);
    expect(stepGap(ROWS, "e", 4, -1)).toBe(3);
    expect(stepGap(ROWS, "a", 1, -1)).toBe(0);
    expect(stepGap(ROWS, "a", 0, -1)).toBe(0);
  });
  it("is cut to the list", () => {
    expect(stepGap(ROWS, "b", 5, 1)).toBe(5);
    expect(stepGap(ROWS, "b", 0, -1)).toBe(0);
    expect(stepGap(ROWS, "e", 4, 1)).toBe(5);
  });
  it("a part that is not in the list steps by one", () => {
    expect(stepGap(ROWS, "nope", 2, 1)).toBe(3);
    expect(stepGap(ROWS, "nope", 2, -1)).toBe(1);
    expect(stepGap(ROWS, "nope", 0, 1)).toBe(1);
  });
});

describe("types", () => {
  it("the verdict types are told apart by ok", () => {
    const v: DropVerdict = resolveDrop(ROWS, "a", 3, 1);
    if (v.ok) expect(v.parentId).toBe("b");
    else expect(v.reason).toBeTypeOf("string");
    const row: TreeRow = ROWS[0]!;
    expect(row.parentId).toBeNull();
  });
});
