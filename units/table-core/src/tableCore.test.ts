// Spec: Solution TableView.SameRecords, Mapping ("Row: a row is one live record of that type. Column: a column is a GilbVeda field of
// the type. Cell: a cell is one fact. An empty cell is no fact."), and the step 1 brief's table-core tests: an empty fact gives an
// empty cell, a multi value is a list, a link is a reference, rows equal the records, a type with no records gives headers and no rows.
// Kai-Zen's decision of 2026-11-25 adds: a field of a type above, and a fact no field declares, are columns when a loaded row holds a
// value, after the type's own fields, so the table shows every value the card shows.
//
// The fields are derived by the field reader's own pure step from term documents cut down from the live master's (veda.gilb.com,
// GET /base/vocab?status=all&carries=a:fieldOf, 2026-11-25): the address, spelling, label, encoding, cardinality and fieldOf of each term
// are as served, on an example.test host; the other keys are left out. The type "GarmentStockLine" is given all seven so one table
// shows every case. Every expected value is a literal.
import { describe, expect, test } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { fieldIndex, fieldsOfType, type FieldDeclarations, type TypeFields } from "@kaigilb/gilbplatformcode-type-fields";
import { NAME_COLUMN_ID, buildTable, cellOf, cellText, columnsOf, narrowColumns, type Cell } from "./tableCore";

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

describe("table-core", () => {
  // Spec: Solution TableView.SameRecords, Mapping.Cell: "a cell is one fact. An empty cell is no fact."
  describe("a cell is one fact", () => {
    test("no fact gives an empty cell, with no text put in its place", () => {
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

    test("a stored value is the value: text, a number and a boolean, and 0 and false are facts", () => {
      expect(cellOf(record("r1", { clothingSize: "M" }), field("a:clothingSize"))).toEqual({ kind: "value", value: "M", text: "M" });
      expect(cellOf(record("r1", { tableViewColumnOrder: 0 }), field("a:tableViewColumnOrder"))).toEqual({ kind: "value", value: 0, text: "0" });
      expect(cellOf(record("r1", { madeForKids: false }), field("a:madeForKids"))).toEqual({ kind: "value", value: false, text: "false" });
    });

    test("the prefixed key is read as well as the bare one", () => {
      expect(cellOf(record("r1", { "a:clothingSize": "XL" }), field("a:clothingSize"))).toEqual({ kind: "value", value: "XL", text: "XL" });
    });
  });

  // Spec: Solution TableView.SameRecords, Read.Columns: a field's cardinality comes from its term; a multi value is read with readList.
  describe("a multi value is a list", () => {
    test("one bare value under a multi field is a list of one", () => {
      expect(cellOf(record("r1", { account: "ann@example.test" }), field("a:account"))).toEqual({
        kind: "list",
        items: [{ kind: "value", value: "ann@example.test", text: "ann@example.test" }],
      });
    });

    test("several values are a list in stored order", () => {
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

    test("a member with no plain reading is kept and counted, not dropped", () => {
      const cell = cellOf(record("r1", { account: ["one", { service: "x", handle: "y" }] }), field("a:account"));
      expect(cell).toEqual({
        kind: "list",
        items: [
          { kind: "value", value: "one", text: "one" },
          { kind: "object", json: '{"service":"x","handle":"y"}' },
        ],
      });
    });

    test("the same stored value under a single field stays one value", () => {
      expect(cellOf(record("r1", { clothingSize: "M" }), field("a:clothingSize")).kind).toBe("value");
      expect(cellOf(record("r1", { account: "M" }), field("a:account")).kind).toBe("list");
    });
  });

  // Spec: Solution TableView.SameRecords, Mapping.Link: a link is "written as a reference fact on the row record"; the cell is a reference, never text.
  describe("a link is a reference", () => {
    const picture = `${VAULT}/base/e/pic01`;

    test("a served link is a reference with the record's id, never text", () => {
      expect(cellOf(record("r1", { approvedPostPicture: { "@id": picture } }), field("a:approvedPostPicture"))).toEqual({
        kind: "ref",
        uri: picture,
        id: "pic01",
        known: true,
      });
    });

    test("a multi link served as one object or as an array is a list of references", () => {
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

    test("an address stored as text under a link field is a reference; under a text field it is the text", () => {
      expect(cellOf(record("r1", { approvedPostPicture: picture }), field("a:approvedPostPicture"))).toEqual({ kind: "ref", uri: picture, id: "pic01", known: true });
      expect(cellOf(record("r1", { clothingSize: picture }), field("a:clothingSize"))).toEqual({ kind: "value", value: picture, text: picture });
    });

    test("a link to a term is a reference with no record id", () => {
      expect(cellOf(record("r1", { approvedPostPicture: { "@id": `${MASTER}/base/t/Thing` } }), field("a:approvedPostPicture"))).toEqual({
        kind: "ref",
        uri: `${MASTER}/base/t/Thing`,
        id: null,
        known: true,
      });
    });

    test("a short form the document does not declare is an unknown address: kept as stored, never expanded", () => {
      for (const short of ["t:Thing", "base:e/abc", "e/abc"]) {
        expect(cellOf(record("r1", { approvedPostPicture: { "@id": short } }), field("a:approvedPostPicture"))).toEqual({ kind: "ref", uri: short, id: null, known: false });
      }
    });
  });

  // Spec: Solution TableView.SameRecords, Mapping.Cell: the cell shows the stored fact; no cardinality is claimed that the term does not state.
  describe("a field whose term states no cardinality", () => {
    test("is shown as stored: one value as a value, several as a list", () => {
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

  // Spec: Solution TableView.SameRecords, Mapping.Cell: an empty cell is "no fact", so a fact that was not read is not shown as empty.
  describe("a record whose content was not read", () => {
    test("is not shown as a record with no facts", () => {
      const labelOnly = { id: "r9", typeUri: TYPE, facts: { label: "Known by name only" }, opaqueFacts: [], etag: null, hydrated: false } as BaseRecord;
      expect(cellOf(labelOnly, field("a:clothingSize")).kind).toBe("unread");
      expect(cellOf(labelOnly, field("a:account")).kind).toBe("unread");
    });

    test("a record held as flattened strings shows the strings, and a stand-in for a value with no text form is unread", () => {
      const flat: BaseRecord = { id: "r8", typeUri: TYPE, facts: { clothingSize: "M", email: "" }, opaqueFacts: ["email"], etag: null };
      expect(cellOf(flat, field("a:clothingSize"))).toEqual({ kind: "value", value: "M", text: "M" });
      expect(cellOf(flat, field("a:email")).kind).toBe("unread");
      expect(cellOf(flat, field("a:madeForKids"))).toEqual({ kind: "empty" });
    });
  });

  // Spec: Solution TableView.SameRecords, Mapping.Row and Mapping.Column: "a row is one live record of that type", "a column is a GilbVeda field of the type".
  describe("the table", () => {
    const records = [
      record("r3", { clothingSize: "L", account: ["x", "y"] }, "Parka, green"),
      record("r1", { approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` } }, "Knit, grey"),
      record("r2", {}, "Boots"),
    ];

    test("the Name column is first and frozen, then one column per field of the type, each an a:<slug> anchor", () => {
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

    test("rows equal the records: one row per record, in the order given, each holding the very record it was given", () => {
      const table = buildTable({ fields, records, nameOf });
      expect(table.typeAnchor).toBe("t:GarmentStockLine");
      expect(table.rows.map((r) => r.id)).toEqual(["r3", "r1", "r2"]);
      expect(table.rows.map((r) => r.name)).toEqual(["Parka, green", "Knit, grey", "Boots"]);
      table.rows.forEach((row, i) => expect(row.record).toBe(records[i]));
      expect(table.rows.every((r) => r.cells.length === 7)).toBe(true);
    });

    test("each cell sits under its own column", () => {
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

    test("a type with no records gives the column headers and no rows", () => {
      const table = buildTable({ fields, records: [], nameOf });
      expect(table.rows).toEqual([]);
      expect(table.columns.length).toBe(8);
    });

    test("a type with no fields of its own still shows every value its records hold, each under its stored key", () => {
      const none = fieldsOfType({ ...declarations, fieldTerms: [] }, "GarmentStockLine");
      const table = buildTable({ fields: none, records, nameOf });
      expect(table.columns.map((c) => c.id)).toEqual([NAME_COLUMN_ID, "stored:account", "stored:approvedPostPicture", "stored:clothingSize"]);
      expect(table.rows.map((r) => r.cells.length)).toEqual([3, 3, 3]);
    });

    test("a type with no fields and no records gives the Name column alone", () => {
      const none = fieldsOfType({ ...declarations, fieldTerms: [] }, "GarmentStockLine");
      const table = buildTable({ fields: none, records: [], nameOf });
      expect(table.columns.map((c) => c.id)).toEqual([NAME_COLUMN_ID]);
      expect(table.rows).toEqual([]);
    });

    test("a narrow screen lists the first three field columns under each name", () => {
      expect(narrowColumns(columnsOf(fields)).map((c) => c.id)).toEqual(["a:acceptedCheck", "a:approvedPostPicture", "a:clothingSize"]);
      expect(narrowColumns(columnsOf(fields), 2).map((c) => c.id)).toEqual(["a:acceptedCheck", "a:approvedPostPicture"]);
    });
  });

  // Spec: Kai-Zen's decision of 2026-11-25 on TableView.SameRecords, Mapping.Column: a field of a type above, and a fact no field declares, are columns only when a loaded row holds a value, after the type's own fields.
  describe("columns for facts outside the type's own fields", () => {
    // Three terms that declare a:fieldOf t:Person, not this table's type, cut down from the same live answer as the terms above.
    const PERSON = `${MASTER}/base/t/Person`;
    const elsewhere = (name: string, binding: string, label: string, encoding: string, cardinality: string | null) => ({
      "@id": `${MASTER}/base/t/${name}`,
      "a:predicateAttribute": binding,
      "a:label": label,
      "a:encoding": encoding,
      ...(cardinality === null ? {} : { "a:cardinality": cardinality }),
      "a:fieldOf": { "@id": PERSON },
    });
    const others = fieldIndex({
      origin: MASTER,
      fieldTerms: [
        elsewhere("MemberOf", "a:memberOf", "member-of", "reference:@id", "multi"),
        elsewhere("Phone", "a:phone", "Phone", "inline-literal:text", null),
        elsewhere("TimeZone", "a:timeZone", "Time Zone", "inline-literal:token", "single"),
      ],
      requiredTerms: [],
      complete: true,
      incompleteAt: [],
    });
    const OWN = [NAME_COLUMN_ID, "a:acceptedCheck", "a:approvedPostPicture", "a:clothingSize", "a:email", "a:madeForKids", "a:account", "a:tableViewColumnOrder"];
    const last = <T,>(items: readonly T[]): T => {
      const item = items[items.length - 1];
      if (item === undefined) throw new Error("the list is empty");
      return item;
    };

    test("a fact a record holds under a field of another type is a column after the type's own, headed and read by that field", () => {
      // arrange
      const group = `${VAULT}/base/e/g1`;
      const held = [record("r1", { clothingSize: "M", memberOf: { "@id": group } }, "One"), record("r2", {}, "Two")];
      // act
      const table = buildTable({ fields, records: held, nameOf, otherFields: others });
      // assert
      expect(table.columns.map((c) => c.id)).toEqual([...OWN, "a:memberOf"]);
      const column = last(table.columns);
      expect([column.label, column.source, column.frozen, column.storedKey]).toEqual(["member-of", "other", false, null]);
      expect(last(table.rows[0]?.cells ?? [])).toEqual({ kind: "list", items: [{ kind: "ref", uri: group, id: "g1", known: true }] });
      expect(last(table.rows[1]?.cells ?? [])).toEqual({ kind: "empty" });
    });

    test("such a column is there only while a loaded record holds a value", () => {
      const none = [record("r1", { clothingSize: "M" }, "One"), record("r2", { memberOf: null }, "Two")];
      expect(buildTable({ fields, records: none, nameOf, otherFields: others }).columns.map((c) => c.id)).toEqual(OWN);
      expect(buildTable({ fields, records: [], nameOf, otherFields: others }).columns.map((c) => c.id)).toEqual(OWN);
    });

    test("the type's own fields are columns whether or not a record holds a value", () => {
      expect(buildTable({ fields, records: [record("r1", {}, "One")], nameOf, otherFields: others }).columns.map((c) => c.source)).toEqual([
        "name", "type", "type", "type", "type", "type", "type", "type",
      ]);
    });

    test("the prefixed and the bare key of one field are one column", () => {
      const held = [record("r1", { "a:phone": "111" }, "One"), record("r2", { phone: "222" }, "Two")];
      const table = buildTable({ fields, records: held, nameOf, otherFields: others });
      expect(table.columns.map((c) => c.id)).toEqual([...OWN, "a:phone"]);
      expect(table.rows.map((r) => last(r.cells))).toEqual([
        { kind: "value", value: "111", text: "111" },
        { kind: "value", value: "222", text: "222" },
      ]);
    });

    test("a fact no field describes is a column headed by its key, shown as stored", () => {
      const held = [record("r1", { shelf: "B4", weightKg: 2.5 }, "One"), record("r2", { shelf: ["B4", "C1"] }, "Two")];
      const table = buildTable({ fields, records: held, nameOf, otherFields: others });
      expect(table.columns.map((c) => c.id)).toEqual([...OWN, "stored:shelf", "stored:weightKg"]);
      expect(table.columns.slice(-2).map((c) => [c.label, c.source, c.storedKey, c.field])).toEqual([
        ["shelf", "stored", "shelf", null],
        ["weightKg", "stored", "weightKg", null],
      ]);
      expect(table.rows[0]?.cells.slice(-2)).toEqual([
        { kind: "value", value: "B4", text: "B4" },
        { kind: "value", value: 2.5, text: "2.5" },
      ]);
      expect(table.rows[1]?.cells.slice(-2)).toEqual([
        { kind: "list", items: [{ kind: "value", value: "B4", text: "B4" }, { kind: "value", value: "C1", text: "C1" }] },
        { kind: "empty" },
      ]);
    });

    test("with no index of other fields, every such fact is a stored column", () => {
      const held = [record("r1", { memberOf: { "@id": `${VAULT}/base/e/g1` } }, "One")];
      const table = buildTable({ fields, records: held, nameOf });
      expect(last(table.columns).id).toBe("stored:memberOf");
      expect(last(table.rows[0]?.cells ?? [])).toEqual({ kind: "ref", uri: `${VAULT}/base/e/g1`, id: "g1", known: true });
    });

    test("in a stored column the address of a record is a reference, and any other text is the text", () => {
      const held = [record("r1", { seeAlso: `${VAULT}/base/e/x1`, source: "https://example.test/page" }, "One")];
      const table = buildTable({ fields, records: held, nameOf });
      expect(table.rows[0]?.cells.slice(-2)).toEqual([
        { kind: "ref", uri: `${VAULT}/base/e/x1`, id: "x1", known: true },
        { kind: "value", value: "https://example.test/page", text: "https://example.test/page" },
      ]);
    });

    test("the order is: the type's own fields, then fields of other types by heading, then stored facts by key", () => {
      const held = [record("r1", { zeta: 1, timeZone: "Europe/Oslo", alpha: 2, phone: "111", memberOf: { "@id": `${VAULT}/base/e/g1` } }, "One")];
      const table = buildTable({ fields, records: held, nameOf, otherFields: others });
      expect(table.columns.map((c) => c.id)).toEqual([...OWN, "a:memberOf", "a:phone", "a:timeZone", "stored:alpha", "stored:zeta"]);
    });

    test("a fact that only repeats each row's name is not a second column; one that differs on a row is", () => {
      // Every record of this file holds its name under `label`, and no table above has a label column.
      const same = [record("r1", {}, "One"), record("r2", {}, "Two")];
      expect(buildTable({ fields, records: same, nameOf }).columns.map((c) => c.id)).toEqual(OWN);
      // The second record's stored label is not the name its row shows.
      const differs = [record("r1", {}, "One"), { ...record("r2", { label: "Second, as stored" }), facts: { label: "Two" } }];
      const table = buildTable({ fields, records: differs, nameOf });
      expect(last(table.columns).id).toBe("stored:label");
      expect(table.rows.map((r) => last(r.cells))).toEqual([
        { kind: "value", value: "One", text: "One" },
        { kind: "value", value: "Second, as stored", text: "Second, as stored" },
      ]);
    });

    test("a fact held only as blank text makes no column", () => {
      const held = [record("r1", { shelf: "" }, "One"), record("r2", { shelf: "   " }, "Two")];
      expect(buildTable({ fields, records: held, nameOf }).columns.map((c) => c.id)).toEqual(OWN);
      // One row with something to read brings the column, and the blank rows keep their stored text.
      const one = [record("r1", { shelf: "" }, "One"), record("r2", { shelf: "B4" }, "Two")];
      expect(last(buildTable({ fields, records: one, nameOf }).columns).id).toBe("stored:shelf");
    });

    test("a field of another type whose every value equals the row's name is left out too: the value is in the Name column", () => {
      // The rule is by value, not by key (tester finding F12): kept on purpose, and said here so it is not a surprise.
      const same = [record("r1", { phone: "One" }, "One"), record("r2", { phone: "Two" }, "Two")];
      expect(buildTable({ fields, records: same, nameOf, otherFields: others }).columns.map((c) => c.id)).toEqual(OWN);
      const differs = [record("r1", { phone: "One" }, "One"), record("r2", { phone: "222" }, "Two")];
      expect(last(buildTable({ fields, records: differs, nameOf, otherFields: others }).columns).id).toBe("a:phone");
    });

    test("every row has one cell for each column after Name", () => {
      const held = [record("r1", { shelf: "B4", phone: "111" }, "One"), record("r2", {}, "Two")];
      const table = buildTable({ fields, records: held, nameOf, otherFields: others });
      expect(table.rows.map((r) => r.cells.length)).toEqual([table.columns.length - 1, table.columns.length - 1]);
    });
  });
});
