import { describe, expect, it } from "vitest";
import {
  TOGGLE_ON,
  applyNarrowing,
  defaultNarrowingState,
  filtersForView,
  flattenColumns,
  isFilterActive,
  type NarrowingFilter,
} from "./narrowingCut";

interface Row {
  id: string;
  live: boolean;
}

function liveFilter(prepare?: NarrowingFilter<Row>["prepare"]): NarrowingFilter<Row> {
  const filter: NarrowingFilter<Row> = {
    id: "live",
    label: "Live",
    control: "toggle",
    keep: (row) => row.live,
    describe: () => "Live only",
  };
  if (prepare) filter.prepare = prepare;
  return filter;
}

describe("selection and offering", () => {
  it("treats a missing or empty selection as off, and a blank entry as on", () => {
    expect(isFilterActive({}, "live")).toBe(false);
    expect(isFilterActive({ live: [] }, "live")).toBe(false);
    expect(isFilterActive({ live: [""] }, "live")).toBe(true);
    expect([...TOGGLE_ON]).toEqual(["on"]);
  });

  it("offers a filter with no offeredIn in every view, and an empty offeredIn in none", () => {
    const open = liveFilter();
    const searchOnly: NarrowingFilter<Row> = { ...liveFilter(), id: "search-only", offeredIn: ["search"] };
    const nowhere: NarrowingFilter<Row> = { ...liveFilter(), id: "nowhere", offeredIn: [] };
    expect(filtersForView("hierarchy", [open, searchOnly, nowhere]).map((f) => f.id)).toEqual(["live"]);
    expect(filtersForView("search", [open, searchOnly, nowhere]).map((f) => f.id)).toEqual([
      "live",
      "search-only",
    ]);
  });

  it("copies a non-empty default and leaves an empty default absent", () => {
    const on: NarrowingFilter<Row> = { ...liveFilter(), defaultSelection: ["on"] };
    const off: NarrowingFilter<Row> = { ...liveFilter(), id: "off", defaultSelection: [] };
    const state = defaultNarrowingState([on, off]);
    expect(state).toEqual({ live: ["on"] });
    expect(state.live).not.toBe(on.defaultSelection);
    expect(isFilterActive(state, "off")).toBe(false);
  });
});

describe("applyNarrowing", () => {
  const columns = {
    types: [
      { id: "a", live: true },
      { id: "b", live: false },
    ],
    functions: [{ id: "c", live: false }],
    values: [{ id: "d", live: true }],
  };

  it("flattens types, then functions, then values", () => {
    expect(flattenColumns(columns).map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not cut while prepare has not landed, and does not mutate the input", () => {
    const waiting = liveFilter(async () => null);
    const outcome = applyNarrowing(columns, { live: ["on"] }, {}, [waiting]);
    expect(outcome.columns.types.map((row) => row.id)).toEqual(["a", "b"]);
    expect(outcome.removed.total).toBe(0);
    expect(outcome.byFilter).toEqual({});
    expect(outcome.notes).toEqual([]);
    expect(columns.types).toHaveLength(2);
  });

  it("cuts once prepare has landed, and counts each filter against the uncut list", () => {
    const dropB: NarrowingFilter<Row> = {
      id: "drop-b",
      label: "Drop b",
      control: "toggle",
      keep: (row) => row.id !== "b",
      describe: () => "not b",
    };
    const dropBToo: NarrowingFilter<Row> = {
      id: "drop-b-too",
      label: "Drop b too",
      control: "toggle",
      keep: (row) => row.id !== "b",
      describe: () => "also not b",
    };
    const outcome = applyNarrowing(
      columns,
      { "drop-b": ["on"], "drop-b-too": ["on"] },
      {},
      [dropB, dropBToo],
    );
    expect(outcome.columns.types.map((row) => row.id)).toEqual(["a"]);
    expect(outcome.removed).toEqual({ types: 1, functions: 0, values: 0, total: 1 });
    expect(outcome.byFilter).toEqual({ "drop-b": 1, "drop-b-too": 1 });
    expect(outcome.notes).toEqual(["not b", "also not b"]);
  });

  it("passes 0 through to keep, and treats a null prepare value as ready", () => {
    const seen: unknown[] = [];
    const filter: NarrowingFilter<Row> = {
      id: "n",
      label: "N",
      control: "multi",
      prepare: async () => 0,
      keep: (_row, _selected, prepared) => {
        seen.push(prepared);
        return true;
      },
      describe: (_selected, prepared) => String(prepared),
    };
    const outcome = applyNarrowing(columns, { n: ["x"] }, { n: 0 }, [filter]);
    expect(seen[0]).toBe(0);
    expect(outcome.notes).toEqual(["0"]);

    const nullSeen: unknown[] = [];
    const nullable: NarrowingFilter<Row> = {
      ...filter,
      id: "z",
      keep: (_row, _selected, prepared) => {
        nullSeen.push(prepared);
        return true;
      },
      describe: () => "z",
    };
    applyNarrowing(columns, { z: ["x"] }, { z: null }, [nullable]);
    expect(nullSeen[0]).toBeNull();
  });
});
