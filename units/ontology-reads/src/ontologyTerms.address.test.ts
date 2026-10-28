// @vitest-environment node
// One address rule for a term, the dereference of a ref that is a store id, and the is-a walk. Ported from ontologyAddress.test.ts (the
// `ontologyRefIri`, `fetchTermAtRef` and `fetchParentChain` blocks; the `loadOntologyFocus` block is not taken). The module-level term cache
// outlives a test, so each test empties it with the test seam `__resetOntologyTermsForTest`, which stands in for the app's
// `invalidateOntologyTermCache` (not taken).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTermOrigin, resetTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { defaultTermIri } from "./ontologyBrowse";
import { __resetOntologyTermsForTest, fetchParentChain, fetchTermAtRef, looksLikeStoreId, ontologyRefIri } from "./ontologyTerms";

/** GET https://ontology.platform.example.test/base/e/3ehvnp0kqwha — 200 (entity plane: BARE keys, CURIE refs). */
const CHAIR_ENTITY = {
  "@context": "https://ontology.platform.example.test/base/context.jsonld",
  "@id": "https://ontology.platform.example.test/base/e/3ehvnp0kqwha",
  "@type": "t:Type",
  label: "Chair",
  does: "A FURNISHING THAT BEARS THE LOAD OF ONE SEATED PERSON — a movable support with a seat at sitting height, holding a single sitter so an activity can happen in a space.",
  subTypeOf: { "@id": "base:e/7s3t4nmegdc5" },
  typeUri: "https://ontology.platform.example.test/base/t/Chair",
  nodeKind: "type",
  ontologyStatus: "Suggested",
  module: "planguage-core",
  tag: "type-chair",
  authoredBy: { "@id": "base:p/veda-system" },
};

/** GET https://ontology.platform.example.test/base/t/Chair — 200 (type plane: `a:` keys, ABSOLUTE refs). */
const CHAIR_TYPE = {
  "@id": "https://ontology.platform.example.test/base/t/Chair",
  "a:label": "Chair",
  "a:does": CHAIR_ENTITY.does,
  "a:subTypeOf": { "@id": "https://ontology.platform.example.test/base/t/Furnishing" },
  "a:typeUri": "https://ontology.platform.example.test/base/t/Chair",
  "a:nodeKind": "type",
  "a:ontologyStatus": "Suggested",
  "a:module": "planguage-core",
};

/** GET https://ontology.platform.example.test/base/t/Furnishing — 200. The is-a parent, reached via the CURIE. */
const FURNISHING_ENTITY = {
  "@id": "https://ontology.platform.example.test/base/e/7s3t4nmegdc5",
  label: "Furnishing",
  does: "A MOVABLE ARTICLE THAT EQUIPS A SPACE FOR HUMAN USE.",
  typeUri: "https://ontology.platform.example.test/base/t/Furnishing",
  nodeKind: "type",
  ontologyStatus: "Suggested",
};

/** GET https://ontology.platform.example.test/base/t/3ehvnp0kqwha — 404. Verbatim body. */
const NOT_FOUND_BODY = {
  error: "NotFound",
  message: "No resource at https://ontology.platform.example.test/base/t/3ehvnp0kqwha",
};

/** The live route table, keyed by the address WITHOUT any cache-buster query. */
const ROUTES: Record<string, unknown> = {
  "https://ontology.platform.example.test/base/e/3ehvnp0kqwha": CHAIR_ENTITY,
  "https://ontology.platform.example.test/base/t/Chair": CHAIR_TYPE,
  "https://ontology.platform.example.test/base/e/7s3t4nmegdc5": FURNISHING_ENTITY,
  "https://ontology.platform.example.test/base/t/Furnishing": {
    ...CHAIR_TYPE,
    "@id": "https://ontology.platform.example.test/base/t/Furnishing",
    "a:label": "Furnishing",
    "a:does": FURNISHING_ENTITY.does,
    "a:subTypeOf": undefined,
  },
};

/** Every address the client asks for, in order — the record network panel would show. */
let asked: string[] = [];

function installWire() {
  asked = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      asked.push(url);
      const bare = url.split("?")[0];
      const body = ROUTES[bare];
      if (body === undefined) {
        // Mirrors the real server, including the 404 for /base/t/<store id>.
        return new Response(JSON.stringify(NOT_FOUND_BODY), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  installWire();
  // The module-level term cache outlives a test; clear the addresses these tests touch.
  __resetOntologyTermsForTest();
  setTermOrigin("https://ontology.platform.example.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
});

// ── 1. the address rule ──────────────────────────────────────────────────────────────────────

describe("ontologyRefIri — one address rule, both panes", () => {
  it("🔴 a RAW STORE ID resolves to the ENTITY plane, never to /base/t/<id> (the measured 404)", () => {
    expect(ontologyRefIri("3ehvnp0kqwha")).toBe("https://ontology.platform.example.test/base/e/3ehvnp0kqwha");
    // The exact address that 404s on the live server must never be constructed from a store id.
    expect(ontologyRefIri("3ehvnp0kqwha")).not.toBe("https://ontology.platform.example.test/base/t/3ehvnp0kqwha");
  });

  it("a TYPE NAME still resolves to the type plane — unchanged behaviour for every normal term", () => {
    expect(ontologyRefIri("Chair")).toBe("https://ontology.platform.example.test/base/t/Chair");
    expect(ontologyRefIri("HighChair")).toBe("https://ontology.platform.example.test/base/t/HighChair");
    // Identical to the old helper for every name — this is what proves the change is additive.
    for (const n of ["Chair", "HighChair", "Thing", "Person"]) {
      expect(ontologyRefIri(n)).toBe(defaultTermIri(n));
    }
  });

  it("🔴 the three corpus names that LOOK like ids are still TYPE names (measured, not guessed)", () => {
    // Measured 2026-08-20 against public/ontology-neighbourhood.json — 15,906 names, of which
    // exactly 7 do not start uppercase. A naive "starts with a digit" or "is lowercase" rule
    // would send these to the wrong plane and break terms that work today.
    expect(ontologyRefIri("3DModelling")).toBe("https://ontology.platform.example.test/base/t/3DModelling");
    expect(ontologyRefIri("5SMethodology")).toBe("https://ontology.platform.example.test/base/t/5SMethodology");
    expect(ontologyRefIri("improvement")).toBe("https://ontology.platform.example.test/base/t/improvement");
    expect(looksLikeStoreId("improvement")).toBe(false);
    expect(looksLikeStoreId("3DModelling")).toBe(false);
  });

  it("expands a CURIE ref and passes an absolute IRI through untouched", () => {
    expect(ontologyRefIri("base:e/7s3t4nmegdc5")).toBe("https://ontology.platform.example.test/base/e/7s3t4nmegdc5");
    expect(ontologyRefIri("base:t/Chair")).toBe("https://ontology.platform.example.test/base/t/Chair");
    expect(ontologyRefIri("https://ontology.platform.example.test/base/t/Chair")).toBe(
      "https://ontology.platform.example.test/base/t/Chair",
    );
  });

  it("recognises a UUID principal-shaped id as a store id, not a term name", () => {
    expect(looksLikeStoreId("637ffd5c-9add-4a13-a346-a33149f77907")).toBe(true);
    expect(looksLikeStoreId("3ehvnp0kqwha")).toBe(true);
  });
});

// ── 2. CONTENT — the pane must render the real definition, not merely stop erroring ───────────

describe("fetchTermAtRef — ?oc=<store id> yields the ACTUAL term, with content", () => {
  it("🔴 resolves 3ehvnp0kqwha to Chair AND carries its real definition text", async () => {
    const doc = await fetchTermAtRef("3ehvnp0kqwha");
    expect(doc).not.toBeNull();
    // ⚠ An empty-but-calm pane is the failure mode this cycle has hit ~14 times. Assert CONTENT.
    expect(doc!.label).toBe("Chair");
    expect(doc!.does).toContain("BEARS THE LOAD OF ONE SEATED PERSON");
    expect(doc!.does.length).toBeGreaterThan(80);
    expect(doc!.status).toBe("Suggested");
  });

  it("🔴 adopts the CANONICAL type identity, so the raw id stops leaking into ?oc=", async () => {
    const doc = await fetchTermAtRef("3ehvnp0kqwha");
    // The entity doc carries `typeUri` — the canonical slug. Use it, so every downstream
    // write/cache/link path operates on `Chair` exactly as it does for a normally-reached term.
    expect(doc!.term).toBe("https://ontology.platform.example.test/base/t/Chair");
    expect(doc!.name).toBe("Chair");
  });

  it("🔴 the parent survives and is OPENABLE — this is what fills TYPES/FUNCTIONS/VALUES", async () => {
    const doc = await fetchTermAtRef("3ehvnp0kqwha");
    // Resolving the store id reaches the PUBLISHED term, whose `a:subTypeOf` is already absolute,
    // so the parent lands on the openable term plane rather than a store location.
    expect(doc!.parentTerm).toBe("https://ontology.platform.example.test/base/t/Furnishing");
    expect(doc!.unresolvedRef).toBeNull();
  });

  it("🔴 a CURIE-only parent is EXPANDED, not dropped (guards refIdOf directly)", async () => {
    // An entity-plane node with no published `typeUri`: the only route to its parent is the
    // CURIE. refIdOf used to `return null` for anything not starting with `http`, so this
    // parent vanished and the columns rendered "No connected …".
    ROUTES["https://ontology.platform.example.test/base/e/zz9tqp7k2m4x"] = {
      "@id": "https://ontology.platform.example.test/base/e/zz9tqp7k2m4x",
      label: "Stool",
      does: "A SEAT WITHOUT A BACK.",
      subTypeOf: { "@id": "base:e/7s3t4nmegdc5" },
      nodeKind: "type",
    };
    const doc = await fetchTermAtRef("zz9tqp7k2m4x");
    expect(doc!.label).toBe("Stool");
    expect(doc!.parentTerm).toBe("https://ontology.platform.example.test/base/e/7s3t4nmegdc5");
  });

  it("asks the entity plane FIRST for a store id — never the address that 404s", async () => {
    await fetchTermAtRef("3ehvnp0kqwha");
    expect(asked.some((u) => u.startsWith("https://ontology.platform.example.test/base/e/3ehvnp0kqwha"))).toBe(true);
    expect(asked.some((u) => u.split("?")[0] === "https://ontology.platform.example.test/base/t/3ehvnp0kqwha")).toBe(
      false,
    );
  });

  it("a normal type name is unaffected — still one request, still the type plane", async () => {
    const doc = await fetchTermAtRef("Chair");
    expect(doc!.label).toBe("Chair");
    expect(doc!.term).toBe("https://ontology.platform.example.test/base/t/Chair");
    expect(asked.every((u) => !u.includes("/base/e/"))).toBe(true);
  });
});

// ── 3. the focused neighbourhood, end to end on the shipped loader ────────────────────────────

// ── the SECOND cause of "No connected …", found by acceptance and pre-existing ───────────────

describe("fetchParentChain — the is-a walk must survive past the first hop", () => {
  it("🔴 walks Chair → Furnishing → Artifact; it used to stop dead at the leaf", async () => {
    ROUTES["https://ontology.platform.example.test/base/t/Artifact"] = {
      "@id": "https://ontology.platform.example.test/base/t/Artifact",
      "a:label": "Artifact",
      "a:does": "A THING MADE BY SOMEONE.",
      "a:nodeKind": "type",
    };
    ROUTES["https://ontology.platform.example.test/base/t/Furnishing"] = {
      "@id": "https://ontology.platform.example.test/base/t/Furnishing",
      "a:label": "Furnishing",
      "a:does": FURNISHING_ENTITY.does,
      "a:subTypeOf": { "@id": "https://ontology.platform.example.test/base/t/Artifact" },
      "a:nodeKind": "type",
    };
    const chain = await fetchParentChain("https://ontology.platform.example.test/base/t/Chair", {
      sameKindOnly: false,
    });
    // Root→leaf. Measured on the LIVE master before this fix: ["Chair"] — one element, always.
    expect(chain.map((d) => d.name)).toEqual(["Artifact", "Furnishing", "Chair"]);
  });

  it("⛔ still terminates on a real cycle — the guard is repaired, not removed", async () => {
    // A ↔ B mutual subTypeOf. Without a live cycle guard this loops until PARENT_CHAIN_MAX.
    ROUTES["https://ontology.platform.example.test/base/t/CycleA"] = {
      "@id": "https://ontology.platform.example.test/base/t/CycleA",
      "a:label": "CycleA",
      "a:subTypeOf": { "@id": "https://ontology.platform.example.test/base/t/CycleB" },
      "a:nodeKind": "type",
    };
    ROUTES["https://ontology.platform.example.test/base/t/CycleB"] = {
      "@id": "https://ontology.platform.example.test/base/t/CycleB",
      "a:label": "CycleB",
      "a:subTypeOf": { "@id": "https://ontology.platform.example.test/base/t/CycleA" },
      "a:nodeKind": "type",
    };
    const chain = await fetchParentChain("https://ontology.platform.example.test/base/t/CycleA", {
      sameKindOnly: false,
    });
    expect(chain.map((d) => d.name)).toEqual(["CycleB", "CycleA"]);
  });
});
