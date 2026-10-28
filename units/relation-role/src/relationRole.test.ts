// Pinning tests: every export has at least one, and the odd cases are pinned as the code does them.
import { describe, expect, it } from "vitest";
import { roleIs, type RecordRelation } from "./index";

describe("roleIs", () => {
  it("matches the bare name and the role:-prefixed name on either side", () => {
    expect(roleIs("source", "role:source")).toBe(true);
    expect(roleIs("role:source", "source")).toBe(true);
    expect(roleIs("source", "source")).toBe(true);
    expect(roleIs("role:source", "role:source")).toBe(true);
  });
  it("is false for another role, with or without the prefix", () => {
    expect(roleIs("target", "role:source")).toBe(false);
    expect(roleIs("role:target", "source")).toBe(false);
    expect(roleIs("role:target", "role:source")).toBe(false);
  });
  it("is false for an empty, null, undefined or non-string value", () => {
    expect(roleIs("", "role:source")).toBe(false);
    expect(roleIs(null, "role:source")).toBe(false);
    expect(roleIs(undefined, "role:source")).toBe(false);
    expect(roleIs(5 as unknown as string, "5")).toBe(false);
    expect(roleIs({} as unknown as string, "role:source")).toBe(false);
    expect(roleIs(["source"] as unknown as string, "source")).toBe(false);
  });
  it("is false when the slug is empty or is just the prefix, even for a value of the same shape", () => {
    expect(roleIs("role:", "role:")).toBe(false);
    expect(roleIs("", "")).toBe(false);
    expect(roleIs("role:", "")).toBe(false);
    expect(roleIs("source", "role:")).toBe(false);
    expect(roleIs("source", "")).toBe(false);
  });
  it("compares exactly: case, spaces and a doubled prefix on the value do not match", () => {
    expect(roleIs("Source", "source")).toBe(false);
    expect(roleIs(" source", "source")).toBe(false);
    expect(roleIs("source ", "role:source")).toBe(false);
    expect(roleIs("role:role:source", "role:source")).toBe(false);
  });
  it("strips only one leading role: from the slug, so a slug role:role:x is the bare name role:x", () => {
    expect(roleIs("role:x", "role:role:x")).toBe(true);
    expect(roleIs("role:role:x", "role:role:x")).toBe(true);
    expect(roleIs("x", "role:role:x")).toBe(false);
  });
});

describe("RecordRelation (type test, checked by tsc)", () => {
  it("an object with relation, role, members and type satisfies it", () => {
    const full: RecordRelation = {
      relation: "https://vault.example.test/base/r/abc",
      role: "role:solution",
      members: [{ member: "https://vault.example.test/base/e/one", role: "role:value" }],
      type: "t:ImpactOn",
    };
    expect(full.members?.[0]?.role).toBe("role:value");
    expect(full.type).toBe("t:ImpactOn");
  });
  it("members and type are optional; relation and role are required", () => {
    const small: RecordRelation = { relation: "r", role: "member" };
    expect(small.members).toBeUndefined();
    expect(small.type).toBeUndefined();
    // @ts-expect-error role is required
    const noRole: RecordRelation = { relation: "r" };
    // @ts-expect-error relation is required
    const noRelation: RecordRelation = { role: "member" };
    // @ts-expect-error a member needs both its entity and its role
    const halfMember: RecordRelation = { relation: "r", role: "m", members: [{ member: "x" }] };
    expect([noRole, noRelation, halfMember]).toHaveLength(3);
  });
  it("members is read-only", () => {
    const rel: RecordRelation = { relation: "r", role: "m", members: [{ member: "x", role: "y" }] };
    // @ts-expect-error a readonly array has no push
    rel.members?.push({ member: "z", role: "y" });
    expect(rel.members).toBeDefined();
  });
});
