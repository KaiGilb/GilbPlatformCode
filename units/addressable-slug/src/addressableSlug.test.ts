import { describe, expect, it } from "vitest";
import { attrKey, isAppAddressableSlug } from "./addressableSlug";

describe("attrKey", () => {
  it("prefixes and does nothing else", () => {
    expect(attrKey("name")).toBe("a:name");
    expect(attrKey("a:name")).toBe("a:a:name");
    expect(attrKey("")).toBe("a:");
    expect(attrKey(" name")).toBe("a: name");
  });
});

describe("isAppAddressableSlug", () => {
  it("accepts a short ASCII slug, including hyphen and underscore", () => {
    expect(isAppAddressableSlug("a")).toBe(true);
    expect(isAppAddressableSlug("name")).toBe(true);
    expect(isAppAddressableSlug("a-b_c")).toBe(true);
    expect(isAppAddressableSlug("A1")).toBe(true);
  });

  it("accepts 64 characters and rejects 65", () => {
    expect(isAppAddressableSlug("a" + "b".repeat(63))).toBe(true);
    expect(isAppAddressableSlug("a" + "b".repeat(64))).toBe(false);
  });

  it("rejects the shapes that are not this app's own slugs", () => {
    expect(isAppAddressableSlug("")).toBe(false);
    expect(isAppAddressableSlug(" name")).toBe(false);
    expect(isAppAddressableSlug("9abc")).toBe(false);
    expect(isAppAddressableSlug("a:name")).toBe(false);
    expect(isAppAddressableSlug("owl:sameAs")).toBe(false);
    expect(isAppAddressableSlug("role:source")).toBe(false);
    expect(isAppAddressableSlug("http://example.test/a")).toBe(false);
    expect(isAppAddressableSlug("Å")).toBe(false);
    expect(isAppAddressableSlug("name ")).toBe(false);
  });
});
