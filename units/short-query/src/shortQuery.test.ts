import { describe, expect, it } from "vitest";
import { vaultPurposeShortQueryReach } from "./shortQuery";

describe("vaultPurposeShortQueryReach", () => {
  it("counts length, including spaces, and uses singular only for one", () => {
    expect(vaultPurposeShortQueryReach("ab", 3)).toBe(
      "Type 1 more letter to search types that currently resolve.",
    );
    expect(vaultPurposeShortQueryReach("a", 3)).toBe(
      "Type 2 more letters to search types that currently resolve.",
    );
    expect(vaultPurposeShortQueryReach("a ", 3)).toBe(
      "Type 1 more letter to search types that currently resolve.",
    );
    expect(vaultPurposeShortQueryReach("abcd", 3)).toBe(
      "Type -1 more letters to search types that currently resolve.",
    );
    expect(vaultPurposeShortQueryReach("", 0)).toBe(
      "Type 0 more letters to search types that currently resolve.",
    );
  });
});
