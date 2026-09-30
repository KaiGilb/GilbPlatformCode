import { describe, expect, it } from "vitest";
import {
  INCLUDE_CHILDREN_PARAM,
  contentVaultIds,
  directChildVaults,
  expandWithDescendants,
  filterWorkingSetVaultIds,
  isDirectChildOf,
  parseIncludeChildren,
  selectionHasChildren,
  writeIncludeChildren,
  type VaultChildNode,
} from "./vaultChildren";

const PARENT = "vault-parent";
const CHILD = "vault-child";
const GRAND = "vault-grand";
const OTHER = "vault-other";

const VAULTS: VaultChildNode[] = [
  { vaultId: PARENT, parent: null, parentAmbiguous: false },
  { vaultId: CHILD, parent: { vaultId: PARENT }, parentAmbiguous: false },
  { vaultId: GRAND, parent: { vaultId: CHILD }, parentAmbiguous: false },
  { vaultId: OTHER, parent: null, parentAmbiguous: false },
  { vaultId: "ambiguous", parent: { vaultId: PARENT }, parentAmbiguous: true },
];

describe("parseIncludeChildren / writeIncludeChildren", () => {
  it("is true only for the string 1", () => {
    const bag = new Map<string, string>();
    const get = (key: string) => bag.get(key) ?? null;
    expect(parseIncludeChildren(get)).toBe(false);
    bag.set(INCLUDE_CHILDREN_PARAM, "1");
    expect(parseIncludeChildren(get)).toBe(true);
    bag.set(INCLUDE_CHILDREN_PARAM, "true");
    expect(parseIncludeChildren(get)).toBe(false);
    bag.set(INCLUDE_CHILDREN_PARAM, "0");
    expect(parseIncludeChildren(get)).toBe(false);
  });

  it("writes 1 or removes the key", () => {
    const bag = new Map<string, string>();
    const set = (key: string, value: string | null) => {
      if (value === null) bag.delete(key);
      else bag.set(key, value);
    };
    writeIncludeChildren(true, set);
    expect(bag.get(INCLUDE_CHILDREN_PARAM)).toBe("1");
    writeIncludeChildren(false, set);
    expect(bag.has(INCLUDE_CHILDREN_PARAM)).toBe(false);
  });

  it("honours a host-chosen key", () => {
    const bag = new Map<string, string>([["kids", "1"]]);
    expect(parseIncludeChildren((key) => bag.get(key) ?? null, "kids")).toBe(true);
    expect(parseIncludeChildren((key) => bag.get(key) ?? null, "wsc")).toBe(false);
  });
});

describe("direct children", () => {
  it("matches the parent id and refuses an ambiguous parent", () => {
    expect(isDirectChildOf(VAULTS[1]!, PARENT)).toBe(true);
    expect(isDirectChildOf(VAULTS[2]!, PARENT)).toBe(false);
    expect(isDirectChildOf(VAULTS[4]!, PARENT)).toBe(false);
    expect(isDirectChildOf({ vaultId: "root" }, PARENT)).toBe(false);
    expect(directChildVaults(PARENT, VAULTS).map((vault) => vault.vaultId)).toEqual([CHILD]);
  });
});

describe("selectionHasChildren", () => {
  it("sees a direct child, and ignores an ambiguous one", () => {
    expect(selectionHasChildren([PARENT], VAULTS)).toBe(true);
    expect(selectionHasChildren([OTHER], VAULTS)).toBe(false);
    expect(selectionHasChildren(["ambiguous"], VAULTS)).toBe(false);
  });

  it("an empty selection looks at the whole list", () => {
    expect(selectionHasChildren([], VAULTS)).toBe(true);
    expect(selectionHasChildren([], [{ vaultId: OTHER, parent: null }])).toBe(false);
    expect(
      selectionHasChildren([], [{ vaultId: CHILD, parent: { vaultId: "missing" } }]),
    ).toBe(false);
  });
});

describe("expandWithDescendants", () => {
  it("includes the parent and each descendant, once, parent first", () => {
    expect(expandWithDescendants([PARENT], VAULTS)).toEqual([PARENT, CHILD, GRAND]);
  });

  it("keeps an id that is not in the list, and does not invent its children", () => {
    expect(expandWithDescendants(["absent"], VAULTS)).toEqual(["absent"]);
  });

  it("an empty selection does not return every vault", () => {
    expect(expandWithDescendants([], VAULTS)).toEqual([]);
  });

  it("stops on a loop", () => {
    const loop: VaultChildNode[] = [
      { vaultId: "a", parent: { vaultId: "b" } },
      { vaultId: "b", parent: { vaultId: "a" } },
    ];
    expect(expandWithDescendants(["a"], loop)).toEqual(["a", "b"]);
  });

  it("orders children as they appear in the list", () => {
    const kids: VaultChildNode[] = [
      { vaultId: "p", parent: null },
      { vaultId: "c2", parent: { vaultId: "p" } },
      { vaultId: "c1", parent: { vaultId: "p" } },
    ];
    expect(expandWithDescendants(["p"], kids)).toEqual(["p", "c2", "c1"]);
  });
});

describe("contentVaultIds", () => {
  it("loads the selection, not the whole forest, when children are off", () => {
    expect(contentVaultIds({ vaultIds: [PARENT] }, OTHER, VAULTS, false)).toEqual([PARENT]);
  });

  it("adds descendants only when asked", () => {
    expect(contentVaultIds({ vaultIds: [PARENT] }, OTHER, VAULTS, true)).toEqual([
      PARENT,
      CHILD,
      GRAND,
    ]);
  });

  it("an empty selection loads the shell vault only", () => {
    expect(contentVaultIds({ vaultIds: [] }, PARENT, VAULTS, false)).toEqual([PARENT]);
    expect(contentVaultIds({ vaultIds: [] }, PARENT, VAULTS, true)).toEqual([
      PARENT,
      CHILD,
      GRAND,
    ]);
  });

  it("an empty selection and no shell loads nothing", () => {
    expect(contentVaultIds({ vaultIds: [] }, null, VAULTS, true)).toEqual([]);
    expect(contentVaultIds({ vaultIds: [] }, "", VAULTS, true)).toEqual([]);
  });

  it("de-duplicates and ignores fields other than vaultIds", () => {
    expect(
      contentVaultIds({ vaultIds: [PARENT, PARENT] }, OTHER, VAULTS, false),
    ).toEqual([PARENT]);
  });
});

describe("filterWorkingSetVaultIds", () => {
  it("returns the same array when children are off or the selection is empty", () => {
    const ids = [PARENT];
    expect(filterWorkingSetVaultIds(ids, VAULTS, false)).toBe(ids);
    const empty: string[] = [];
    expect(filterWorkingSetVaultIds(empty, VAULTS, true)).toBe(empty);
  });

  it("returns a new array with descendants when children are on", () => {
    const ids = [PARENT];
    const next = filterWorkingSetVaultIds(ids, VAULTS, true);
    expect(next).toEqual([PARENT, CHILD, GRAND]);
    expect(next).not.toBe(ids);
  });
});
