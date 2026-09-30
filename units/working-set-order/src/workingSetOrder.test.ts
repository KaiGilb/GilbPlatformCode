import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  EMPTY_WORKING_SET,
  isAllTypes,
  isAllVaults,
  nextSortState,
  parseSortParam,
  parseWorkingSetParams,
  serializeSortParam,
  sortWorkingSetItems,
  vaultPathTowardRoot,
  writeWorkingSetParams,
  type FacetableItem,
} from "./workingSetOrder";

function item(partial: Partial<FacetableItem> & Pick<FacetableItem, "id">): FacetableItem {
  return {
    vaultId: "v",
    typeUri: "t:Note",
    name: partial.id,
    updatedAt: 0,
    ...partial,
  };
}

describe("axes", () => {
  it("is unrestricted only when that list is empty", () => {
    expect(isAllVaults(EMPTY_WORKING_SET)).toBe(true);
    expect(isAllTypes({ vaultIds: ["v"], typeIds: [] })).toBe(true);
    expect(isAllVaults({ vaultIds: [""], typeIds: [] })).toBe(false);
  });
});

describe("sortWorkingSetItems", () => {
  it("puts the newer date first and does not reverse a name tie", () => {
    const older = item({ id: "b", name: "Zed", updatedAt: 1 });
    const newerNamed = item({ id: "a", name: "Ann", updatedAt: 2 });
    const newerBlank = item({ id: "c", name: "   ", updatedAt: 2 });
    const input = [older, newerBlank, newerNamed];
    const sorted = sortWorkingSetItems(input);
    expect(sorted.map((row) => row.id)).toEqual(["a", "c", "b"]);
    expect(input.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("does not reverse the id tie-break when the date direction is descending", () => {
    const low = item({ id: "a", name: "Same", updatedAt: 1 });
    const high = item({ id: "b", name: "Same", updatedAt: 1 });
    expect(sortWorkingSetItems([high, low]).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("sorts names with ordinary lowercasing, and a blank name is last when ascending", () => {
    const rows = [
      item({ id: "2", name: "  " }),
      item({ id: "1", name: "b" }),
      item({ id: "3", name: "A" }),
    ];
    expect(
      sortWorkingSetItems(rows, { key: "name", dir: "asc" }).map((row) => row.id),
    ).toEqual(["3", "1", "2"]);
  });

  it("puts a blank name first when the name direction is descending", () => {
    const rows = [item({ id: "1", name: "Ann" }), item({ id: "2", name: "  " })];
    expect(
      sortWorkingSetItems(rows, { key: "name", dir: "desc" }).map((row) => row.id),
    ).toEqual(["2", "1"]);
  });

  it("uses the type label only for a type sort", () => {
    const calls: string[] = [];
    const rows = [
      item({ id: "1", typeUri: "t:B", name: "n" }),
      item({ id: "2", typeUri: "t:A", name: "n" }),
    ];
    sortWorkingSetItems(rows, { key: "date", dir: "desc" }, (uri) => {
      calls.push(uri);
      return uri;
    });
    expect(calls).toEqual([]);
    expect(
      sortWorkingSetItems(rows, { key: "type", dir: "asc" }, (uri) =>
        uri === "t:B" ? "Alpha" : "Zed",
      ).map((row) => row.id),
    ).toEqual(["1", "2"]);
  });
});

describe("sort parameters", () => {
  it("flips the same column and starts a new column at its own default", () => {
    expect(nextSortState(DEFAULT_SORT, "date")).toEqual({ key: "date", dir: "asc" });
    expect(nextSortState({ key: "name", dir: "desc" }, "date")).toEqual({
      key: "date",
      dir: "desc",
    });
    expect(nextSortState(DEFAULT_SORT, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSortState(DEFAULT_SORT, "type")).toEqual({ key: "type", dir: "asc" });
  });

  it("parses date without a suffix as oldest-first, and the default as null", () => {
    expect(parseSortParam(null)).toEqual({ key: "date", dir: "desc" });
    expect(parseSortParam("")).toEqual({ key: "date", dir: "desc" });
    expect(parseSortParam("date")).toEqual({ key: "date", dir: "asc" });
    expect(parseSortParam("date-")).toEqual({ key: "date", dir: "desc" });
    expect(parseSortParam("name-")).toEqual({ key: "name", dir: "desc" });
    expect(parseSortParam("type")).toEqual({ key: "type", dir: "asc" });
    expect(parseSortParam("nope")).toEqual({ key: "date", dir: "desc" });
    expect(parseSortParam("date--")).toEqual({ key: "date", dir: "desc" });
    const parsed = parseSortParam(null);
    parsed.dir = "asc";
    expect(DEFAULT_SORT.dir).toBe("desc");
  });

  it("serializes the default as null", () => {
    expect(serializeSortParam(DEFAULT_SORT)).toBeNull();
    expect(serializeSortParam({ key: "date", dir: "asc" })).toBe("date");
    expect(serializeSortParam({ key: "name", dir: "desc" })).toBe("name-");
    expect(serializeSortParam({ key: "type", dir: "asc" })).toBe("type");
  });
});

describe("working-set parameters", () => {
  it("splits on commas, trims, and drops empties", () => {
    const params = parseWorkingSetParams((key) => (key === "wsp" ? " a, ,b " : "t"));
    expect(params).toEqual({ vaultIds: ["a", "b"], typeIds: ["t"] });
  });

  it("writes null for an empty list and does not write the sort", () => {
    const written = new Map<string, string | null>();
    writeWorkingSetParams({ vaultIds: ["a", "b"], typeIds: [] }, (key, value) => {
      written.set(key, value);
    });
    expect(written.get("wsp")).toBe("a,b");
    expect(written.get("wst")).toBeNull();
    expect(written.has("sort")).toBe(false);
  });
});

describe("vaultPathTowardRoot", () => {
  const vaults = [
    { vaultId: "root", label: "Root", parentVaultId: null },
    { vaultId: "mid", label: "Mid", parentVaultId: "root" },
    { vaultId: "leaf", label: "Leaf", parentVaultId: "mid" },
    { vaultId: "loop", label: "Loop", parentVaultId: "back" },
    { vaultId: "back", label: "Back", parentVaultId: "loop" },
  ];

  it("walks root first and stops when a parent is missing", () => {
    expect(vaultPathTowardRoot("leaf", vaults)).toEqual([
      { vaultId: "root", label: "Root" },
      { vaultId: "mid", label: "Mid" },
      { vaultId: "leaf", label: "Leaf" },
    ]);
    expect(vaultPathTowardRoot("missing", vaults)).toEqual([]);
    expect(vaultPathTowardRoot("", vaults)).toEqual([]);
    expect(vaultPathTowardRoot(null, vaults)).toEqual([]);
  });

  it("does not repeat an id in a cycle, and the open vault stays last", () => {
    expect(vaultPathTowardRoot("loop", vaults).map((node) => node.vaultId)).toEqual([
      "back",
      "loop",
    ]);
  });
});
