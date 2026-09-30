import { describe, expect, it } from "vitest";
import { labelToTypeName } from "./labelTypeName";

describe("labelToTypeName", () => {
  it("uppercases the first character only and breaks on non-ASCII", () => {
    expect(labelToTypeName("work in teams")).toBe("WorkInTeams");
    expect(labelToTypeName("WORK in teams")).toBe("WORKInTeams");
    expect(labelToTypeName("")).toBe("");
    expect(labelToTypeName("---")).toBe("");
    expect(labelToTypeName("html5 parser")).toBe("Html5Parser");
    expect(labelToTypeName("café team")).toBe("CafTeam");
    expect(labelToTypeName("a_b")).toBe("AB");
    expect(labelToTypeName("  5 teams ")).toBe("5Teams");
  });
});
