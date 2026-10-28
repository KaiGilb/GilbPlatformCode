// kindDescendants: the walk down from one type by is-a, over the set the master served.
import { describe, expect, it } from "vitest";
import { kindDescendants, type KindDescendant, type StakeholderKindType } from "./kinds";

const kind = (term: string, name: string, parents: string[], label: string | null = name): StakeholderKindType => ({
  term,
  name,
  label,
  isMember: false,
  parents,
  members: [],
});

describe("kindDescendants", () => {
  const root = kind("root", "Root", []);
  const a = kind("a", "A", ["root"]);
  const b = kind("b", "B", ["root"]);
  const a1 = kind("a1", "A1", ["a"]);
  const a2 = kind("a2", "A2", ["a"], null);
  const shared = kind("shared", "Shared", ["a", "b"]);
  const types = [root, a, b, a1, a2, shared];

  it("lists the direct children first and each one's own children right after it, with the depth", () => {
    expect(kindDescendants({ types }, "root").map((d) => [d.name, d.depth])).toEqual([
      ["A", 1],
      ["A1", 2],
      ["A2", 2],
      ["Shared", 2],
      ["B", 1],
    ]);
  });

  it("lists a diamond kind once, where it is first reached", () => {
    const names = kindDescendants({ types }, "root").map((d) => d.name);
    expect(names.filter((n) => n === "Shared")).toHaveLength(1);
    expect(kindDescendants({ types }, "b").map((d) => d.name)).toEqual(["Shared"]);
  });

  it("gives each row the type itself and its term, name and label", () => {
    const rows: KindDescendant[] = kindDescendants({ types }, "a");
    expect(rows).toEqual([
      { type: a1, term: "a1", name: "A1", label: "A1", depth: 1 },
      { type: a2, term: "a2", name: "A2", label: null, depth: 1 },
      { type: shared, term: "shared", name: "Shared", label: "Shared", depth: 1 },
    ]);
    expect(rows[0]!.type).toBe(a1);
  });

  it("is empty for a type with no children and for a term that is not in the set", () => {
    expect(kindDescendants({ types }, "a1")).toEqual([]);
    expect(kindDescendants({ types }, "nowhere")).toEqual([]);
    expect(kindDescendants({ types: [] }, "root")).toEqual([]);
  });

  it("does not list the starting term, and ends on a loop", () => {
    const x = kind("x", "X", ["y"]);
    const y = kind("y", "Y", ["x"]);
    expect(kindDescendants({ types: [x, y] }, "x").map((d) => d.name)).toEqual(["Y"]);
    expect(kindDescendants({ types: [x, y] }, "y").map((d) => d.name)).toEqual(["X"]);
  });

  it("walks the set in its served order", () => {
    expect(kindDescendants({ types: [b, a, root] }, "root").map((d) => d.name)).toEqual(["B", "A"]);
  });
});
