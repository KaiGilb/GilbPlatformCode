// Spec: Solution TableView.SameRecords, Read.Columns ("columns come from a field reader for each type (P1: kind, cardinality, value set,
// record type, required, status)"), and the step 1 brief's field reader tests: those six facts for a known type, and the error cases
// 404, 403, network failure and an unknown type.
//
// The master is the stand-in of test/support.ts, which serves term documents copied from the live master (host, requests and date are
// named there; what it does that the live master was never measured to do is labelled a guess there and at each test that uses it).
// Every expected value below is a literal read off those documents.
import { describe, expect, test } from "vitest";
import { TypeFieldsError, encodingAsServed, fieldIndex, fieldKindOf, fieldsOfType, readFieldDeclarations, readTypeFields, type TypeField } from "./typeFields";
import { ORIGIN, fakeMaster, fixture, t } from "../test/support";

const byAnchor = (fields: TypeField[], anchor: string): TypeField => {
  const f = fields.find((x) => x.anchor === anchor);
  if (!f) throw new Error(`no field ${anchor}`);
  return f;
};

async function failureOf(work: Promise<unknown>): Promise<TypeFieldsError> {
  try {
    await work;
  } catch (e) {
    if (e instanceof TypeFieldsError) return e;
    throw e;
  }
  throw new Error("the read did not fail");
}

describe("type-fields", () => {
  // Spec: Solution TableView.SameRecords, Read.Columns: "columns come from a field reader for each type (P1: kind, cardinality, value set, record type, required, status)".
  describe("the fields of a known type", () => {
    test("t:TableViewColumn: seven columns, each with its kind, cardinality, value set, record type, required and status", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn");
      expect(out.type).toBe(t("TableViewColumn"));
      expect(out.typeAnchor).toBe("t:TableViewColumn");
      expect(out.complete).toBe(true);
      expect(out.unreadable).toEqual([]);
      expect(
        out.fields.map((f) => [f.anchor, f.label, f.kind, f.cardinality, f.valueSet?.values ?? null, f.recordType, f.required, f.status]),
      ).toEqual([
        ["a:tableViewColumnField", "table view column field", "uri", "single", null, null, false, "Suggested"],
        ["a:tableViewColumnFrozen", "table view column frozen", "boolean", "single", null, null, false, "Suggested"],
        ["a:tableViewColumnHidden", "table view column hidden", "boolean", "single", null, null, false, "Suggested"],
        ["a:tableViewColumnOrder", "table view column order", "integer", "single", null, null, false, "Suggested"],
        ["a:tableViewColumnWidth", "table view column width", "integer", "single", null, null, false, "Suggested"],
        ["a:tableViewSortDirection", "table view sort direction", "token", "single", ["ascending", "descending"], null, false, "Suggested"],
        ["a:tableViewSortPriority", "table view sort priority", "integer", "single", null, null, false, "Suggested"],
      ]);
      expect(byAnchor(out.fields, "a:tableViewSortDirection").valueSet).toEqual({ values: ["ascending", "descending"], closure: "closed" });
    });

    test("a column is an a:<slug> anchor with its term address, and reads both the prefixed and the bare key", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "t:TableViewColumn");
      const order = byAnchor(out.fields, "a:tableViewColumnOrder");
      expect(order.term).toBe(t("TableViewColumnOrder"));
      expect(order.writeKey).toBe("a:tableViewColumnOrder");
      expect(order.readKeys).toEqual(["a:tableViewColumnOrder", "tableViewColumnOrder"]);
      expect(order.encoding).toBe("inline-literal:integer");
      expect(order.doc["@id"]).toBe(t("TableViewColumnOrder"));
    });

    test("t:GarmentStockLine: a value set with its closure word, an Approved and a Suggested field, and the slot the type requires", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "GarmentStockLine");
      expect(out.fields.map((f) => [f.anchor, f.status, f.kind, f.required])).toEqual([
        ["a:clothingSize", "Approved", "text", false],
        ["a:priceCurrency", "Suggested", "token", false],
      ]);
      const size = byAnchor(out.fields, "a:clothingSize");
      expect(size.valueSet?.closure).toBe("closed-forward");
      expect(size.valueSet?.values.slice(0, 6)).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
      expect(size.valueSet?.values.length).toBe(132);
      expect(out.requiredSlots).toEqual([{ slot: "a:label", card: "1", note: "the stock line's name, e.g. the model and colour" }]);
    });

    test("a field the type's own term requires is required (a built case: on 2026-11-25 no live type required one of its declared fields)", async () => {
      const stockLine = fixture.requiredTerms.find((d) => d["@id"] === t("GarmentStockLine"));
      const built = { ...stockLine, "a:requiredSlot": [{ "a:slot": "a:label", "a:card": "1" }, { "a:slot": "a:clothingSize", "a:card": "1" }] };
      const master = fakeMaster({ requiredTerms: [built] });
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "GarmentStockLine");
      expect(out.fields.map((f) => [f.anchor, f.required])).toEqual([
        ["a:clothingSize", true],
        ["a:priceCurrency", false],
      ]);
    });

    test("t:PostApproval: a link field names the record type of its reference end, and a multi link is multi", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "PostApproval");
      const accepted = byAnchor(out.fields, "a:acceptedCheck");
      expect([accepted.kind, accepted.cardinality, accepted.recordType]).toEqual(["reference", "multi", t("DraftCheck")]);
      const picture = byAnchor(out.fields, "a:approvedPostPicture");
      expect([picture.kind, picture.cardinality, picture.recordType]).toEqual(["reference", "single", t("PostPicture")]);
      expect(byAnchor(out.fields, "a:madeForKids").kind).toBe("boolean");
      expect(byAnchor(out.fields, "a:postVisibility").kind).toBe("uri");
      // A link whose term names no end has no record type: nothing is guessed.
      expect(byAnchor(out.fields, "a:goGivenByPrincipal").recordType).toBeNull();
    });

    test("t:Person: a field's own record type, a term with two spellings, and a term the master states as multi (a:email)", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "Person");
      const employment = byAnchor(out.fields, "a:employment");
      expect([employment.kind, employment.cardinality, employment.recordType]).toEqual(["reference", "multi", t("Employment")]);
      const address = byAnchor(out.fields, "a:postalAddress");
      // The term retires `a:address` (its a:deprecatedNotation), so one current spelling is left to write; both are still read.
      expect(address.writeKey).toBe("a:postalAddress");
      expect(address.readKeys).toEqual(["a:postalAddress", "postalAddress", "a:address", "address"]);
      // Live since 2026-11-25T12:22:03Z (Agent.Concept, inbox f044037e): a:email and a:phone are multi; before, they stated none.
      const email = byAnchor(out.fields, "a:email");
      expect([email.cardinality, email.cardinalityAsServed]).toEqual(["multi", "multi"]);
    });

    test("a term that states no cardinality (a:measurementType, the one live field term left without it) is read as not stated", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "MeasurementFact");
      const kind = byAnchor(out.fields, "a:measurementType");
      expect([kind.cardinality, kind.cardinalityAsServed]).toEqual([null, null]);
    });

    test("a:checksStandard is multi as the master serves it now", async () => {
      const master = fakeMaster();
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TopicCheck");
      const checks = byAnchor(out.fields, "a:checksStandard");
      expect([checks.cardinality, checks.cardinalityAsServed]).toEqual(["multi", "multi"]);
    });

    test("a cardinality word that is not single or multi is kept as served and read as not stated", async () => {
      // ⚠ A labelled stand-in: a:checksStandard served "multiple" until 2026-11-25T12:22:03Z; no live term serves such a word now, so
      // the fixture's term is copied with that one value put back, to keep the reader's guard tested.
      const standIn = fixture.fieldTerms.map((d) => (d["a:predicateAttribute"] === "a:checksStandard" ? { ...d, "a:cardinality": "multiple" } : d));
      const master = fakeMaster({ fieldTerms: standIn });
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TopicCheck");
      const checks = byAnchor(out.fields, "a:checksStandard");
      expect([checks.cardinality, checks.cardinalityAsServed]).toEqual([null, "multiple"]);
    });
  });

  // Spec: RequestsPerScreen (Tolerable 40, Goal 10): the fields of every type cost two requests, and a type's fields none once they are held.
  describe("the requests", () => {
    test("a type with fields costs two requests, each sent with cache: no-cache", async () => {
      const master = fakeMaster();
      await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn");
      expect(master.calls.map((c) => c.url).sort()).toEqual([
        "/base/vocab?status=all&carries=a%3AfieldOf&limit=1000",
        "/base/vocab?status=all&carries=a%3ArequiredSlot&limit=1000",
      ]);
      expect(master.calls.every((c) => c.init?.cache === "no-cache")).toBe(true);
    });

    test("declarations a host already holds cost no request, for any number of types", async () => {
      const first = fakeMaster();
      const declarations = await readFieldDeclarations({ vedaOrigin: ORIGIN, fetchImpl: first.fetchImpl });
      const later = fakeMaster();
      const a = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: later.fetchImpl, declarations }, "TableViewColumn");
      const b = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: later.fetchImpl, declarations }, "GarmentStockLine");
      expect([a.fields.length, b.fields.length]).toEqual([7, 2]);
      expect(later.calls).toEqual([]);
      expect(fieldsOfType(declarations, "PostApproval").fields.length).toBe(14);
    });

    test("a type that exists and has no field is an empty list after one more request (its own term)", async () => {
      const master = fakeMaster({ knownTypes: ["Thing"] });
      const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "Thing");
      expect(out.fields).toEqual([]);
      expect(master.calls.map((c) => c.url)).toContain("/base/t/Thing");
      expect(master.calls.length).toBe(3);
    });
  });

  // Error states (404, 403, network failure, an unknown type), as the step 1 brief lists them: internal error handling, tied to no spec item.
  describe("a read that fails is never an empty field list", () => {
    // A guess: the live master was never measured answering 404 to a carrier read. The stand-in answers it to every request.
    test("404 from the master is not-found", async () => {
      const master = fakeMaster({ status: 404 });
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
      expect([e.kind, e.status]).toEqual(["not-found", 404]);
    });

    // A guess: the live master was never measured refusing a read (its vocabulary is public).
    test("403 from the master is forbidden", async () => {
      const master = fakeMaster({ status: 403 });
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
      expect([e.kind, e.status]).toEqual(["forbidden", 403]);
    });

    // A guess: the live master was never measured answering 500.
    test("500 from the master is server", async () => {
      const master = fakeMaster({ status: 500 });
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
      expect([e.kind, e.status]).toEqual(["server", 500]);
    });

    // Not a platform behaviour: the request never reaches a master (fetch rejects, as a browser's does with no network).
    test("a network that is down is network", async () => {
      const master = fakeMaster({ down: true });
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
      expect([e.kind, e.status]).toEqual(["network", null]);
    });

    // Measured: GET /base/t/NoSuchTypeHere on the live master answered 404 (2026-11-25T02:02Z).
    test("a name no term claims is unknown-type, told apart from a type with no fields", async () => {
      const master = fakeMaster();
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "NoSuchTypeHere"));
      expect([e.kind, e.status]).toEqual(["unknown-type", 404]);
      expect(master.calls.map((c) => c.url)).toContain("/base/t/NoSuchTypeHere");
    });

    test("a name that is not a type name is unknown-type, and nothing is asked", async () => {
      const master = fakeMaster();
      for (const bad of ["", "  ", "a/b", `${ORIGIN}/base/t/Person`, "Per son", "../x"]) {
        const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, bad));
        expect(e.kind).toBe("unknown-type");
      }
      expect(master.calls).toEqual([]);
    });

    // A guess: no master without the carrier read was measured. The stand-in leaves `carries` off the answer's face, which is what the
    // vocabulary-source unit refuses.
    test("a master that does not narrow the carrier read is not-narrowed: the whole listing is not taken for the field list", async () => {
      const master = fakeMaster({ noSelector: true });
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
      expect(e.kind).toBe("not-narrowed");
    });
  });

  // Spec: Solution TableView.SameRecords, Read.Columns: "columns come from a field reader for each type (P1: kind, cardinality, value set, record type, required, status)".
  describe("fieldKindOf", () => {
    // Measured: the 20 distinct encodings among the 847 field terms of veda.gilb.com (production, public read; GET
    // /base/vocab?status=all&carries=a:fieldOf&limit=1000, 2026-11-25T01:07Z), most used first, each with how many terms carry it. Two
    // more terms carry no encoding. 19 are served as one text; one is served as a LIST of two texts (the term t:Skill, a:skill), and is
    // written here as the list it is. (An earlier version of this test wrote it as one text with a comma, which the master does not
    // serve: Agent.Tester round 2, F-N6.)
    test("reads the kind from the encoding's own words, for each of the 20 encodings the live master served", () => {
      const served: [encoding: string | string[], terms: number, kind: string][] = [
        ["inline-literal:text", 185, "text"],
        ["reference", 150, "reference"],
        ["inline-literal:token", 125, "token"],
        ["inline-literal:integer", 71, "integer"],
        ["node-reference", 69, "reference"],
        ["inline-literal:json", 65, "json"],
        ["inline-literal:decimal", 55, "decimal"],
        ["inline-literal:boolean", 53, "boolean"],
        ["reference:@id", 23, "reference"],
        ["inline-literal:date", 22, "date"],
        ["inline-literal:uri", 11, "uri"],
        ["inline-literal:string", 3, "text"],
        ["inline-literal:uri-or-uri-array", 3, "uri"],
        ["reference-valued:@id", 3, "reference"],
        // A link held on a role record, or a plain link: the first form is not one this unit knows, so the two are not one kind.
        ["reified:role-plane|reference:@id", 2, "unknown"],
        ["reference-edge:@id", 1, "reference"],
        ["reference:node-or-node-array", 1, "reference"],
        ["inline-literal:text[]", 1, "text"],
        // A link or a text: not read as either. A stored link is still drawn as a link, and a stored text as the text.
        [["reference-valued:@id", "inline-literal:text"], 1, "unknown"],
        ["inline-literal:enum", 1, "token"],
      ];
      expect(served.length).toBe(20);
      expect(served.reduce((sum, [, terms]) => sum + terms, 0)).toBe(845);
      expect(served.map(([encoding]) => fieldKindOf(encoding))).toEqual(served.map(([, , kind]) => kind));
    });

    // Kai-Zen's decision of 2026-11-25 (L3): "take the kind when all entries agree; otherwise show the value as stored".
    test("an encoding served as a list is the kind its entries agree on, and unknown when they do not", () => {
      expect(fieldKindOf(["inline-literal:text", "inline-literal:string"])).toBe("text");
      expect(fieldKindOf(["reference", "reference:@id"])).toBe("reference");
      expect(fieldKindOf(["reference-valued:@id", "inline-literal:text"])).toBe("unknown");
      expect(fieldKindOf([])).toBe("unknown");
    });

    // The live shape: the term t:Skill as veda.gilb.com served it (production, public read; GET
    // /base/vocab?status=all&carries=a:fieldOf&limit=1000, 2026-11-25T01:07Z), cut to the keys the reader reads.
    test("a term that serves its encoding as a list keeps it as the list, and its field is of no single kind", () => {
      const skill = { "@id": `${ORIGIN}/base/t/Skill`, "a:predicateAttribute": "a:skill", "a:label": "Skill", "a:encoding": ["reference-valued:@id", "inline-literal:text"], "a:fieldOf": [{ "@id": `${ORIGIN}/base/t/Person` }] };
      expect(encodingAsServed(skill)).toEqual(["reference-valued:@id", "inline-literal:text"]);
      const field = fieldIndex({ origin: ORIGIN, fieldTerms: [skill], requiredTerms: [], complete: true, incompleteAt: [] }).get("a:skill");
      expect(field?.encoding).toEqual(["reference-valued:@id", "inline-literal:text"]);
      expect(field?.kind).toBe("unknown");
    });

    test("no encoding, or one it does not know, is unknown", () => {
      expect([fieldKindOf(null), fieldKindOf(""), fieldKindOf("inline-literal:colour"), fieldKindOf("blob")]).toEqual(["unknown", "unknown", "unknown", "unknown"]);
    });
  });

  // Spec: Solution TableView.SameRecords, Mapping.Column, with Kai-Zen's decision of 2026-11-25: a field declared on a type above becomes a column when a loaded row holds a value, and the lookup is kept with the field list (no request).
  describe("fieldIndex", () => {
    const declarations = { origin: ORIGIN, fieldTerms: fixture.fieldTerms, requiredTerms: fixture.requiredTerms, complete: true, incompleteAt: [] };

    test("finds a field by the prefixed key and by the bare key a record is read under", () => {
      // arrange
      const index = fieldIndex(declarations);
      // act
      const prefixed = index.get("a:clothingSize");
      const bare = index.get("clothingSize");
      // assert
      expect(prefixed?.term).toBe(t("ClothingSize"));
      expect(bare).toBe(prefixed);
      expect([prefixed?.label, prefixed?.kind, prefixed?.cardinality]).toEqual(["clothing size", "text", "single"]);
    });

    test("every spelling a term publishes, a retired one too, leads to the one field", () => {
      const index = fieldIndex(declarations);
      const address = index.get("a:postalAddress");
      expect(address?.term).toBe(t("PostalAddress"));
      for (const key of ["postalAddress", "a:address", "address"]) expect(index.get(key)).toBe(address);
    });

    test("holds each of the 38 terms once, and says of none that it is required: that is a fact about one type", () => {
      const fields = [...new Set(fieldIndex(declarations).values())];
      expect(fields.length).toBe(38);
      expect(fields.some((f) => f.required)).toBe(false);
    });

    test("a key no term publishes is not in it", () => {
      expect(fieldIndex(declarations).get("shelf")).toBeUndefined();
    });

    test("asks the master nothing", async () => {
      const master = fakeMaster();
      const held = await readFieldDeclarations({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl });
      const before = master.calls.length;
      fieldIndex(held);
      expect(master.calls.length).toBe(before);
    });
  });
});
