import { describe, expect, it } from "vitest";
import { claimsOnVault } from "./claimsOnVault";

describe("claimsOnVault", () => {
  type Claim = { id: string; vaultId?: string };
  const home: Claim = { id: "h", vaultId: "seat-a" };
  const loose: Claim = { id: "l" };
  const blank: Claim = { id: "b", vaultId: "" };
  const other: Claim = { id: "o", vaultId: "seat-b" };
  const padded: Claim = { id: "p", vaultId: " seat-a " };
  const claims: Claim[] = [home, loose, blank, other, padded];

  it("returns a new array of every claim when the seat is missing or blank", () => {
    const all = claimsOnVault(claims, undefined);
    expect(all).toEqual(claims);
    expect(all).not.toBe(claims);
    expect(claimsOnVault(claims, null)).toEqual(claims);
    expect(claimsOnVault(claims, "   ")).toEqual(claims);
  });

  it("keeps a missing or empty claim vault id, and an exact seat match", () => {
    expect(claimsOnVault(claims, "seat-a").map((claim) => claim.id)).toEqual(["h", "l", "b"]);
  });

  it("does not trim the claim's vault id, so spaces on the claim never match the trimmed seat", () => {
    expect(claimsOnVault([padded], " seat-a ")).toEqual([]);
    expect(claimsOnVault([home], "seat-a")[0]).toBe(home);
    expect(claims).toHaveLength(5);
  });
});
