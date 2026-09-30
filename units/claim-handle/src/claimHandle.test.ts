import { describe, expect, it } from "vitest";
import {
  DisjointTokenSpaceViolation,
  assertMintedHandle,
  assertPositionalHandle,
  isMintedHandle,
  isPositionalHandle,
  mintEmploymentHandle,
  nextFreeEmploymentHandle,
  nextFreeTitleHandle,
  positionalEmploymentHandle,
  positionalTitleHandle,
} from "./claimHandle";

describe("handle spaces", () => {
  it("keeps empN and tN positional, and the minted prefixes minted", () => {
    expect(isPositionalHandle("emp1")).toBe(true);
    expect(isPositionalHandle("t0")).toBe(true);
    expect(isPositionalHandle("emp")).toBe(false);
    expect(isPositionalHandle("empx-abc")).toBe(false);
    expect(isPositionalHandle("ttlx-t0")).toBe(false);
    expect(isMintedHandle("empx-")).toBe(true);
    expect(isMintedHandle("ttlx-anything")).toBe(true);
    expect(isMintedHandle("emp1")).toBe(false);
  });

  it("refuses a positional token as an identity, and a minted token as a position", () => {
    expect(() => assertMintedHandle("emp1")).toThrow(DisjointTokenSpaceViolation);
    expect(() => assertPositionalHandle("empx-abc")).toThrow(DisjointTokenSpaceViolation);
    expect(() => assertPositionalHandle("ttlx-t0")).toThrow(DisjointTokenSpaceViolation);
  });

  it("rejects an index that is not a whole number in range", () => {
    expect(positionalEmploymentHandle(1)).toBe("emp1");
    expect(positionalTitleHandle(0)).toBe("t0");
    expect(() => positionalEmploymentHandle(0)).toThrow(DisjointTokenSpaceViolation);
    expect(() => positionalEmploymentHandle(1.5)).toThrow(DisjointTokenSpaceViolation);
    expect(() => positionalTitleHandle(Number.NaN)).toThrow(DisjointTokenSpaceViolation);
  });

  it("mints only into empx- and skips keys that are still reserved", () => {
    expect(mintEmploymentHandle(() => "fixed")).toBe("empx-fixed");
    expect(mintEmploymentHandle().startsWith("empx-")).toBe(true);
    expect(nextFreeEmploymentHandle(new Set(["emp1"]), new Set(["emp2"]))).toBe("emp3");
    expect(nextFreeTitleHandle(new Set(["t0", "t1"]))).toBe("t2");
    expect(nextFreeTitleHandle(new Set())).toBe("t0");
  });
});
