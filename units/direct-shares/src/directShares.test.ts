import { describe, expect, it } from "vitest";
import { listDirectShares, parseGrantPrincipals } from "./directShares";

describe("parseGrantPrincipals", () => {
  it("splits on a comma plus whitespace only", () => {
    expect(parseGrantPrincipals("a, b,  c")).toEqual(["a", "b", "c"]);
    expect(parseGrantPrincipals("a,b")).toEqual(["a,b"]);
    expect(parseGrantPrincipals("  ")).toEqual([]);
    expect(parseGrantPrincipals(null)).toEqual([]);
  });
});

describe("listDirectShares", () => {
  it("pairs write with read, and does not invent a writer", () => {
    const rows = listDirectShares({
      directReader: "reader-only, writer-too",
      directWriter: "writer-too, writer-only",
    });
    expect(rows).toEqual([
      { principal: "reader-only", modes: ["read"], readGranted: true },
      { principal: "writer-only", modes: ["read", "write"], readGranted: false },
      { principal: "writer-too", modes: ["read", "write"], readGranted: true },
    ]);
  });

  // production 2026-11-08, PictureRecords run 2, F26: a write grant does not plant a reader.
  it("a writer with no reader fact is still read and write, and readGranted is false", () => {
    expect(listDirectShares({ directWriter: "writer-only" })).toEqual([
      { principal: "writer-only", modes: ["read", "write"], readGranted: false },
    ]);
  });

  it("a writer the reader fact also names has readGranted true", () => {
    expect(listDirectShares({ directReader: "both", directWriter: "both" })).toEqual([
      { principal: "both", modes: ["read", "write"], readGranted: true },
    ]);
  });

  it("reads the raw spelling when the framed key is absent", () => {
    expect(listDirectShares({ "a:directReader": "one" })).toEqual([
      { principal: "one", modes: ["read"], readGranted: true },
    ]);
    expect(listDirectShares({ "a:directWriter": "only-write" })).toEqual([
      { principal: "only-write", modes: ["read", "write"], readGranted: false },
    ]);
  });

  it("returns nothing for a missing fact map", () => {
    expect(listDirectShares(null)).toEqual([]);
    expect(listDirectShares(undefined)).toEqual([]);
  });
});
