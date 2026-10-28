// The README example, run: build the tree of a Solution's parts, preview a paste, plan a move, and plan the removal of a
// part with the host's reads.
import { describe, expect, it } from "vitest";
import { descriptionTree, planFullLevelMove, previewPaste, removalPlan, type LevelHost } from "./index";

describe("README example", () => {
  it("parses a paste, builds the tree, plans a move and a removal", async () => {
    const pasted = previewPaste("Run: The walker runs.\n- Fast: Faster than walking. <- Ann\nAssumption: Floor: The floor is flat.", "Walk", () => false);
    expect(pasted.parts.map((p) => p.tag)).toEqual(["Walk.Run", "Walk.Run.Fast", "Walk.Assumption.Floor"]);

    const solution = { id: "walk", entityUri: "https://vault.example.test/base/e/walk" };
    const part = (id: string, order: number) => ({
      id,
      entityUri: `https://vault.example.test/base/e/${id}`,
      typeUri: "t:SpecificationElement",
      facts: { unitTag: `Walk.${id.toUpperCase()}` },
      served: { facts: { partOf: { "@id": solution.entityUri }, elementOrder: order }, context: undefined, etag: null },
    });
    const tree = descriptionTree(solution, [part("b", 2), part("a", 1)]);
    expect(tree.map((n) => n.keyword)).toEqual(["A", "B"]);

    expect(planFullLevelMove([{ id: "a", order: 1 }, { id: "b", order: 2 }], "b", { kind: "step", dir: -1 })).toEqual({
      order: 1,
      changes: [{ id: "a", order: 2 }],
    });

    const calls: string[] = [];
    const host: LevelHost = {
      async pageChildIds(_vault, parent) {
        calls.push(`page ${parent.slice(parent.lastIndexOf("/") + 1)}`);
        return { ids: [], count: 0, capped: false };
      },
      async markStale() {},
      async readMember() {
        return null;
      },
      applyPinsAndDrops: (_vault, _attr, _parent, rows) => rows,
    };
    const row = { ...part("b", 2), opaqueFacts: [], etag: null };
    const plan = await removalPlan(host, row, "B", "walk", "https://vault.example.test/base", new Set());
    expect(plan.post.map((g) => g.id)).toEqual(["b"]);
    expect(calls).toEqual(["page b"]);
  });
});
