// The DISCLOSED total reader — Base Cycle144 client half.
//
// Carrier: 3P.C.ResultTotal.DisclosedApproximationAndExactOnRequest.Base.
// 🔴 THE PROPERTY UNDER TEST IS THE NO-LIE INVARIANT: there is no input to this
// module that produces a bare numeral out of a non-exact total.

import { describe, expect, test } from "vitest";
import {
  addLocalCount,
  exactCount,
  formatResultTotal,
  maxResultTotal,
  narrowResultTotal,
  provesEmpty,
  readResultTotal,
} from "./resultTotal";

describe("readResultTotal", () => {
  test("post-C144 exact → a census", () => {
    expect(readResultTotal({ total: { kind: "exact", value: 42 }, count: 42 })).toEqual({
      kind: "exact",
      value: 42,
    });
  });

  test("🔴 post-C144 atLeast with count ABSENT → the bound survives", () => {
    expect(readResultTotal({ total: { kind: "atLeast", value: 200 } })).toEqual({
      kind: "atLeast",
      value: 200,
    });
  });

  test("post-C144 approximate → the estimate survives as an estimate", () => {
    expect(readResultTotal({ total: { kind: "approximate", value: 3_000_000 } })).toEqual({
      kind: "approximate",
      value: 3_000_000,
    });
  });

  test("total:null (mode none) → null, ⛔ not zero", () => {
    expect(readResultTotal({ total: null })).toBeNull();
  });

  test("PRE-C144 body (count only) → exact — the old count always WAS a census", () => {
    expect(readResultTotal({ count: 7266 })).toEqual({ kind: "exact", value: 7266 });
  });

  test("neither field → null", () => {
    expect(readResultTotal({})).toBeNull();
    expect(readResultTotal(null)).toBeNull();
    expect(readResultTotal(undefined)).toBeNull();
  });

  test("malformed total does ⛔ NOT silently fall back to count", () => {
    expect(readResultTotal({ total: { kind: "wat", value: 5 }, count: 5 })).toBeNull();
    expect(readResultTotal({ total: { kind: "exact", value: "5" }, count: 5 })).toBeNull();
  });
});

describe("exactCount — the ONE route to a census", () => {
  test("exact yields the number", () => {
    expect(exactCount({ kind: "exact", value: 3 })).toBe(3);
  });

  test("🔴 a BOUND yields null — ⛔ never its floor", () => {
    expect(exactCount({ kind: "atLeast", value: 200 })).toBeNull();
  });

  test("🔴 an ESTIMATE yields null — ⛔ never its value", () => {
    expect(exactCount({ kind: "approximate", value: 3_000_000 })).toBeNull();
  });

  test("no total yields null", () => {
    expect(exactCount(null)).toBeNull();
  });
});

describe("formatResultTotal — the ONLY route from a total to text", () => {
  test("a census is a bare number", () => {
    expect(formatResultTotal({ kind: "exact", value: 3110 })).toBe("3,110");
  });

  test("🔴 a BOUND is Kai's phrasing, ⛔ never a numeral on its own", () => {
    expect(formatResultTotal({ kind: "atLeast", value: 10_000 })).toBe("more than 10,000");
  });

  test("an ESTIMATE says it is one", () => {
    expect(formatResultTotal({ kind: "approximate", value: 3_000_000 })).toBe("about 3,000,000");
  });

  test("no total renders nothing — ⛔ not a zero, ⛔ not a guess", () => {
    expect(formatResultTotal(null)).toBeNull();
  });

  test("🔴 THE INVARIANT: no non-exact total ever formats to a bare numeral", () => {
    for (const kind of ["atLeast", "approximate"] as const) {
      for (const value of [0, 1, 200, 10_000, 48_030_007]) {
        const s = formatResultTotal({ kind, value })!;
        expect(s).not.toMatch(/^[\d,]+$/);
      }
    }
  });
});

describe("provesEmpty — what licenses an ABSENCE claim", () => {
  test("🔴 ONLY an exact zero does", () => {
    expect(provesEmpty({ kind: "exact", value: 0 })).toBe(true);
  });

  test("⛔ a BOUND of zero does not — the vault never established the set was empty", () => {
    expect(provesEmpty({ kind: "atLeast", value: 0 })).toBe(false);
  });

  test("⛔ an ESTIMATE of zero does not", () => {
    expect(provesEmpty({ kind: "approximate", value: 0 })).toBe(false);
  });

  test("⛔ no total does not — this is the case that printed a false absence", () => {
    expect(provesEmpty(null)).toBe(false);
    expect(provesEmpty(undefined)).toBe(false);
  });

  test("a non-zero exact total does not", () => {
    expect(provesEmpty({ kind: "exact", value: 1 })).toBe(false);
  });
});

describe("kind preservation — ⛔ nothing may be promoted to a census", () => {
  test("narrowResultTotal keeps the kind and subtracts page-local drops", () => {
    expect(narrowResultTotal({ kind: "atLeast", value: 200 }, 20, 18)).toEqual({
      kind: "atLeast",
      value: 198,
    });
    expect(narrowResultTotal({ kind: "exact", value: 5 }, 5, 3)).toEqual({ kind: "exact", value: 3 });
  });

  test("addLocalCount adding an EXACT local count to a BOUND still yields a BOUND", () => {
    expect(addLocalCount({ kind: "atLeast", value: 200 }, 3)).toEqual({ kind: "atLeast", value: 203 });
  });

  test("🔴 adding to NO total yields NO total — file hits alone are not a match total", () => {
    expect(addLocalCount(null, 3)).toBeNull();
  });

  test("maxResultTotal: exact + exact stays exact; anything else degrades", () => {
    expect(maxResultTotal({ kind: "exact", value: 2 }, { kind: "exact", value: 5 })).toEqual({
      kind: "exact",
      value: 5,
    });
    expect(maxResultTotal({ kind: "exact", value: 9 }, { kind: "atLeast", value: 5 })).toEqual({
      kind: "atLeast",
      value: 9,
    });
    expect(maxResultTotal(null, { kind: "atLeast", value: 5 })).toEqual({ kind: "atLeast", value: 5 });
    expect(maxResultTotal(null, null)).toBeNull();
  });
});

describe("⚠ undefined tolerance at the HTTP boundary", () => {
  // Measured 2026-08-18: a `=== null` guard threw
  // "Cannot read properties of undefined (reading 'kind')" and the Standards surface
  // rendered that TypeError text to the user in place of its answer.
  test("every helper treats undefined exactly like null", () => {
    expect(exactCount(undefined)).toBeNull();
    expect(formatResultTotal(undefined)).toBeNull();
    expect(narrowResultTotal(undefined, 5, 3)).toBeNull();
    expect(addLocalCount(undefined, 3)).toBeNull();
    expect(provesEmpty(undefined)).toBe(false);
    expect(maxResultTotal(undefined, undefined)).toBeNull();
  });
});
