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
      { principal: "reader-only", modes: ["read"] },
      { principal: "writer-only", modes: ["read", "write"] },
      { principal: "writer-too", modes: ["read", "write"] },
    ]);
  });

  it("reads the raw spelling when the framed key is absent", () => {
    expect(listDirectShares({ "a:directReader": "one" })).toEqual([
      { principal: "one", modes: ["read"] },
    ]);
  });

  it("returns nothing for a missing fact map", () => {
    expect(listDirectShares(null)).toEqual([]);
    expect(listDirectShares(undefined)).toEqual([]);
  });
});
