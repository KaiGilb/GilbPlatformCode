import { describe, expect, it } from "vitest";
import {
  childrenPointingAt,
  entityRefFromFact,
  entityRefsOf,
  findEntityRefPairs,
  missingEntityRefTargets,
  refDisplayName,
} from "./entityRef";

const PARENT = {
  id: "osm-r-59470",
  entityUri: "https://example.test/base/e/osm-r-59470",
  facts: { label: "Paraguay", termLabel: "Paraguay" },
};

const CHILD = {
  id: "osm-r-123",
  entityUri: "https://example.test/base/e/osm-r-123",
  facts: {
    termLabel: "Sarandi",
    "member-of": "https://example.test/base/e/osm-r-59470",
  },
};

describe("entityRefFromFact", () => {
  it("keeps the segment it was given and decodes the id", () => {
    expect(entityRefFromFact("https://example.test/base/e/osm-r-59470")).toEqual({
      uri: "https://example.test/base/e/osm-r-59470",
      id: "osm-r-59470",
    });
    expect(entityRefFromFact("https://example.test/vault/e/a%20b?x=1")).toEqual({
      uri: "https://example.test/vault/e/a b",
      id: "a b",
    });
  });

  it("rejects a type address, a bare word, and blank", () => {
    expect(entityRefFromFact("https://example.test/base/t/GeoRegion")).toBeNull();
    expect(entityRefFromFact("Sarandi")).toBeNull();
    expect(entityRefFromFact("  ")).toBeNull();
    expect(entityRefFromFact(null)).toBeNull();
    expect(entityRefFromFact(undefined)).toBeNull();
  });

  it("throws on a broken percent-encoding instead of returning null", () => {
    expect(() => entityRefFromFact("https://example.test/base/e/%")).toThrow(URIError);
  });

  it("drops anything after the id", () => {
    expect(entityRefFromFact("https://example.test/base/e/abc/extra")).toEqual({
      uri: "https://example.test/base/e/abc",
      id: "abc",
    });
  });
});

describe("entityRefsOf", () => {
  it("skips only the names the caller passes", () => {
    const record = {
      facts: {
        claimSubject: "https://example.test/base/e/person",
        "member-of": "https://example.test/base/e/parent",
      },
    };
    expect(entityRefsOf(record).map((r) => r.slug)).toEqual(["claimSubject", "member-of"]);
    expect(entityRefsOf(record, new Set(["claimSubject"])).map((r) => r.slug)).toEqual(["member-of"]);
  });
});

describe("findEntityRefPairs", () => {
  it("draws child to parent when both are in the set", () => {
    expect(findEntityRefPairs([CHILD, PARENT])).toEqual([
      { sourceId: "osm-r-123", targetId: "osm-r-59470", slug: "member-of" },
    ]);
  });

  it("does not invent an edge when the parent is missing", () => {
    expect(findEntityRefPairs([CHILD])).toEqual([]);
  });
});

describe("missingEntityRefTargets", () => {
  it("names the parent that is not in the set", () => {
    expect(missingEntityRefTargets([CHILD])).toEqual([
      { id: "osm-r-59470", uri: "https://example.test/base/e/osm-r-59470" },
    ]);
  });

  it("is empty when the parent is already present", () => {
    expect(missingEntityRefTargets([CHILD, PARENT])).toEqual([]);
  });

  it("still returns the first target when cap is 0", () => {
    expect(missingEntityRefTargets([CHILD], 0)).toHaveLength(1);
  });
});

describe("childrenPointingAt and refDisplayName", () => {
  it("lists the child and prefers termLabel over the id", () => {
    const kids = childrenPointingAt(PARENT, [CHILD, PARENT]);
    expect(kids.map((k) => k.id)).toEqual(["osm-r-123"]);
    expect(refDisplayName(CHILD.facts, CHILD.entityUri)).toBe("Sarandi");
  });

  it("says Untitled only when no name fact and no address were given", () => {
    expect(refDisplayName(null, null)).toBe("Untitled");
    expect(refDisplayName({}, "https://example.test/base/e/only-id")).toBe("only-id");
    expect(refDisplayName({ "a:label": "Hidden", label: "" }, null)).toBe("Untitled");
  });
});
