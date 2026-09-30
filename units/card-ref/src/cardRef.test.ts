import { describe, expect, it } from "vitest";
import { hubIdentityKeys, isCardHandleName, isHubRecord, refKeyVariants } from "./cardRef";

const ORIGIN = "https://id.example";

describe("card handle", () => {
  it("matches a prefix only with the colon, and does not trim or fold case", () => {
    expect(isCardHandleName("pfc:phone")).toBe(true);
    expect(isCardHandleName("name-claim:ada")).toBe(true);
    expect(isCardHandleName("connection-decline:1")).toBe(true);
    expect(isCardHandleName("pfc")).toBe(false);
    expect(isCardHandleName("PFC:phone")).toBe(false);
    expect(isCardHandleName(" pfc:phone")).toBe(false);
    expect(isCardHandleName(undefined)).toBe(false);
    expect(isCardHandleName("")).toBe(false);
    expect(isCardHandleName(null)).toBe(false);
  });

  it("treats a missing name as the person row", () => {
    expect(isHubRecord({ facts: { name: "Mona" } })).toBe(true);
    expect(isHubRecord({ facts: {} })).toBe(true);
    expect(isHubRecord({ facts: { name: "pfc:phone" } })).toBe(false);
  });
});

describe("refKeyVariants", () => {
  it("expands base: with the origin the caller passed, and does not trim that origin", () => {
    expect(refKeyVariants("base:p/abc", ORIGIN)).toEqual([
      "base:p/abc",
      "https://id.example/base/p/abc",
    ]);
    expect(refKeyVariants("base:p/abc", "https://id.example/")).toContain(
      "https://id.example//base/p/abc",
    );
  });

  it("adds the host-and-path form and the base:p form of an absolute principal", () => {
    expect(refKeyVariants("https://h.example/base/p/abc", ORIGIN)).toEqual([
      "https://h.example/base/p/abc",
      "h.example/base/p/abc",
      "base:p/abc",
    ]);
  });

  it("treats a path that is /i or ends in /i as an identity page, and keeps the query off the host form", () => {
    expect(refKeyVariants("https://h.example/i/", ORIGIN)).toEqual([
      "https://h.example/i/",
      "h.example/i",
      "https://h.example/i",
    ]);
    expect(refKeyVariants("https://h.example/files/i", ORIGIN)).toContain("h.example/files/i");
    expect(refKeyVariants("https://h.example/base/p/abc?y=1", ORIGIN)).toContain("base:p/abc");
    expect(refKeyVariants("https://h.example/base/p/abc?y=1", ORIGIN)).toContain(
      "h.example/base/p/abc",
    );
  });

  it("keeps only the trimmed text when the address is broken, and returns nothing for blank", () => {
    expect(refKeyVariants("  ", ORIGIN)).toEqual([]);
    expect(refKeyVariants(" https://h example/base ", ORIGIN)).toEqual(["https://h example/base"]);
  });
});

describe("hubIdentityKeys", () => {
  it("lists the entity, the id, and the three identity facts, and repeats a shared spelling", () => {
    const keys = hubIdentityKeys(
      {
        id: "base:p/abc",
        entityUri: "https://h.example/base/e/row",
        facts: {
          name: "Ada",
          claimSubject: "https://h.example/i",
          directReader: "base:p/abc",
        },
      },
      ORIGIN,
    );
    expect(keys).toContain("https://h.example/base/e/row");
    expect(keys).toContain("https://id.example/base/p/abc");
    expect(keys).toContain("h.example/i");
    expect(keys.filter((key) => key === "base:p/abc").length).toBe(2);
  });
});
