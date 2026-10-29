// When a kind's predicate TERM cannot be read after the retries (curie = null), the chip shows the kind's OWN word ("Customer") in the
// dashed own-label look, titled "relation term could not be read", and ⛔ never any part of the term's address. Once the term reads, the
// next load shows its ontology label as normal.
import { describe, expect, test } from "vitest";
import fixture from "../test/relationsMaster.json";
import { catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";
import { headerRelations } from "./headerRelations";
import type { ContactChip } from "./contactKindModel";

type Doc = Record<string, unknown>;
const ENTRIES = fixture.entries as Record<string, Doc>;
const customer = Object.values(ENTRIES).find((e) => e["label"] === "Customer")!;
const ref = (customer["kindPredicate"] as { "@id": string })["@id"];
const chip: ContactChip = { key: "k", axis: "relationshipKind", entryId: String(customer["@id"]), label: String(customer["label"]), tone: "neutral" };
const rels = () =>
  headerRelations({
    kindChips: [chip],
    entryPredicates: new Map([[chip.entryId, ref]]),
    predicateCuries: new Map([[ref, null]]),
    catalog: catalogFromGraph(fixture.vocab["@graph"] as Doc[], "user"),
    catalogFailed: false,
    edges: [],
    contactName: "Ben Lund",
    holderName: "Ann Berg",
  });

describe("the predicate's term could not be read after the retries", () => {
  test("the chip is the kind's own word in the dashed own-label look, and says the relation term could not be read", () => {
    const r = rels();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ text: customer["label"], kind: "own", curie: null });
    expect(r[0]!.title).toMatch(/relation term could not be read/);
  });
  test("never any part of the term's address", () => {
    const r = rels()[0]!;
    const tail = ref.slice(ref.lastIndexOf("/") + 1);
    expect(ref.endsWith(r.text)).toBe(false);
    expect(r.title).not.toContain(tail);
    expect(r.key).not.toContain(tail);
  });
});
