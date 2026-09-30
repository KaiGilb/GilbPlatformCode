import { describe, expect, it } from "vitest";
import { cardFactEdgeLabel, cardFactRelationUri, injectCardFactRelations } from "./cardFactEdge";

describe("cardFactRelationUri", () => {
  it("keeps empty parts and does not escape colons", () => {
    expect(cardFactRelationUri({ slug: "claimSubject", sourceId: "s", targetId: "t" })).toBe(
      "fact:claimSubject:s:t",
    );
    expect(cardFactRelationUri({ slug: "", sourceId: "", targetId: "" })).toBe("fact:::");
    expect(cardFactRelationUri({ slug: "a:b", sourceId: "s", targetId: "t" })).toBe(
      "fact:a:b:s:t",
    );
  });
});

describe("cardFactEdgeLabel", () => {
  it("renames only the three slugs, and only the first segment", () => {
    expect(cardFactEdgeLabel("fact:claimSubject:s:t")).toBe("about");
    expect(cardFactEdgeLabel("fact:heldParty")).toBe("held-party");
    expect(cardFactEdgeLabel("fact:profilePhoto:a:b")).toBe("profile-photo");
    expect(cardFactEdgeLabel("fact:hasPhoto:a")).toBe("hasPhoto");
    expect(cardFactEdgeLabel("fact:ClaimSubject:a")).toBe("ClaimSubject");
    expect(cardFactEdgeLabel("fact:")).toBe("");
    expect(cardFactEdgeLabel("Fact:claimSubject")).toBeUndefined();
    expect(cardFactEdgeLabel("relation:claimSubject")).toBeUndefined();
  });
});

describe("injectCardFactRelations", () => {
  it("appends source then target, and leaves the input arrays alone", () => {
    const existing = { relation: "stored", role: "role:member", type: "t:PartOf" };
    const input = new Map([["person", [existing]]]);
    const next = injectCardFactRelations(input, [
      { sourceId: "phone", targetId: "person", slug: "claimSubject" },
    ]);
    expect(next.get("phone")).toEqual([
      { relation: "fact:claimSubject:phone:person", role: "role:source" },
    ]);
    expect(next.get("person")).toEqual([
      existing,
      { relation: "fact:claimSubject:phone:person", role: "role:target" },
    ]);
    expect(next.get("person")?.[0]).toBe(existing);
    expect(input.get("person")).toEqual([existing]);
    expect(next).not.toBe(input);
  });

  it("writes both roles on the same id when source and target match", () => {
    const next = injectCardFactRelations(new Map(), [
      { sourceId: "same", targetId: "same", slug: "heldParty" },
    ]);
    expect(next.get("same")?.map((row) => row.role)).toEqual(["role:source", "role:target"]);
  });
});
