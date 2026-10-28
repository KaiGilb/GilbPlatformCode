import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setCatalogForTest, catalogFromGraph, readUserLinkPlaneCatalog, type LinkPlaneCatalog } from "./linkPlaneCatalog";
import { setUp, tearDown } from "../test/support";

// `childrenOf` and `termByCurie` of the app's file are one-line readers of a catalogue that no Plan-card reader reaches; they are not
// taken, so the cases that use them read the catalogue the same way here.
const childrenOf = (catalog: LinkPlaneCatalog, parentCurie: string) =>
  catalog.terms.filter((t) => t.parentCurie === parentCurie && t.curie !== parentCurie);
const termByCurie = (catalog: LinkPlaneCatalog, curie: string) => catalog.terms.find((t) => t.curie === curie);

beforeEach(() => {
  setUp();
});
afterEach(() => {
  __setCatalogForTest(null);
  tearDown();
});

const RELATION = "https://ontology.example.test/base/t/Relation";
const CONNECTED = "https://ontology.example.test/base/t/ConnectedTo";

function term(
  tail: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    "@id": `https://ontology.example.test/base/t/${tail}`,
    "a:label": extra["a:label"] ?? tail,
    "a:linkPlane": extra["a:linkPlane"] ?? "user",
    "a:subTypeOf": extra["a:subTypeOf"] ?? { "@id": RELATION },
    ...extra,
  };
}

const GRAPH = [
  term("ConnectedTo", {
    "a:label": "connected-to",
    "a:typeAttribute": "t:ConnectedTo",
    "a:symmetric": true,
  }),
  term("PartOf", {
    "a:label": "part-of",
    "a:typeAttribute": "t:PartOf",
    "a:symmetric": false,
  }),
  term("About", {
    "a:label": "about",
    "a:typeAttribute": "t:About",
    "a:symmetric": false,
  }),
  term("AlignsWith", {
    "a:label": "aligns-with",
    "a:symmetric": true,
  }),
  term("MemberOf", {
    "a:label": "member-of",
    "a:directed": true,
    "a:symmetric": false,
  }),
  term("FriendOf", {
    "a:label": "friend-of",
    "a:typeAttribute": "t:FriendOf",
    "a:subTypeOf": { "@id": CONNECTED },
    "a:directed": false,
    "a:symmetric": true,
  }),
  term("OwnedBy", {
    "a:label": "owned-by",
    "a:typeAttribute": "t:OwnedBy",
    "a:subTypeOf": { "@id": CONNECTED },
    "a:directed": true,
    "a:symmetric": false,
  }),
  term("IsA", {
    "a:label": "is-a",
    "a:linkPlane": "classification",
  }),
  term("HandsOffTo", {
    "a:label": "hands-off-to",
    "a:linkPlane": "process",
    "a:subTypeOf": { "@id": CONNECTED },
  }),
  term("VaultReaderGrant", {
    "a:label": "Vault Reader Grant",
    "a:linkPlane": "grant",
  }),
];

describe("catalogFromGraph — live user-plane tree", () => {
  const cat = catalogFromGraph(GRAPH, "user");

  it("Level 1 is only user-plane roots (parent Relation)", () => {
    expect(cat.roots.map((r) => r.label).sort()).toEqual([
      "about",
      "aligns-with",
      "connected-to",
      "member-of",
      "part-of",
    ]);
  });

  it("⛔ excludes is-a, process, grant", () => {
    const labels = cat.terms.map((t) => t.label);
    expect(labels).not.toContain("is-a");
    expect(labels).not.toContain("hands-off-to");
    expect(labels).not.toContain("Vault Reader Grant");
  });

  it("Level 2 of connected-to includes friend-of and owned-by", () => {
    const kids = childrenOf(cat, "t:ConnectedTo").map((t) => t.curie).sort();
    expect(kids).toEqual(["t:FriendOf", "t:OwnedBy"]);
  });

  it("user can stop on the root — ConnectedTo is itself a writable term", () => {
    expect(termByCurie(cat, "t:ConnectedTo")?.curie).toBe("t:ConnectedTo");
  });

  it("derives t:AlignsWith when a:typeAttribute is missing", () => {
    expect(termByCurie(cat, "t:AlignsWith")?.label).toBe("aligns-with");
  });

  it("reads directed / symmetric from the term, not a hardcoded set", () => {
    expect(termByCurie(cat, "t:FriendOf")?.symmetric).toBe(true);
    expect(termByCurie(cat, "t:FriendOf")?.directed).toBe(false);
    expect(termByCurie(cat, "t:OwnedBy")?.directed).toBe(true);
    expect(termByCurie(cat, "t:PartOf")?.directed).toBe(true);
    expect(termByCurie(cat, "t:ConnectedTo")?.directed).toBe(false);
  });

  it("refuse-board phrases are not terms", () => {
    for (const bad of ["washed", "easy-to-use", "speaks", "wrecked", "t:Washed"]) {
      expect(termByCurie(cat, bad)).toBeUndefined();
    }
  });
});

describe("__setCatalogForTest clears the in-flight read (VATester F8)", () => {
  // ⚠ MY FIRST ATTEMPT AT THIS TEST COULD NOT FAIL, because the rationale it was written
  // from was wrong (see the corrected comment on `__setCatalogForTest`). The cache is
  // checked BEFORE `inFlight`, so injecting a non-null catalog always wins and clearing
  // `inFlight` changes nothing. The line only matters on the NULL injection, where the
  // cache guard stops firing and the stale promise is returned instead of a fresh read.
  it("after injecting null, the next read starts FRESH instead of reusing a stale promise", async () => {
    __setCatalogForTest(null);
    const realFetch = globalThis.fetch;
    let releaseStale: (v: Response) => void = () => {};
    // Read 1: a fetch that never settles, so `inFlight` is left set.
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        releaseStale = resolve;
      })) as typeof fetch;
    try {
      const stale = readUserLinkPlaneCatalog();

      // "Forget everything" — the caller's stated intent.
      __setCatalogForTest(null);

      // Read 2: a fetch that answers immediately with a real catalog. Only reachable if
      // the stale promise was dropped; otherwise read 2 IS read 1 and never settles.
      globalThis.fetch = (async () => ({
        ok: true,
        json: async () => ({ "@graph": GRAPH }),
      })) as unknown as typeof fetch;

      const fresh = await Promise.race([
        readUserLinkPlaneCatalog(),
        new Promise<"stale-promise-reused">((r) =>
          setTimeout(() => r("stale-promise-reused"), 250),
        ),
      ]);
      expect(fresh).not.toBe("stale-promise-reused");
      expect((fresh as LinkPlaneCatalog).terms.length).toBeGreaterThan(0);

      releaseStale({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
      await stale.catch(() => undefined);
    } finally {
      globalThis.fetch = realFetch;
      __setCatalogForTest(null);
    }
  });
});
