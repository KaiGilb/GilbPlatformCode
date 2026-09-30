import { describe, expect, it } from "vitest";
import {
  cardFactEdgeLabel,
  cardFactRelationUri,
  isCardHandleName,
  isHubRecord,
  refKeyVariants,
} from "./refKeys";

const ORIGIN = "https://id.example.test";

describe("card handle vs hub", () => {
  it("treats a pfc name as a field and a plain name as the person", () => {
    expect(isCardHandleName("pfc:https://id.example.test/base/p/abc:a:phone:phone")).toBe(true);
    expect(isCardHandleName("PFC:nope")).toBe(false);
    expect(isCardHandleName(undefined)).toBe(false);
    expect(isCardHandleName("")).toBe(false);
    expect(isHubRecord({ id: "person", facts: { name: "Mona" } })).toBe(true);
    expect(isHubRecord({ id: "phone", facts: { name: "pfc:x" } })).toBe(false);
    expect(isHubRecord({ id: "noname", facts: { label: "pfc:x" } })).toBe(true);
  });
});

describe("refKeyVariants", () => {
  it("expands base: only when an origin is passed, and the origin must not already end in /base", () => {
    const compact = "base:p/c8699c55-c4bc-4d6a-ac83-8ab099d8918f";
    expect(refKeyVariants(compact)).toEqual([compact]);
    expect(refKeyVariants(compact, ORIGIN)).toContain(`${ORIGIN}/base/p/c8699c55-c4bc-4d6a-ac83-8ab099d8918f`);
    expect(refKeyVariants(compact, `${ORIGIN}/base`)[1]).toBe(
      `${ORIGIN}/base/base/p/c8699c55-c4bc-4d6a-ac83-8ab099d8918f`,
    );
  });

  it("adds host+path and the base:p short form for an absolute principal", () => {
    const absolute = `${ORIGIN}/base/p/abc`;
    expect(refKeyVariants(absolute)).toEqual([absolute, "id.example.test/base/p/abc", "base:p/abc"]);
  });

  it("adds the slash-stripped form when the path ends with /i", () => {
    expect(refKeyVariants("https://example.test/i/")).toContain("https://example.test/i");
  });

  it("returns nothing for blank", () => {
    expect(refKeyVariants("  ")).toEqual([]);
  });
});

describe("card fact edge label", () => {
  it("maps the three known slugs and returns undefined when it is not a fact id", () => {
    const uri = cardFactRelationUri({ sourceId: "phone", targetId: "person", slug: "claimSubject" });
    expect(uri).toBe("fact:claimSubject:phone:person");
    expect(cardFactEdgeLabel(uri)).toBe("about");
    expect(cardFactEdgeLabel("fact:heldParty:a:b")).toBe("held-party");
    expect(cardFactEdgeLabel("fact:profilePhoto:a:b")).toBe("profile-photo");
    expect(cardFactEdgeLabel("fact:member-of:a:b")).toBe("member-of");
    expect(cardFactEdgeLabel("relation:other")).toBeUndefined();
    expect(cardFactEdgeLabel("fact:")).toBe("");
  });
});
