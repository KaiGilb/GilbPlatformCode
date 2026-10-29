// The reach cap: one reach of the list brings at most 20 records over all held vaults.
import { describe, it, expect } from "vitest";
import {
  STAKEHOLDER_LIST_REACH_CAP,
  pageLimitFor,
  pageLimitOfVault,
} from "./index";

describe("STAKEHOLDER_LIST_REACH_CAP and pageLimitFor", () => {
  it("is 20", () => expect(STAKEHOLDER_LIST_REACH_CAP).toBe(20));

  it("1 vault: 20; 2 vaults: 10 and 10; 3 vaults: 7, 7, 6 (the holder's own first takes the remainder)", () => {
    expect(pageLimitFor(0, 1)).toBe(20);
    expect([pageLimitFor(0, 2), pageLimitFor(1, 2)]).toEqual([10, 10]);
    expect([0, 1, 2].map((i) => pageLimitFor(i, 3))).toEqual([7, 7, 6]);
  });

  it("one reach across up to 20 vaults brings exactly 20", () => {
    for (let n = 1; n <= 20; n++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += pageLimitFor(i, n);
      expect(sum).toBe(20);
    }
  });

  it("the known edge: more than 20 vaults give 1 record each, never 0", () => {
    expect(pageLimitFor(0, 25)).toBe(1);
    expect(pageLimitFor(24, 25)).toBe(1);
  });

  it("0 vaults is read as 1", () => expect(pageLimitFor(0, 0)).toBe(20));
});

describe("pageLimitOfVault: the limit by vault id, as both apps' records doors ask it", () => {
  it("keys each vault by its place in the held list, own first", () => {
    const limitOf = pageLimitOfVault(["own", "b", "c"]);
    expect(limitOf("own")).toBe(7);
    expect(limitOf("b")).toBe(7);
    expect(limitOf("c")).toBe(6);
  });

  it("a vault not in the list is read as the first", () => {
    expect(pageLimitOfVault(["own", "b"])("zz")).toBe(10);
  });
});
