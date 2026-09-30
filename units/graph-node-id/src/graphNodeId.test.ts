import { describe, expect, it } from "vitest";
import { pendantNodeId, relationNodeId } from "./graphNodeId";

describe("graph node ids", () => {
  it("prefixes and does not trim or encode", () => {
    const uri = "https://vault.example/base/r/abc";
    expect(relationNodeId(uri)).toBe(`rel:${uri}`);
    expect(pendantNodeId("rec 1", uri)).toBe(`pend:rec 1:${uri}`);
    expect(relationNodeId("")).toBe("rel:");
    expect(pendantNodeId("", "")).toBe("pend::");
  });

  it("does not collide with the bare record id", () => {
    const recordId = "abc";
    const uri = "https://vault.example/base/r/abc";
    expect(relationNodeId(uri)).not.toBe(recordId);
    expect(pendantNodeId(recordId, uri)).not.toBe(recordId);
    expect(pendantNodeId(recordId, uri)).not.toBe(relationNodeId(uri));
  });
});
