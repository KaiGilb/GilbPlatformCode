import { expect, test } from "vitest";
import { childrenOf, type LinkPlaneCatalog, type LinkTerm } from "./catalog";
import { catalogDepth, descendantsOf, genderedLabel, reverseReading, subtreeDepth } from "./predicateTree";

function term(curie: string, parent: string | null, extra: Partial<LinkTerm> = {}): LinkTerm {
  return {
    iri: curie,
    curie,
    label: curie,
    parentIri: parent,
    parentCurie: parent,
    plane: "user",
    directed: true,
    symmetric: false,
    typeAttribute: null,
    does: null,
    transitive: false,
    inverseOfCurie: null,
    inverseLabel: null,
    composesTo: [],
    genderedLabel: null,
    ...extra,
  };
}

function catalog(terms: LinkTerm[], roots: readonly LinkTerm[] = []): LinkPlaneCatalog {
  return { plane: "user", terms, roots, stale: false, excludedUnwritable: [] };
}

test("depth follows the catalogue, it is not stuck at four", () => {
  const terms = [
    term("a", null),
    term("b", "a"),
    term("c", "b"),
    term("d", "c"),
    term("e", "d"),
    term("f", "e"),
  ];
  const root = terms[0];
  if (!root) throw new Error("chain has no root");
  const cat = catalog(terms, [root]);
  expect(subtreeDepth(cat, "a")).toBe(6);
  expect(catalogDepth(cat)).toBe(6);
  expect(descendantsOf(cat, "a").map((t) => t.curie)).toEqual(["b", "c", "d", "e", "f"]);
});

test("a loop does not walk forever", () => {
  const cat = catalog([term("a", "b"), term("b", "a")]);
  expect(descendantsOf(cat, "a").map((t) => t.curie)).toEqual(["b"]);
  expect(childrenOf(cat, "a").map((t) => t.curie)).toEqual(["b"]);
});

test("no reverse words means silence, not a guessed phrase", () => {
  const cat = catalog([term("t:BrotherOf", null)]);
  expect(reverseReading(cat, "t:BrotherOf")).toBeNull();
});

test("an unknown gender token is not coerced", () => {
  const cat = catalog([term("t:ChildOf", null, { genderedLabel: "female=daughter|male=son" })]);
  expect(genderedLabel(cat, "t:ChildOf", "female")).toBe("daughter");
  expect(genderedLabel(cat, "t:ChildOf", "other")).toBeNull();
  expect(genderedLabel(cat, "t:ChildOf", null)).toBeNull();
});
