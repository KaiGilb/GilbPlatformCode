// The default associated-with tie in the contact header (`headerRelations.ts`): the default is shown by the ontology term's own label
// while no specific kind is there, and hidden beside one (a pick replaces it; if ending it failed, only the specific one is named). A
// holder's own label is not a tie and does not hide it.
// The AssociatedWith term below is the live master's (GET of the term on the ontology host, 2026-10-22): label, CURIE, symmetric.
import { describe, expect, test } from "vitest";
import fixture from "../test/relationsMaster.json";
import { catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { edgesToVault, headerRelations, type HeaderRelationsInput } from "./headerRelations";
import type { ContactChip } from "./contactKindModel";

type Doc = Record<string, unknown>;
const ASSOCIATED_WITH: Doc = {
  "@id": "https://ontology.example.test/base/t/AssociatedWith",
  "a:label": "associated-with",
  "a:linkPlane": "user",
  "a:typeAttribute": "t:AssociatedWith",
  "a:symmetric": true,
  "a:isRelationPredicate": true,
};
const CATALOG = catalogFromGraph([...(fixture.vocab["@graph"] as Doc[]), ASSOCIATED_WITH], "user");
const RECORD = "https://ann.example.test/base/e/06gkada000000000000000000";
const VAULT_ENTITY = "https://ann.example.test/base/e/vault-ann";
const OWN: ContactChip = { key: "claim-own", axis: "relationshipKind", entryId: "https://ann.example.test/base/e/own-kind-book-club", label: "Book club", tone: "neutral" };

const row = (type: string, from = RECORD, to = VAULT_ENTITY, n = 1): RecordRelation => ({
  relation: `https://ann.example.test/base/r/${type}-${n}`,
  role: "role:source",
  type,
  members: [
    { member: from, role: "role:source" },
    { member: to, role: "role:target" },
  ],
});
const input = (rows: RecordRelation[], over: Partial<HeaderRelationsInput> = {}): HeaderRelationsInput => ({
  kindChips: [],
  entryPredicates: new Map(),
  predicateCuries: new Map(),
  catalog: CATALOG,
  catalogFailed: false,
  edges: edgesToVault(rows, RECORD, VAULT_ENTITY, CATALOG),
  contactName: "Ben Lund",
  holderName: "Ann Berg",
  ...over,
});
const texts = (i: HeaderRelationsInput) => headerRelations(i).map((c) => c.text);

describe("the default tie in the header", () => {
  test("alone, it is named by the term's own label: 'associated-with' (⛔ never 'connected-to')", () => {
    const chips = headerRelations(input([row("t:AssociatedWith")]));
    expect(chips).toEqual([expect.objectContaining({ text: "associated-with", kind: "predicate", curie: "t:AssociatedWith" })]);
  });
  test("written from the vault's side it is the same tie (symmetric)", () => {
    expect(texts(input([row("t:AssociatedWith", VAULT_ENTITY, RECORD)]))).toEqual(["associated-with"]);
  });
  test("beside a specific kind's edge it is HIDDEN: only the specific one is named", () => {
    expect(texts(input([row("t:AssociatedWith"), row("t:CustomerOf")]))).toEqual(["customer-of"]);
  });
  test("beside an OLD kind label whose entry names a predicate it is hidden too", () => {
    const customer = Object.values(fixture.entries as Record<string, Doc>).find((e) => e["label"] === "Customer")!;
    const ref = (customer["kindPredicate"] as { "@id": string })["@id"];
    const chip: ContactChip = { key: "claim-customer", axis: "relationshipKind", entryId: String(customer["@id"]), label: "Customer", tone: "neutral" };
    const i = input([row("t:AssociatedWith")], { kindChips: [chip], entryPredicates: new Map([[chip.entryId, ref]]), predicateCuries: new Map([[ref, "t:CustomerOf"]]) });
    expect(texts(i)).toEqual(["customer-of"]);
  });
  test("a holder's OWN label is not a tie: the default stays beside it", () => {
    const i = input([row("t:AssociatedWith")], { kindChips: [OWN], entryPredicates: new Map([[OWN.entryId, null]]) });
    expect(texts(i)).toEqual(["Book club", "associated-with"]);
  });
  test("with the vocabulary unreadable the default shows by its own name (the CURIE), and is still hidden beside a specific one", () => {
    const rows = [row("t:AssociatedWith")];
    // unreadable: no catalog, so edgesToVault names nothing; the header shows no invented word
    expect(texts(input(rows, { catalog: null, catalogFailed: true, edges: ["t:AssociatedWith"] }))).toEqual(["t:AssociatedWith"]);
    expect(texts(input(rows, { catalog: null, catalogFailed: true, edges: ["t:AssociatedWith", "t:FriendOf"] }))).toEqual(["t:FriendOf"]);
  });
});
