// Spec: Solution TableView.SameRecords, Mapping ("Row: a row is one live record of that type. Column: a column is a GilbVeda field of
// the type. Cell: a cell is one fact. An empty cell is no fact."), Read.Limit ("at 1000 rows the footer says 'first 1000 of N — filter
// to narrow'"), and the step 1 brief's table-core tests: an empty fact gives an empty cell, a multi value is a list, a link is a
// reference, rows equal the records, a type with no records gives headers and no rows.
//
// The fields are derived by the field reader's own pure step from term documents cut down from the live master's (veda.gilb.com,
// GET /base/vocab?status=all&carries=a:fieldOf, 2026-11-25): the address, spelling, label, encoding, cardinality and fieldOf of each term
// are as served, on an example.test host; the other keys are left out. The type "GarmentStockLine" is given all seven so one table
// shows every case. Every expected value is a literal.
import { describe, expect, it } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { fieldsOfType, type FieldDeclarations, type TypeFields } from "@kaigilb/gilbplatformcode-type-fields";
import { NAME_COLUMN_ID, buildTable, cellOf, cellText, columnsOf, narrowColumns, rowLimitNotice, type Cell } from "./tableCore";

const MASTER = "https://ontology.platform.example.test";
const VAULT = "https://vault.example.test";
const TYPE = `${MASTER}/base/t/GarmentStockLine`;

const term = (name: string, binding: string, label: string, encoding: string, cardinality: string | null) => ({
  "@id": `${MASTER}/base/t/${name}`,
  "a:predicateAttribute": binding,
  "a:label": label,
  "a:encoding": encoding,
  ...(cardinality === null ? {} : { "a:cardinality": cardinality }),
  "a:fieldOf": { "@id": TYPE },
});

const declarations: FieldDeclarations = {
  origin: MASTER,
  fieldTerms: [
    term("ClothingSize", "a:clothingSize", "clothing size", "inline-literal:text", "single"),
    term("Account", "a:account", "Online Account", "inline-literal:text", "multi"),
    term("AcceptedCheck", "a:acceptedCheck", "accepted check", "reference", "multi"),
    term("ApprovedPostPicture", "a:approvedPostPicture", "approved post picture", "reference", "single"),
    term("Email", "a:email", "Email", "inline-literal:text", null),
    term("MadeForKids", "a:madeForKids", "made for kids", "inline-literal:boolean", "single"),
    term("TableViewColumnOrder", "a:tableViewColumnOrder", "table view column order", "inline-literal:integer", "single"),
  ],
  requiredTerms: [],
  complete: true,
  incompleteAt: [],
};
const fields: TypeFields = fieldsOfType(declarations, "GarmentStockLine");
const field = (anchor: string) => {
  const f = fields.fields.find((x) => x.anchor === anchor);
  if (!f) throw new Error(`no field ${anchor}`);
  return f;
};

/** A record as the app holds it after a full read: the served facts are under bare keys, as the vault serves them. */
const record = (id: string, served: Record<string, unknown>, name?: string): BaseRecord => ({
  id,
  entityUri: `${VAULT}/base/e/${id}`,
  typeUri: TYPE,
  facts: name ? { label: name } : {},
  opaqueFacts: [],
  etag: `"sha256:${id}"`,
  served: { facts: { ...(name ? { label: name } : {}), ...served }, context: null, etag: `"sha256:${id}"` },
});
const nameOf = (r: BaseRecord) => r.facts["label"] ?? "";

describe("a cell is one fact", () => {
  it("no fact gives an empty cell, with no text put in its place", () => {
    const r = record("r1", { clothingSize: "M" });
    const empty: Cell = { kind: "empty" };
    expect(cellOf(r, field("a:email"))).toEqual(empty);
    expect(cellOf(r, field("a:account"))).toEqual(empty);
    expect(cellOf(r, field("a:acceptedCheck"))).toEqual(empty);
    expect(cellOf(r, field("a:approvedPostPicture"))).toEqual(empty);
    expect(cellOf(r, field("a:madeForKids"))).toEqual(empty);
    expect(cellText(empty)).toBe("");
    expect(cellOf(record("r2", { clothingSize: null }), field("a:clothingSize"))).toEqual(empty);
  });

  it("a stored value is the value: text, a number and a boolean, and 0 and false are facts", () => {
    expect(cellOf(record("r1", { clothingSize: "M" }), field("a:clothingSize"))).toEqual({ kind: "value", value: "M", text: "M" });
    expect(cellOf(record("r1", { tableViewColumnOrder: 0 }), field("a:tableViewColumnOrder"))).toEqual({ kind: "value", value: 0, text: "0" });
    expect(cellOf(record("r1", { madeForKids: false }), field("a:madeForKids"))).toEqual({ kind: "value", value: false, text: "false" });
  });

  it("the prefixed key is read as well as the bare one", () => {
    expect(cellOf(record("r1", { "a:clothingSize": "XL" }), field("a:clothingSize"))).toEqual({ kind: "value", value: "XL", text: "XL" });
  });
});

describe("a multi value is a list", () => {
  it("one bare value under a multi field is a list of one", () => {
    expect(cellOf(record("r1", { account: "ann@example.test" }), field("a:account"))).toEqual({
      kind: "list",
      items: [{ kind: "value", value: "ann@example.test", text: "ann@example.test" }],
    });
  });

  it("several values are a list in stored order", () => {
    const cell = cellOf(record("r1", { account: ["one", "two", "three"] }), field("a:account"));
    expect(cell).toEqual({
      kind: "list",
      items: [
        { kind: "value", value: "one", text: "one" },
        { kind: "value", value: "two", text: "two" },
        { kind: "value", value: "three", text: "three" },
      ],
    });
    expect(cellText(cell)).toBe("one, two, three");
  });

  it("a member with no plain reading is kept and counted, not dropped", () => {
    const cell = cellOf(record("r1", { account: ["one", { service: "x", handle: "y" }] }), field("a:account"));
    expect(cell).toEqual({
      kind: "list",
      items: [
        { kind: "value", value: "one", text: "one" },
        { kind: "object", json: '{"service":"x","handle":"y"}' },
      ],
    });
  });

  it("the same stored value under a single field stays one value", () => {
    expect(cellOf(record("r1", { clothingSize: "M" }), field("a:clothingSize")).kind).toBe("value");
    expect(cellOf(record("r1", { account: "M" }), field("a:account")).kind).toBe("list");
  });
});

describe("a link is a reference", () => {
  const picture = `${VAULT}/base/e/pic01`;

  it("a served link is a reference with the record's id, never text", () => {
    expect(cellOf(record("r1", { approvedPostPicture: { "@id": picture } }), field("a:approvedPostPicture"))).toEqual({
      kind: "ref",
      uri: picture,
      id: "pic01",
      known: true,
    });
  });

  it("a multi link served as one object or as an array is a list of references", () => {
    const one = cellOf(record("r1", { acceptedCheck: { "@id": `${VAULT}/base/e/c1` } }), field("a:acceptedCheck"));
    expect(one).toEqual({ kind: "list", items: [{ kind: "ref", uri: `${VAULT}/base/e/c1`, id: "c1", known: true }] });
    const two = cellOf(record("r1", { acceptedCheck: [{ "@id": `${VAULT}/base/e/c1` }, { "@id": `${VAULT}/base/e/c2` }] }), field("a:acceptedCheck"));
    expect(two).toEqual({
      kind: "list",
      items: [
        { kind: "ref", uri: `${VAULT}/base/e/c1`, id: "c1", known: true },
        { kind: "ref", uri: `${VAULT}/base/e/c2`, id: "c2", known: true },
      ],
    });
  });

  it("an address stored as text under a link field is a reference; under a text field it is the text", () => {
    expect(cellOf(record("r1", { approvedPostPicture: picture }), field("a:approvedPostPicture"))).toEqual({ kind: "ref", uri: picture, id: "pic01", known: true });
    expect(cellOf(record("r1", { clothingSize: picture }), field("a:clothingSize"))).toEqual({ kind: "value", value: picture, text: picture });
  });

  it("a link to a term is a reference with no record id", () => {
    expect(cellOf(record("r1", { approvedPostPicture: { "@id": `${MASTER}/base/t/Thing` } }), field("a:approvedPostPicture"))).toEqual({
      kind: "ref",
      uri: `${MASTER}/base/t/Thing`,
      id: null,
      known: true,
    });
  });

  it("a short form the document does not declare is an unknown address: kept as stored, never expanded", () => {
    for (const short of ["t:Thing", "base:e/abc", "e/abc"]) {
      expect(cellOf(record("r1", { approvedPostPicture: { "@id": short } }), field("a:approvedPostPicture"))).toEqual({ kind: "ref", uri: short, id: null, known: false });
    }
  });
});

describe("a field whose term states no cardinality", () => {
  it("is shown as stored: one value as a value, several as a list", () => {
    expect(cellOf(record("r1", { email: "ann@example.test" }), field("a:email"))).toEqual({ kind: "value", value: "ann@example.test", text: "ann@example.test" });
    expect(cellOf(record("r1", { email: ["a@example.test", "b@example.test"] }), field("a:email"))).toEqual({
      kind: "list",
      items: [
        { kind: "value", value: "a@example.test", text: "a@example.test" },
        { kind: "value", value: "b@example.test", text: "b@example.test" },
      ],
    });
  });
});

describe("a record whose content was not read", () => {
  it("is not shown as a record with no facts", () => {
    const labelOnly = { id: "r9", typeUri: TYPE, facts: { label: "Known by name only" }, opaqueFacts: [], etag: null, hydrated: false } as BaseRecord;
    expect(cellOf(labelOnly, field("a:clothingSize")).kind).toBe("unread");
    expect(cellOf(labelOnly, field("a:account")).kind).toBe("unread");
  });

  it("a record held as flattened strings shows the strings, and a stand-in for a value with no text form is unread", () => {
    const flat: BaseRecord = { id: "r8", typeUri: TYPE, facts: { clothingSize: "M", email: "" }, opaqueFacts: ["email"], etag: null };
    expect(cellOf(flat, field("a:clothingSize"))).toEqual({ kind: "value", value: "M", text: "M" });
    expect(cellOf(flat, field("a:email")).kind).toBe("unread");
    expect(cellOf(flat, field("a:madeForKids"))).toEqual({ kind: "empty" });
  });
});

describe("the table", () => {
  const records = [
    record("r3", { clothingSize: "L", account: ["x", "y"] }, "Parka, green"),
    record("r1", { approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` } }, "Knit, grey"),
    record("r2", {}, "Boots"),
  ];

  it("the Name column is first and frozen, then one column per field of the type, each an a:<slug> anchor", () => {
    const columns = columnsOf(fields);
    expect(columns.map((c) => [c.id, c.label, c.frozen])).toEqual([
      [NAME_COLUMN_ID, "Name", true],
      ["a:acceptedCheck", "accepted check", false],
      ["a:approvedPostPicture", "approved post picture", false],
      ["a:clothingSize", "clothing size", false],
      ["a:email", "Email", false],
      ["a:madeForKids", "made for kids", false],
      ["a:account", "Online Account", false],
      ["a:tableViewColumnOrder", "table view column order", false],
    ]);
    expect(columns[0]?.field).toBeNull();
  });

  it("rows equal the records: one row per record, in the order given, each holding the very record it was given", () => {
    const table = buildTable({ fields, records, nameOf });
    expect(table.typeAnchor).toBe("t:GarmentStockLine");
    expect(table.rows.map((r) => r.id)).toEqual(["r3", "r1", "r2"]);
    expect(table.rows.map((r) => r.name)).toEqual(["Parka, green", "Knit, grey", "Boots"]);
    table.rows.forEach((row, i) => expect(row.record).toBe(records[i]));
    expect(table.rows.every((r) => r.cells.length === 7)).toBe(true);
  });

  it("each cell sits under its own column", () => {
    const table = buildTable({ fields, records, nameOf });
    const at = (rowId: string, columnId: string): Cell => {
      const row = table.rows.find((r) => r.id === rowId);
      const index = table.columns.findIndex((c) => c.id === columnId) - 1;
      const cell = row?.cells[index];
      if (!cell) throw new Error("no such cell");
      return cell;
    };
    expect(at("r3", "a:clothingSize")).toEqual({ kind: "value", value: "L", text: "L" });
    expect(at("r3", "a:account").kind).toBe("list");
    expect(at("r1", "a:approvedPostPicture")).toEqual({ kind: "ref", uri: `${VAULT}/base/e/pic01`, id: "pic01", known: true });
    expect(table.rows.find((r) => r.id === "r2")?.cells).toEqual(Array.from({ length: 7 }, () => ({ kind: "empty" })));
  });

  it("a type with no records gives the column headers and no rows", () => {
    const table = buildTable({ fields, records: [], nameOf });
    expect(table.rows).toEqual([]);
    expect(table.columns.length).toBe(8);
  });

  it("a type with no fields gives the Name column alone", () => {
    const none = fieldsOfType({ ...declarations, fieldTerms: [] }, "GarmentStockLine");
    const table = buildTable({ fields: none, records, nameOf });
    expect(table.columns.map((c) => c.id)).toEqual([NAME_COLUMN_ID]);
    expect(table.rows.map((r) => r.cells)).toEqual([[], [], []]);
  });

  it("a narrow screen lists the first three field columns under each name", () => {
    expect(narrowColumns(columnsOf(fields)).map((c) => c.id)).toEqual(["a:acceptedCheck", "a:approvedPostPicture", "a:clothingSize"]);
    expect(narrowColumns(columnsOf(fields), 2).map((c) => c.id)).toEqual(["a:acceptedCheck", "a:approvedPostPicture"]);
  });
});

describe("the footer at the row limit", () => {
  it("appears at 1000 rows when the read did not reach the end, and names the count when it is exact", () => {
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false, total: { count: 2500, exact: true } })).toBe("first 1000 of 2500 — filter to narrow");
  });

  it("names no count when no total was given, or when the total is only a floor", () => {
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false })).toBe("first 1000 — filter to narrow");
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false, total: null })).toBe("first 1000 — filter to narrow");
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false, total: { count: 1000, exact: false } })).toBe("first 1000 — filter to narrow");
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false, total: { count: 5000, exact: false } })).toBe("first 1000 — filter to narrow");
  });

  it("names no count that is not above the rows on screen", () => {
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false, total: { count: 1000, exact: true } })).toBe("first 1000 — filter to narrow");
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: false, total: { count: 40, exact: true } })).toBe("first 1000 — filter to narrow");
  });

  it("does not appear at 999 rows", () => {
    expect(rowLimitNotice({ shown: 999, limit: 1000, complete: true, total: { count: 999, exact: true } })).toBeNull();
    expect(rowLimitNotice({ shown: 999, limit: 1000, complete: false })).toBeNull();
  });

  it("does not appear when the read reached the end at exactly the limit: nothing is cut", () => {
    expect(rowLimitNotice({ shown: 1000, limit: 1000, complete: true, total: { count: 1000, exact: true } })).toBeNull();
  });
});
