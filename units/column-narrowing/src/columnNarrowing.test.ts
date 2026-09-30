import { describe, expect, it } from "vitest";
import {
  TOGGLE_ON,
  applyNarrowing,
  defaultNarrowingState,
  filtersForView,
  flattenColumns,
  isFilterActive,
  type OntologyNarrowingFilter,
} from "./columnNarrowing";

interface Item {
  id: string;
}

function filter(
  partial: Pick<OntologyNarrowingFilter<Item>, "id"> & Partial<OntologyNarrowingFilter<Item>>,
): OntologyNarrowingFilter<Item> {
  return {
    label: partial.id,
    control: "toggle",
    keep: () => true,
    describe: () => partial.id,
    ...partial,
  };
}

describe("filters and defaults", () => {
  it("offers a filter with no list in every view, and an empty list in none", () => {
    const everywhere = filter({ id: "all" });
    const searchOnly = filter({ id: "search", offeredIn: ["search"] });
    const nowhere = filter({ id: "none", offeredIn: [] });
    expect(filtersForView("hierarchy", [everywhere, searchOnly, nowhere]).map((f) => f.id)).toEqual([
      "all",
    ]);
    expect(filtersForView("search", [everywhere, searchOnly, nowhere]).map((f) => f.id)).toEqual([
      "all",
      "search",
    ]);
  });

  it("reads an empty selection as off and copies a default", () => {
    expect(isFilterActive({}, "x")).toBe(false);
    expect(isFilterActive({ x: [] }, "x")).toBe(false);
    expect(isFilterActive({ x: [""] }, "x")).toBe(true);
    expect(TOGGLE_ON).toEqual(["on"]);
    const original = ["a"];
    const withDefault = filter({ id: "on", defaultSelection: original });
    const state = defaultNarrowingState([
      withDefault,
      filter({ id: "off" }),
      filter({ id: "empty", defaultSelection: [] }),
    ]);
    expect(state).toEqual({ on: ["a"] });
    expect(state.on).not.toBe(original);
  });
});

describe("applyNarrowing", () => {
  const columns = {
    types: [{ id: "a" }, { id: "b" }],
    functions: [{ id: "a" }],
    values: [{ id: "c" }],
  };

  it("skips a filter that is off or not ready, and does not mutate the input", () => {
    const drop = filter({
      id: "drop",
      keep: (item) => item.id !== "a",
      describe: () => "dropped a",
    });
    const slow = filter({
      id: "slow",
      prepare: async () => 1,
      keep: () => false,
      describe: () => "not yet",
    });
    const types = columns.types;
    const out = applyNarrowing(columns, { slow: ["on"] }, {}, [drop, slow]);
    expect(out.columns.types.map((item) => item.id)).toEqual(["a", "b"]);
    expect(out.byFilter).toEqual({});
    expect(out.notes).toEqual([]);
    expect(out.removed.total).toBe(0);
    expect(columns.types).toBe(types);
  });

  it("counts each ready filter against the original rows, not as a cascade", () => {
    const dropA = filter({
      id: "drop-a",
      keep: (item) => item.id !== "a",
      describe: (selected, prepared) => `a ${selected.join("/")}:${String(prepared)}`,
    });
    const dropB = filter({
      id: "drop-b",
      keep: (item) => item.id !== "b",
      describe: () => "b",
    });
    const out = applyNarrowing(columns, { "drop-a": ["on"], "drop-b": ["on"] }, {}, [dropA, dropB]);
    expect(out.columns.types.map((item) => item.id)).toEqual([]);
    expect(out.columns.functions).toEqual([]);
    expect(out.columns.values.map((item) => item.id)).toEqual(["c"]);
    expect(out.removed).toEqual({ types: 2, functions: 1, values: 0, total: 3 });
    expect(out.byFilter["drop-a"]).toBe(2);
    expect(out.byFilter["drop-b"]).toBe(1);
    expect(out.notes).toEqual(["a on:null", "b"]);
    expect(flattenColumns(columns).map((item) => item.id)).toEqual(["a", "b", "a", "c"]);
  });

  it("treats a present undefined preparation as ready and passes null", () => {
    let seen: unknown = "unset";
    const slow = filter({
      id: "slow",
      prepare: async () => 1,
      keep: (_item, _selected, prepared) => {
        seen = prepared;
        return true;
      },
      describe: () => "ready",
    });
    const prepared: Record<string, unknown> = {};
    prepared.slow = undefined;
    const out = applyNarrowing(columns, { slow: ["on"] }, prepared, [slow]);
    expect(seen).toBeNull();
    expect(out.notes).toEqual(["ready"]);
    expect(out.byFilter.slow).toBe(0);
  });
});
