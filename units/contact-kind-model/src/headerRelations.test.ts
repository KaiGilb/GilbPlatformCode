// The relation chips of the shared contact header, as data (`headerRelations.ts`): not words made up for the predicates, but the actual
// predicate used from the ontology. Every expected word below is READ from the fixture of the master (anonymous GETs of the ontology host,
// 2026-10-19: the user-plane vocabulary, the RelationshipKind entries, the kindPredicate term entities), ⛔ never
// typed as a list the code could share.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import fixture from "../test/relationsMaster.json";
import { catalogFromGraph, type LinkPlaneCatalog } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { edgesToVault, headerRelations, type HeaderRelationsInput } from "./headerRelations";
import type { ContactChip } from "./contactKindModel";

type Doc = Record<string, unknown>;
const GRAPH = (fixture.vocab["@graph"] as Doc[]).map((t) => ({ ...t }));
const ENTRIES = fixture.entries as Record<string, Doc>;
const TERMS = fixture.terms as Record<string, Doc>;
const entry = (word: string): Doc => Object.values(ENTRIES).find((e) => e["label"] === word)!;
const termByCurie = (curie: string): Doc => GRAPH.find((t) => t["a:typeAttribute"] === curie)!;
const termEntityOf = (ref: string): Doc => TERMS[ref.replace(/^base:e\//, "https://ontology.example.test/base/e/")]!;
const refOf = (e: Doc): string | null => ((e["kindPredicate"] as { "@id": string } | undefined)?.["@id"] ?? null);

const catalog = (graph: Doc[] = GRAPH): LinkPlaneCatalog => catalogFromGraph(graph, "user");

const RECORD = "https://ann.example.test/base/e/06gkada000000000000000000";
const VAULT_ENTITY = "https://ann.example.test/base/e/vault-ann";
const OTHER = "https://ann.example.test/base/e/someone-else";

const chipOf = (e: Doc, axis: ContactChip["axis"] = "relationshipKind"): ContactChip => ({
  key: `claim-${String(e["@id"])}`,
  axis,
  entryId: String(e["@id"]),
  label: String(e["label"]),
  tone: "neutral",
});
const OWN_BOOK_CLUB: ContactChip = { key: "claim-own", axis: "relationshipKind", entryId: "https://ann.example.test/base/e/own-kind-book-club", label: "Book club", tone: "neutral" };

/** The input as the reader hands it, built from the fixture: each entry's predicate reference and each reference's CURIE as the master serves them. */
function input(chips: ContactChip[], over: Partial<HeaderRelationsInput> = {}): HeaderRelationsInput {
  const entryPredicates = new Map<string, string | null>();
  const predicateCuries = new Map<string, string | null>();
  for (const c of chips) {
    const e = ENTRIES[c.entryId];
    const ref = e ? refOf(e) : null;
    entryPredicates.set(c.entryId, ref);
    if (ref) predicateCuries.set(ref, String(termEntityOf(ref)["typeAttribute"]));
  }
  return { kindChips: chips, entryPredicates, predicateCuries, catalog: catalog(), catalogFailed: false, edges: [], contactName: "Ben Lund", holderName: "Ann Berg", ...over };
}

describe("kind labels mapped through the entry's kind predicate show the predicate by its GilbVeda label", () => {
  test("Customer and Colleague: the terms' own labels as served, in the card's order; the holder's own kind dashed, last", () => {
    const customer = entry("Customer");
    const colleague = entry("Colleague");
    const rels = headerRelations(input([chipOf(colleague), chipOf(customer), OWN_BOOK_CLUB]));
    const customerCurie = String(termEntityOf(refOf(customer)!)["typeAttribute"]);
    const colleagueCurie = String(termEntityOf(refOf(colleague)!)["typeAttribute"]);
    expect(rels.map((r) => [r.text, r.kind, r.curie])).toEqual([
      [termByCurie(colleagueCurie)["a:label"], "predicate", colleagueCurie],
      [termByCurie(customerCurie)["a:label"], "predicate", customerCurie],
      ["Book club", "own", null],
    ]);
    // the chip's word is the TERM's label, ⛔ not the entry's word ("Customer")
    expect(rels[1]!.text).not.toBe(customer["label"]);
    expect(rels[1]!.title).toBe(`Ben Lund ${String(termByCurie(customerCurie)["a:label"])} Ann Berg · GilbVeda ${customerCurie} · private, grants nothing`);
    expect(rels[2]!.title).toMatch(/your own label for Ben Lund\. Not a GilbVeda relation/);
  });
  test("a predicate MINTED Suggested on 2026-10-17 (customer-of) shows its label as the master serves it", () => {
    const customer = entry("Customer");
    const curie = String(termEntityOf(refOf(customer)!)["typeAttribute"]);
    expect(termByCurie(curie)["a:ontologyStatus"]).toBe("Suggested");
    expect(headerRelations(input([chipOf(customer)]))[0]).toMatchObject({ text: termByCurie(curie)["a:label"], kind: "predicate", curie });
  });
  test("a master kind that names NO predicate (Competitor) is a label, dashed, ⛔ not a GilbVeda relation", () => {
    const competitor = entry("Competitor");
    expect(refOf(competitor)).toBeNull();
    expect(headerRelations(input([chipOf(competitor)]))).toMatchObject([{ text: "Competitor", kind: "own", curie: null }]);
  });
  test("a term with no a:label is shown by its own NAME, its CURIE (mono look), ⛔ never a made-up word", () => {
    const advisor = entry("Advisor");
    const curie = String(termEntityOf(refOf(advisor)!)["typeAttribute"]);
    const graph = GRAPH.map((t) => (t["a:typeAttribute"] === curie ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== "a:label")) : t));
    const [chip] = headerRelations(input([chipOf(advisor)], { catalog: catalog(graph) }));
    expect(chip).toMatchObject({ text: curie, kind: "term-name", curie });
    expect(chip!.title).toBe(`GilbVeda ${curie} has no label yet; its own name is shown`);
  });
  test("a predicate minted tomorrow shows with NO app change: a new term in the vocabulary and an entry naming it", () => {
    // A term that is NOT on the master (`t:x`, the repo's adjudicated unknown-by-construction fixture), labelled "mentor-of" here.
    const graph = [...GRAPH, { "@id": "https://ontology.example.test/base/t/x", "a:typeAttribute": "t:x", "a:label": "mentor-of", "a:linkPlane": "user" }];
    const mentor: ContactChip = { key: "c-m", axis: "relationshipKind", entryId: "https://ontology.example.test/base/e/relationship-kind-mentor", label: "Mentor", tone: "neutral" };
    const rels = headerRelations({
      ...input([]),
      kindChips: [mentor],
      entryPredicates: new Map([[mentor.entryId, "base:e/term-mentor-of"]]),
      predicateCuries: new Map([["base:e/term-mentor-of", "t:x"]]),
      catalog: catalog(graph),
    });
    expect(rels).toMatchObject([{ text: "mentor-of", kind: "predicate", curie: "t:x" }]);
  });
  test("the vocabulary could not be read: each predicate by its CURIE, said in the hover", () => {
    const customer = entry("Customer");
    const curie = String(termEntityOf(refOf(customer)!)["typeAttribute"]);
    const [chip] = headerRelations(input([chipOf(customer)], { catalog: null, catalogFailed: true }));
    expect(chip).toMatchObject({ text: curie, kind: "term-name" });
    expect(chip!.title).toMatch(/vocabulary could not be read/);
  });
  test("still reading (the chip's words, its predicate, the term or the vocabulary): left out, ⛔ never a placeholder", () => {
    const customer = entry("Customer");
    const ref = refOf(customer)!;
    expect(headerRelations(input([{ ...chipOf(customer), label: "…" }]))).toEqual([]);
    expect(headerRelations({ ...input([chipOf(customer)]), entryPredicates: new Map([[String(customer["@id"]), undefined]]) })).toEqual([]);
    expect(headerRelations({ ...input([chipOf(customer)]), predicateCuries: new Map([[ref, undefined]]) })).toEqual([]);
    expect(headerRelations(input([chipOf(customer)], { catalog: null, catalogFailed: false }))).toEqual([]);
    // the holder's own label needs no vocabulary
    expect(headerRelations(input([OWN_BOOK_CLUB], { catalog: null }))).toHaveLength(1);
  });
  test("a circle label (the circle-label axis) is not a relation: not drawn in the header", () => {
    expect(headerRelations(input([{ ...OWN_BOOK_CLUB, axis: "circleLabel", label: "Inner circle" }]))).toEqual([]);
  });
  test("two kinds naming the same predicate are ONE chip", () => {
    const customer = entry("Customer");
    const twice = { ...chipOf(customer), key: "second", entryId: "https://ann.example.test/base/e/own-kind-customer" };
    const inp = input([chipOf(customer)]);
    (inp.entryPredicates as Map<string, string | null>).set(twice.entryId, refOf(customer));
    expect(headerRelations({ ...inp, kindChips: [chipOf(customer), twice] })).toHaveLength(1);
  });
});

describe("relation edges between the record and the seen-from vault", () => {
  const rel = (type: string, source: string, target: string): RecordRelation => ({
    relation: `https://ann.example.test/base/r/${type}-${source.slice(-4)}`,
    role: "role:source",
    type,
    members: [
      { member: source, role: "role:source" },
      { member: target, role: "role:target" },
    ],
  });
  const curieOf = (word: string) => String(termEntityOf(refOf(entry(word))!)["typeAttribute"]);
  test("contact -> vault with a user-plane predicate is kept; the same predicate as a kind is ONE chip", () => {
    const customer = curieOf("Customer");
    const edges = edgesToVault([rel(customer, RECORD, VAULT_ENTITY)], RECORD, VAULT_ENTITY, catalog());
    expect(edges).toEqual([customer]);
    expect(headerRelations(input([chipOf(entry("Customer"))], { edges })).map((r) => r.curie)).toEqual([customer]);
  });
  test("a symmetric predicate (friend-of) counts either way round; an edge with no kind still shows, by its label", () => {
    const friend = curieOf("Friend");
    expect(termByCurie(friend)["a:symmetric"]).toBe(true);
    const edges = edgesToVault([rel(friend, VAULT_ENTITY, RECORD)], RECORD, VAULT_ENTITY, catalog());
    expect(edges).toEqual([friend]);
    expect(headerRelations(input([], { edges }))).toMatchObject([{ text: termByCurie(friend)["a:label"], kind: "predicate" }]);
  });
  test("a DIRECTED predicate from the vault to the contact is not drawn (its label would read the wrong way)", () => {
    const customer = curieOf("Customer");
    expect(termByCurie(customer)["a:directed"]).toBe(true);
    expect(edgesToVault([rel(customer, VAULT_ENTITY, RECORD)], RECORD, VAULT_ENTITY, catalog())).toEqual([]);
  });
  test("not the vault, not a user-plane predicate, or a row the caller may not read (no members/type): not drawn", () => {
    const customer = curieOf("Customer");
    expect(edgesToVault([rel(customer, RECORD, OTHER)], RECORD, VAULT_ENTITY, catalog())).toEqual([]);
    expect(edgesToVault([rel("t:MemberOf", RECORD, VAULT_ENTITY)], RECORD, VAULT_ENTITY, catalog())).toEqual([]);
    expect(edgesToVault([{ relation: "https://ann.example.test/base/r/x", role: "role:source" }], RECORD, VAULT_ENTITY, catalog())).toEqual([]);
  });
  test("two spellings of the same entity (host case, trailing slash) are the same end", () => {
    const customer = curieOf("Customer");
    expect(edgesToVault([rel(customer, RECORD.replace("ann.example.test", "ANN.example.test"), `${VAULT_ENTITY}/`)], RECORD, VAULT_ENTITY, catalog())).toEqual([customer]);
  });
});

describe("no app word list", () => {
  test("no predicate's label or CURIE is written in the code", () => {
    const src = ["./headerRelations.ts"]
      .map((p) => readFileSync(new URL(p, import.meta.url), "utf8"))
      .join("\n")
      // the file headers name examples in prose; only code lines count
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join("\n");
    for (const t of GRAPH) {
      expect(src).not.toContain(`"${String(t["a:label"])}"`);
      expect(src).not.toContain(`"${String(t["a:typeAttribute"])}"`);
    }
  });
});
