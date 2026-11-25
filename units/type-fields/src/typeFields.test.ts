// Spec: Solution TableView.SameRecords, Read.Columns ("columns come from a field reader for each type (P1: kind, cardinality, value set,
// record type, required, status)"), and the step 1 brief's field reader tests: those six facts for a known type, and the error cases
// 404, 403, network failure and an unknown type.
//
// The master is the stand-in of test/support.ts, which serves term documents copied from the live master (host, requests and date are
// named there). Every expected value below is a literal read off those documents.
import { describe, expect, it } from "vitest";
import { TypeFieldsError, fieldKindOf, fieldsOfType, readFieldDeclarations, readTypeFields, type TypeField } from "./typeFields";
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

describe("the fields of a known type", () => {
  it("t:TableViewColumn: seven columns, each with its kind, cardinality, value set, record type, required and status", async () => {
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

  it("a column is an a:<slug> anchor with its term address, and reads both the prefixed and the bare key", async () => {
    const master = fakeMaster();
    const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "t:TableViewColumn");
    const order = byAnchor(out.fields, "a:tableViewColumnOrder");
    expect(order.term).toBe(t("TableViewColumnOrder"));
    expect(order.writeKey).toBe("a:tableViewColumnOrder");
    expect(order.readKeys).toEqual(["a:tableViewColumnOrder", "tableViewColumnOrder"]);
    expect(order.encoding).toBe("inline-literal:integer");
    expect(order.doc["@id"]).toBe(t("TableViewColumnOrder"));
  });

  it("t:GarmentStockLine: a value set with its closure word, an Approved and a Suggested field, and the slot the type requires", async () => {
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

  it("a field the type's own term requires is required (a built case: on 2026-11-25 no live type required one of its declared fields)", async () => {
    const stockLine = fixture.requiredTerms.find((d) => d["@id"] === t("GarmentStockLine"));
    const built = { ...stockLine, "a:requiredSlot": [{ "a:slot": "a:label", "a:card": "1" }, { "a:slot": "a:clothingSize", "a:card": "1" }] };
    const master = fakeMaster({ requiredTerms: [built] });
    const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "GarmentStockLine");
    expect(out.fields.map((f) => [f.anchor, f.required])).toEqual([
      ["a:clothingSize", true],
      ["a:priceCurrency", false],
    ]);
  });

  it("t:PostApproval: a link field names the record type of its reference end, and a multi link is multi", async () => {
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

  it("t:Person: a field's own record type, a term with two spellings, and a term that states no cardinality", async () => {
    const master = fakeMaster();
    const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "Person");
    const employment = byAnchor(out.fields, "a:employment");
    expect([employment.kind, employment.cardinality, employment.recordType]).toEqual(["reference", "multi", t("Employment")]);
    const address = byAnchor(out.fields, "a:postalAddress");
    // The term retires `a:address` (its a:deprecatedNotation), so one current spelling is left to write; both are still read.
    expect(address.writeKey).toBe("a:postalAddress");
    expect(address.readKeys).toEqual(["a:postalAddress", "postalAddress", "a:address", "address"]);
    const email = byAnchor(out.fields, "a:email");
    expect([email.cardinality, email.cardinalityAsServed]).toEqual([null, null]);
  });

  it("a cardinality word that is not single or multi is kept as served and read as not stated", async () => {
    const master = fakeMaster();
    const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TopicCheck");
    const checks = byAnchor(out.fields, "a:checksStandard");
    expect([checks.cardinality, checks.cardinalityAsServed]).toEqual([null, "multiple"]);
  });
});

describe("the requests", () => {
  it("a type with fields costs two requests, each sent with cache: no-cache", async () => {
    const master = fakeMaster();
    await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn");
    expect(master.calls.map((c) => c.url).sort()).toEqual([
      "/base/vocab?status=all&carries=a%3AfieldOf&limit=1000",
      "/base/vocab?status=all&carries=a%3ArequiredSlot&limit=1000",
    ]);
    expect(master.calls.every((c) => c.init?.cache === "no-cache")).toBe(true);
  });

  it("declarations a host already holds cost no request, for any number of types", async () => {
    const first = fakeMaster();
    const declarations = await readFieldDeclarations({ vedaOrigin: ORIGIN, fetchImpl: first.fetchImpl });
    const later = fakeMaster();
    const a = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: later.fetchImpl, declarations }, "TableViewColumn");
    const b = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: later.fetchImpl, declarations }, "GarmentStockLine");
    expect([a.fields.length, b.fields.length]).toEqual([7, 2]);
    expect(later.calls).toEqual([]);
    expect(fieldsOfType(declarations, "PostApproval").fields.length).toBe(14);
  });

  it("a type that exists and has no field is an empty list after one more request (its own term)", async () => {
    const master = fakeMaster({ knownTypes: ["Thing"] });
    const out = await readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "Thing");
    expect(out.fields).toEqual([]);
    expect(master.calls.map((c) => c.url)).toContain("/base/t/Thing");
    expect(master.calls.length).toBe(3);
  });
});

describe("a read that fails is never an empty field list", () => {
  it("404 from the master is not-found", async () => {
    const master = fakeMaster({ status: 404 });
    const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
    expect([e.kind, e.status]).toEqual(["not-found", 404]);
  });

  it("403 from the master is forbidden", async () => {
    const master = fakeMaster({ status: 403 });
    const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
    expect([e.kind, e.status]).toEqual(["forbidden", 403]);
  });

  it("500 from the master is server", async () => {
    const master = fakeMaster({ status: 500 });
    const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
    expect([e.kind, e.status]).toEqual(["server", 500]);
  });

  it("a network that is down is network", async () => {
    const master = fakeMaster({ down: true });
    const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
    expect([e.kind, e.status]).toEqual(["network", null]);
  });

  it("a name no term claims is unknown-type, told apart from a type with no fields", async () => {
    const master = fakeMaster();
    const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "NoSuchTypeHere"));
    expect([e.kind, e.status]).toEqual(["unknown-type", 404]);
    expect(master.calls.map((c) => c.url)).toContain("/base/t/NoSuchTypeHere");
  });

  it("a name that is not a type name is unknown-type, and nothing is asked", async () => {
    const master = fakeMaster();
    for (const bad of ["", "  ", "a/b", `${ORIGIN}/base/t/Person`, "Per son", "../x"]) {
      const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, bad));
      expect(e.kind).toBe("unknown-type");
    }
    expect(master.calls).toEqual([]);
  });

  it("a master that does not narrow the carrier read is not-narrowed: the whole listing is not taken for the field list", async () => {
    const master = fakeMaster({ noSelector: true });
    const e = await failureOf(readTypeFields({ vedaOrigin: ORIGIN, fetchImpl: master.fetchImpl }, "TableViewColumn"));
    expect(e.kind).toBe("not-narrowed");
  });
});

describe("fieldKindOf", () => {
  it("reads the kind from the encoding's own words (the fourteen encodings the live master served on 2026-11-25)", () => {
    expect(
      [
        "inline-literal:text",
        "reference",
        "inline-literal:token",
        "inline-literal:integer",
        "node-reference",
        "inline-literal:json",
        "inline-literal:decimal",
        "inline-literal:boolean",
        "reference:@id",
        "inline-literal:date",
        "inline-literal:uri",
        "inline-literal:string",
        "inline-literal:uri-or-uri-array",
        "reference-valued:@id",
      ].map(fieldKindOf),
    ).toEqual(["text", "reference", "token", "integer", "reference", "json", "decimal", "boolean", "reference", "date", "uri", "text", "uri", "reference"]);
  });

  it("no encoding, or one it does not know, is unknown", () => {
    expect([fieldKindOf(null), fieldKindOf(""), fieldKindOf("inline-literal:colour"), fieldKindOf("blob")]).toEqual(["unknown", "unknown", "unknown", "unknown"]);
  });
});
