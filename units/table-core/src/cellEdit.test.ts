// Spec: Solution TableView.SameRecords, Write.Cell ("each cell edit is one merge-patch with If-Match"), Write.Conflict ("on a conflict
// in the same field, the cell shows both values and asks"), Write.Closed ("a value outside a closed list is refused in the cell"); Values
// TableSurface.CellEditRoundTrip and Concurrency.LostUpdate; and the table view step 2 brief (2026-11-25), "How a cell edit works" 4 to
// 12 and its unit tests: number parse in several locales, date write at the edges of the day, text exactly as typed, empty against
// absent, the closed-list check, the 412 decision table, the mapping of each error to its cell state, the keyboard state machine.
//
// Every attribute name below is a live GilbVeda term (veda.gilb.com, GET /base/vocab?status=all&carries=a:fieldOf, read
// 2026-11-25T09:23Z; an example.test host stands for the master): none is made up. ⚠ Their labels, and for some their kind, their list
// of values, their closure or their cardinality, are SET FOR THE CASE under test and are not the live terms' own (the live master has
// no field that is a date with a time, none whose list is declared open, and none with two spellings of this shape). They are all
// declared here as fields of one type, which the live ones are not. Nothing here asks the network.
import { describe, expect, test } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { fieldsOfType, type FieldDeclarations } from "@kaigilb/gilbplatformcode-type-fields";
import {
  READ_ONLY_REASON,
  cellPatch,
  checkChoice,
  decideAfterStale,
  editabilityOf,
  formatNumber,
  keyAct,
  nextGridState,
  numberMarksOf,
  parseDateInput,
  parseEdit,
  parseNumberInput,
  problemOf,
  sameCellValue,
  storedValueOf,
  valueText,
  type EditPlan,
  type KeyInput,
} from "./cellEdit";
import { buildTable, type Cell, type TableColumn } from "./tableCore";

const MASTER = "https://ontology.platform.example.test";
const VAULT = "https://vault.example.test";
const TYPE = `${MASTER}/base/t/GarmentStockLine`;
const term = (name: string, binding: string, label: string, encoding: string | string[], cardinality: string | null, extra: Record<string, unknown> = {}) => ({
  "@id": `${MASTER}/base/t/${name}`,
  "a:predicateAttribute": binding,
  "a:label": label,
  "a:encoding": encoding,
  ...(cardinality === null ? {} : { "a:cardinality": cardinality }),
  "a:fieldOf": { "@id": TYPE },
  ...extra,
});
const declarations: FieldDeclarations = {
  origin: MASTER,
  fieldTerms: [
    term("AltText", "a:altText", "stock note", "inline-literal:text", "single"),
    term("BerthCount", "a:berthCount", "stock count", "inline-literal:integer", "single"),
    term("AskingPrice", "a:askingPrice", "unit price", "inline-literal:decimal", "single"),
    term("DripStartDate", "a:dripStartDate", "restock date", "inline-literal:date", "single"),
    term("GrantedAt", "a:grantedAt", "counted at", "inline-literal:dateTime", "single"),
    term("MadeForKids", "a:madeForKids", "made for kids", "inline-literal:boolean", "single"),
    term("ClothingSize", "a:clothingSize", "clothing size", "inline-literal:token", "single", { "a:valueSet": ["XS", "S", "M", "L"], "a:valueSetClosure": "closed" }),
    term("HelpPictureKind", "a:helpPictureKind", "helpPictureKind", "inline-literal:text", "single", { "a:valueSet": ["Red", "Green"] }),
    term("ImpactBasis", "a:impactBasis", "impactBasis", "inline-literal:token", "single", { "a:valueSet": ["calm"], "a:valueSetClosure": "open" }),
    term("Account", "a:account", "Online Account", "inline-literal:text", "multi"),
    term("ApprovedPostPicture", "a:approvedPostPicture", "approved post picture", "reference", "single"),
    term("StatedBy", "a:statedBy", "stated by", "inline-literal:text", "single"),
    term("PostVisibility", "a:postVisibility", "post visibility", "inline-literal:uri", "single"),
    term("Email", "a:email", "Email", "inline-literal:text", null),
    term("NameOrLabel", "a:name|a:label", "two keys", "inline-literal:text", "single"),
  ],
  requiredTerms: [{ "@id": TYPE, "a:requiredSlot": [{ "a:slot": "a:altText", "a:card": "1" }] }],
  complete: true,
  incompleteAt: [],
};
const fields = fieldsOfType(declarations, "GarmentStockLine");
const record = (served: Record<string, unknown>): BaseRecord => ({
  id: "r1",
  entityUri: `${VAULT}/base/e/r1`,
  typeUri: TYPE,
  facts: { label: "Parka" },
  opaqueFacts: [],
  etag: '"sha256:1"',
  served: { facts: { label: "Parka", ...served }, context: null, etag: '"sha256:1"' },
});
/** The column and the cell of one field of a one-row table that stores `served`. */
function at(anchor: string, served: Record<string, unknown> = {}): { column: TableColumn; cell: Cell } {
  const table = buildTable({ fields, records: [record(served)], nameOf: (r) => r.facts["label"] ?? "" });
  const index = table.columns.findIndex((c) => c.id === anchor);
  if (index < 0) throw new Error(`no column ${anchor}`);
  return { column: table.columns[index] as TableColumn, cell: index === 0 ? { kind: "empty" } : (table.rows[0]?.cells[index - 1] as Cell) };
}
const planOf = (anchor: string, served: Record<string, unknown> = {}): EditPlan => {
  const { column, cell } = at(anchor, served);
  const e = editabilityOf(column, cell);
  if (!e.editable) throw new Error(`${anchor} is read-only: ${e.reason}`);
  return e;
};
const reasonOf = (anchor: string, served: Record<string, unknown> = {}, systemKeys?: ReadonlySet<string>): string | null => {
  const { column, cell } = at(anchor, served);
  const e = editabilityOf(column, cell, systemKeys ? { systemKeys } : {});
  return e.editable ? null : e.reason;
};

describe("cellEdit", () => {
  // Spec: step 2 brief, Scope ("Edit the value of an existing cell for these kinds: text, long text, number, date (date only),
  // checkbox, choice from a closed list") and 10 ("Read-only cells ... each with its reason").
  describe("editabilityOf", () => {
    test("each kind in scope gets its editor, with the key to write and the field's label", () => {
      expect(planOf("a:altText")).toEqual({ editable: true, editor: "text", integer: false, options: null, required: true, writeKey: "a:altText", label: "stock note" });
      expect(planOf("a:berthCount")).toMatchObject({ editor: "number", integer: true, required: false });
      expect(planOf("a:askingPrice")).toMatchObject({ editor: "number", integer: false });
      expect(planOf("a:dripStartDate")).toMatchObject({ editor: "date" });
      expect(planOf("a:madeForKids")).toMatchObject({ editor: "checkbox" });
      expect(planOf("a:clothingSize")).toMatchObject({ editor: "choice", options: ["XS", "S", "M", "L"] });
    });

    test("a list of values with no closure word is closed; one declared open is free text", () => {
      expect(planOf("a:helpPictureKind")).toMatchObject({ editor: "choice", options: ["Red", "Green"] });
      expect(planOf("a:impactBasis")).toMatchObject({ editor: "text", options: null });
    });

    test("an empty cell of an editable field may be edited: giving a field its first value is an edit", () => {
      expect(at("a:berthCount").cell).toEqual({ kind: "empty" });
      expect(planOf("a:berthCount").editable).toBe(true);
    });

    test("what is out of scope is read-only, each with its own reason", () => {
      expect(reasonOf("name")).toBe(READ_ONLY_REASON.name);
      expect(reasonOf("a:approvedPostPicture", { approvedPostPicture: { "@id": `${VAULT}/base/e/pic01` } })).toBe("Links are changed on the card for now");
      expect(reasonOf("a:approvedPostPicture")).toBe("Links are changed on the card for now");
      expect(reasonOf("a:account", { account: ["x"] })).toBe(READ_ONLY_REASON.multi);
      expect(reasonOf("a:grantedAt", { grantedAt: "2026-11-25T08:00:00Z" })).toBe(READ_ONLY_REASON.dateTime);
      expect(reasonOf("a:postVisibility")).toBe(READ_ONLY_REASON.otherKind);
      expect(reasonOf("a:name")).toBe(READ_ONLY_REASON.noWriteKey);
    });

    test("a field the host names as set by the vault is read-only, by any of its keys", () => {
      expect(reasonOf("a:statedBy", {}, new Set(["a:statedBy"]))).toBe(READ_ONLY_REASON.system);
      expect(reasonOf("a:statedBy", {}, new Set(["statedBy"]))).toBe(READ_ONLY_REASON.system);
      expect(reasonOf("a:statedBy")).toBeNull();
    });

    test("a value no field describes is read-only", () => {
      const table = buildTable({ fields, records: [record({ shelf: "B4" })], nameOf: (r) => r.facts["label"] ?? "" });
      const column = table.columns.find((c) => c.source === "stored") as TableColumn;
      expect(editabilityOf(column, { kind: "value", value: "B4", text: "B4" })).toEqual({ editable: false, reason: READ_ONLY_REASON.stored });
    });

    // Spec: Kai-Zen's decision 4 (2026-11-25): "Unclear cardinality: edit such a field the way the card already does; if the card does
    // not, the cell is read-only and says why." The card edits such a field as one text value.
    test("a field whose term states no cardinality is edited as one value while it holds one or none, and is read-only when it holds several", () => {
      expect(planOf("a:email", { email: "a@b.example" })).toMatchObject({ editor: "text" });
      expect(planOf("a:email")).toMatchObject({ editor: "text" });
      expect(reasonOf("a:email", { email: ["a@b.example", "c@d.example"] })).toBe(READ_ONLY_REASON.severalHeld);
    });

    test("a link stored under a text field, a structured value and an unread value are read-only", () => {
      expect(reasonOf("a:altText", { altText: { "@id": `${VAULT}/base/e/x` } })).toBe(READ_ONLY_REASON.link);
      expect(reasonOf("a:altText", { altText: { lat: 1 } })).toBe(READ_ONLY_REASON.noPlainForm);
      const { column } = at("a:altText");
      expect(editabilityOf(column, { kind: "unread", reason: "not loaded" })).toEqual({ editable: false, reason: READ_ONLY_REASON.unread });
    });
  });

  // Spec: step 2 brief 9, Number: "parse with the browser locale's grouping and decimal marks (Intl), store a JSON number, and show it
  // back the same way. If input is ambiguous or is not a number, refuse it and say why. Check the term's range for integer or decimal."
  describe("parseNumberInput", () => {
    test("the marks come from Intl, not from a table", () => {
      expect(numberMarksOf("en-US")).toEqual({ decimal: ".", group: "," });
      expect(numberMarksOf("de-DE")).toEqual({ decimal: ",", group: "." });
      expect(numberMarksOf("nb-NO").decimal).toBe(",");
      expect(numberMarksOf("not a locale")).toEqual({ decimal: ".", group: "," });
    });

    test("1,234.5 is 1234.5 in en-US and refused in de-DE; 1.234,5 is 1234.5 in de-DE and refused in en-US", () => {
      expect(parseNumberInput("1,234.5", "en-US")).toEqual({ ok: true, value: 1234.5 });
      expect(parseNumberInput("1.234,5", "de-DE")).toEqual({ ok: true, value: 1234.5 });
      const deWrong = parseNumberInput("1,234.5", "de-DE");
      expect(deWrong.ok).toBe(false);
      expect(deWrong.ok === false && deWrong.why).toContain("can be read in two ways");
      const enWrong = parseNumberInput("1.234,5", "en-US");
      expect(enWrong.ok === false && enWrong.why).toContain("can be read in two ways");
    });

    test("-0 is stored as 0, 1e3 as 1000, and empty text is no value", () => {
      for (const locale of ["en-US", "de-DE", "fr-FR", "nb-NO"]) {
        const zero = parseNumberInput("-0", locale);
        expect(zero).toEqual({ ok: true, value: 0 });
        expect(zero.ok && Object.is(zero.value, 0)).toBe(true);
        expect(parseNumberInput("1e3", locale)).toEqual({ ok: true, value: 1000 });
        expect(parseNumberInput("", locale)).toEqual({ ok: true, value: null });
        expect(parseNumberInput("   ", locale)).toEqual({ ok: true, value: null });
      }
      expect(parseNumberInput("1,5e3", "de-DE")).toEqual({ ok: true, value: 1500 });
      expect(parseNumberInput("2E-2", "en-US")).toEqual({ ok: true, value: 0.02 });
    });

    test("grouping is read only in threes; 1,23 in en-US is refused as ambiguous and not read as 123", () => {
      expect(parseNumberInput("1,234,567", "en-US")).toEqual({ ok: true, value: 1234567 });
      expect(parseNumberInput("1.234.567", "de-DE")).toEqual({ ok: true, value: 1234567 });
      for (const [text, locale] of [["1,23", "en-US"], ["12,34", "en-US"], ["1.5", "de-DE"], ["1,2345", "en-US"]] as const) {
        const r = parseNumberInput(text, locale);
        expect(r.ok === false && r.why, `${text} in ${locale}`).toContain("can be read in two ways");
      }
    });

    test("a space groups digits where the locale's grouping mark is a space, of any kind", () => {
      expect(parseNumberInput("1 234,5", "fr-FR")).toEqual({ ok: true, value: 1234.5 });
      expect(parseNumberInput("1 234,5", "fr-FR")).toEqual({ ok: true, value: 1234.5 });
      expect(parseNumberInput("1 234", "nb-NO")).toEqual({ ok: true, value: 1234 });
      expect(parseNumberInput("1 234", "en-US").ok).toBe(false);
    });

    test("signs, a leading or trailing decimal mark, and surrounding spaces", () => {
      expect(parseNumberInput(" -12.5 ", "en-US")).toEqual({ ok: true, value: -12.5 });
      expect(parseNumberInput("−12", "en-US")).toEqual({ ok: true, value: -12 });
      expect(parseNumberInput("+7", "en-US")).toEqual({ ok: true, value: 7 });
      expect(parseNumberInput(".5", "en-US")).toEqual({ ok: true, value: 0.5 });
      expect(parseNumberInput("5.", "en-US")).toEqual({ ok: true, value: 5 });
    });

    test("what is not a number is refused, and the reason names what was typed", () => {
      for (const text of ["abc", "12abc", "1.2.3", ".", "e5", "--5", "1e", "NaN", "Infinity", "1e999", "0x10"]) {
        const r = parseNumberInput(text, "en-US");
        expect(r.ok, text).toBe(false);
        expect(r.ok === false && r.why, text).toContain(text);
      }
    });

    test("a whole-number field refuses a fraction and takes 1e3; a number too large to store exactly is refused", () => {
      const r = parseNumberInput("1.5", "en-US", { integer: true });
      expect(r).toEqual({ ok: false, why: '"1.5" is not a whole number' });
      expect(parseNumberInput("1e3", "en-US", { integer: true })).toEqual({ ok: true, value: 1000 });
      expect(parseNumberInput("1.0", "en-US", { integer: true })).toEqual({ ok: true, value: 1 });
      expect(parseNumberInput("9007199254740993", "en-US")).toEqual({ ok: false, why: '"9007199254740993" is too large to be stored exactly' });
      expect(parseNumberInput("9007199254740991", "en-US")).toEqual({ ok: true, value: 9007199254740991 });
      // 2^53 itself, and a power of ten, are stored exactly.
      expect(parseNumberInput("9007199254740992", "en-US")).toEqual({ ok: true, value: 9007199254740992 });
      expect(parseNumberInput("1e21", "en-US")).toEqual({ ok: true, value: 1e21 });
    });

    test("a number is shown back in the locale's marks with no grouping, and that text reads back as the same number", () => {
      expect(formatNumber(1234.5, "en-US")).toBe("1234.5");
      expect(formatNumber(1234.5, "de-DE")).toBe("1234,5");
      expect(formatNumber(2026, "en-US")).toBe("2026");
      expect(formatNumber(-0, "en-US")).toBe("0");
      for (const locale of ["en-US", "de-DE", "fr-FR", "nb-NO"]) {
        for (const n of [0, 1, -1, 0.1, 0.1 + 0.2, 1234567.891, -42.5, 1e21, 1e-7, 123456789012345, 5e-324, 1.7976931348623157e308]) {
          expect(parseNumberInput(formatNumber(n, locale), locale), `${n} in ${locale}`).toEqual({ ok: true, value: n });
        }
      }
    });
  });

  // Spec: step 2 brief 9, Date: "store YYYY-MM-DD as text. Never put it through new Date(string) or a time-zone conversion", and its
  // test: "Dec 31 and Jan 1, in UTC−12 and UTC+14 (set TZ in the test). The stored text must equal the text that was picked."
  describe("parseDateInput", () => {
    test("Dec 31 and Jan 1 are stored as picked, at both edges of the world's time zones", () => {
      const before = process.env["TZ"];
      try {
        // Etc/GMT+12 is UTC−12 and Pacific/Kiritimati is UTC+14 (the sign of an Etc name is reversed).
        for (const zone of ["Etc/GMT+12", "Pacific/Kiritimati", "UTC"]) {
          process.env["TZ"] = zone;
          // Known answer: the zone is in force, so a Date built from the text WOULD move the day in one of them.
          const offsetHours = 0 - new Date(2026, 0, 1).getTimezoneOffset() / 60;
          expect(offsetHours, zone).toBe(zone === "Etc/GMT+12" ? -12 : zone === "UTC" ? 0 : 14);
          for (const picked of ["2026-12-31", "2027-01-01", "2024-02-29"]) {
            expect(parseDateInput(picked), `${picked} in ${zone}`).toEqual({ ok: true, value: picked });
            expect(cellPatch("a:dripStartDate", picked)).toEqual({ "a:dripStartDate": picked });
          }
        }
      } finally {
        if (before === undefined) delete process.env["TZ"];
        else process.env["TZ"] = before;
      }
    });

    test("the check is that a time-zone conversion would have moved the day (the trap this avoids)", () => {
      const before = process.env["TZ"];
      try {
        process.env["TZ"] = "Etc/GMT+12";
        // What the code must never do: read the text as a Date and take its local day.
        const moved = new Date("2027-01-01");
        expect(`${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-${String(moved.getDate()).padStart(2, "0")}`).toBe("2026-12-31");
        expect(parseDateInput("2027-01-01")).toEqual({ ok: true, value: "2027-01-01" });
      } finally {
        if (before === undefined) delete process.env["TZ"];
        else process.env["TZ"] = before;
      }
    });

    test("empty is no value; a text that is not a calendar date is refused", () => {
      expect(parseDateInput("")).toEqual({ ok: true, value: null });
      for (const text of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-01-00", "2025-02-29", "31.12.2026", "2026-1-1", "2026-12-31T00:00:00Z", "tomorrow"]) {
        expect(parseDateInput(text).ok, text).toBe(false);
      }
      expect(parseDateInput("2000-02-29").ok).toBe(true);
      expect(parseDateInput("1900-02-29").ok).toBe(false);
    });
  });

  // Spec: step 2 brief 9, Text: "store exactly what was typed. No trimming, so leading and trailing spaces and unicode come back the
  // same", and its test list: 10 000 characters, leading and trailing spaces, emoji, RTL, combining marks, NUL-free control characters.
  describe("text", () => {
    const plan = planOf("a:helpPictureKind") && planOf("a:email");
    const odd = [
      "x".repeat(10_000),
      "  leading and trailing  ",
      "\ttab and\nnew line\r\n",
      "👩‍👩‍👧‍👦 family, 🏳️‍🌈 flag",
      "שלום עולם and مرحبا",
      "é and é are not made the same",
      "bell\u0007 escape\u001b unit separator\u001f",
      "​ zero width ‍ joiner ﻿",
      " ",
    ];
    test("every odd text is the value to store, character for character, and is the one field of its patch", () => {
      for (const text of odd) {
        const parsed = parseEdit(plan, text, "en-US");
        expect(parsed).toEqual({ ok: true, value: text });
        expect(cellPatch(plan.writeKey, text)).toEqual({ "a:email": text });
        expect(valueText(text, "en-US")).toBe(text);
      }
    });

    test("composed and decomposed forms stay different values", () => {
      expect(sameCellValue("é", "é")).toBe(false);
    });
  });

  // Spec: step 2 brief 8, Clear: "Clearing a cell removes the field (merge-patch null). It never writes ''. An empty cell means the field
  // is absent. A stored '' shows as stored."
  describe("empty against absent", () => {
    test("clearing sends null for that one field, and an empty text is never sent", () => {
      expect(parseEdit(planOf("a:email"), "", "en-US")).toEqual({ ok: true, value: null });
      expect(cellPatch("a:email", null)).toEqual({ "a:email": null });
      expect(cellPatch("a:email", "")).toEqual({ "a:email": null });
      expect(Object.keys(cellPatch("a:email", null))).toEqual(["a:email"]);
    });

    test("an absent fact is null and a stored empty text is that text: they are not the same value", () => {
      expect(storedValueOf(at("a:email").cell)).toBeNull();
      expect(storedValueOf(at("a:email", { email: "" }).cell)).toBe("");
      expect(sameCellValue(null, "")).toBe(false);
      expect(sameCellValue(null, undefined)).toBe(true);
      expect(sameCellValue(0, false)).toBe(false);
      expect(sameCellValue(0, -0)).toBe(true);
      expect(sameCellValue("1", 1)).toBe(false);
    });

    test("a stored false and a stored 0 are values, and a link or a list is not one plain value", () => {
      expect(storedValueOf(at("a:madeForKids", { madeForKids: false }).cell)).toBe(false);
      expect(storedValueOf(at("a:berthCount", { berthCount: 0 }).cell)).toBe(0);
      expect(storedValueOf(at("a:approvedPostPicture", { approvedPostPicture: { "@id": `${VAULT}/base/e/p` } }).cell)).toBeUndefined();
      expect(storedValueOf(at("a:account", { account: ["x", "y"] }).cell)).toBeUndefined();
    });

    test("a required field cannot be cleared: the reason names the field", () => {
      expect(parseEdit(planOf("a:altText"), "", "en-US")).toEqual({ ok: false, why: "stock note is required" });
      expect(parseEdit(planOf("a:altText"), " ", "en-US")).toEqual({ ok: true, value: " " });
    });
  });

  // Spec: step 2 brief 7, Closed list: "Check it in the app every time ... A typed value not in the list turns the cell red and is not
  // written. The list opens with '<value> is not in this list'." And its end-to-end case: "The refused 'Purple' in Red/Green."
  describe("the closed-list check", () => {
    test("a value of the list is taken exactly; one that is not is refused with the list's own sentence", () => {
      expect(checkChoice("Green", ["Red", "Green"])).toEqual({ ok: true, value: "Green" });
      expect(checkChoice("Purple", ["Red", "Green"])).toEqual({ ok: false, why: "Purple is not in this list" });
      expect(parseEdit(planOf("a:helpPictureKind"), "Purple", "en-US")).toEqual({ ok: false, why: "Purple is not in this list" });
      // The list is matched exactly: another case, or a space, is another value.
      expect(checkChoice("green", ["Red", "Green"]).ok).toBe(false);
      expect(checkChoice("Green ", ["Red", "Green"]).ok).toBe(false);
      expect(checkChoice("", ["Red", "Green"])).toEqual({ ok: true, value: null });
    });
  });

  describe("the other editors", () => {
    test("a number field parses by its range, a date field by the calendar, a yes-or-no field takes true and false", () => {
      expect(parseEdit(planOf("a:berthCount"), "1.5", "en-US")).toEqual({ ok: false, why: '"1.5" is not a whole number' });
      expect(parseEdit(planOf("a:askingPrice"), "1,5", "de-DE")).toEqual({ ok: true, value: 1.5 });
      expect(parseEdit(planOf("a:dripStartDate"), "2026-12-31", "en-US")).toEqual({ ok: true, value: "2026-12-31" });
      expect(parseEdit(planOf("a:madeForKids"), "true", "en-US")).toEqual({ ok: true, value: true });
      expect(parseEdit(planOf("a:madeForKids"), "false", "en-US")).toEqual({ ok: true, value: false });
      expect(parseEdit(planOf("a:madeForKids"), "", "en-US")).toEqual({ ok: true, value: null });
      expect(parseEdit(planOf("a:madeForKids"), "maybe", "en-US").ok).toBe(false);
    });
  });

  // Spec: step 2 brief 4, On a 412: "Re-read the record. If the field still holds the value the edit started from, send again with the
  // new ETag ... If it already holds the typed value, it counts as saved. Otherwise show the conflict state ... Never overwrite without
  // asking." Value Concurrency.LostUpdate.
  describe("decideAfterStale", () => {
    test("the decision table: base equals server, server equals typed, both differ", () => {
      expect(decideAfterStale({ base: "A", typed: "B", server: "A" })).toBe("retry");
      expect(decideAfterStale({ base: "A", typed: "B", server: "B" })).toBe("saved");
      expect(decideAfterStale({ base: "A", typed: "B", server: "C" })).toBe("conflict");
    });

    test("with absent values: a field cleared by someone else, a field given a value by someone else, and a clear against a change", () => {
      expect(decideAfterStale({ base: null, typed: "B", server: null })).toBe("retry");
      expect(decideAfterStale({ base: null, typed: "B", server: "C" })).toBe("conflict");
      expect(decideAfterStale({ base: "A", typed: null, server: null })).toBe("saved");
      expect(decideAfterStale({ base: "A", typed: null, server: "C" })).toBe("conflict");
      expect(decideAfterStale({ base: "A", typed: "B", server: null })).toBe("conflict");
    });

    test("an empty text is not an absent value, a number is not its text, and a field that became a list or a link is a conflict", () => {
      expect(decideAfterStale({ base: null, typed: "B", server: "" })).toBe("conflict");
      expect(decideAfterStale({ base: 1, typed: 2, server: "1" })).toBe("conflict");
      expect(decideAfterStale({ base: 1, typed: 2, server: 1 })).toBe("retry");
      expect(decideAfterStale({ base: "A", typed: "B", server: undefined })).toBe("conflict");
    });

    test("when the server holds what was typed it counts as saved even if that is also the base (nothing to send)", () => {
      expect(decideAfterStale({ base: "A", typed: "A", server: "A" })).toBe("saved");
    });
  });

  // Spec: step 2 brief 5 and 6: Failure and Refusals; Rule_Code_gilb-app-failure-truth RuleBasefailCorsIsNotAStatus ("a refused
  // cross-origin call has no status code ... detect the failed fetch itself").
  describe("problemOf", () => {
    const cell = { label: "helpPictureKind", typed: "Purple" as const };
    test("no answer at all (offline, or a cross-origin call the browser refused) is the failed state with Retry", () => {
      expect(problemOf({ kind: "network", message: "Failed to fetch" }, cell)).toEqual({ state: "failed", message: "Not saved: no connection. Retry", retry: true, keepsTyped: true });
    });

    test("a 5xx keeps the typed value, says the vault's own words and offers Retry", () => {
      expect(problemOf({ kind: "http", status: 503, message: "The vault is restarting" }, cell)).toEqual({ state: "failed", message: "Not saved: The vault is restarting. Retry", retry: true, keepsTyped: true });
      expect(problemOf({ kind: "http", status: 500 }, cell).message).toBe("Not saved: the vault answered 500. Retry");
    });

    test("422 ValueNotAllowedError is the closed-list state; 422 RequiredSlotMissingError leaves the cell uncleared and names the field", () => {
      expect(problemOf({ kind: "http", status: 422, error: "ValueNotAllowedError", message: "a:helpPictureKind takes Red or Green" }, cell)).toEqual({ state: "not-in-list", message: "Purple is not in this list", retry: false, keepsTyped: true });
      expect(problemOf({ kind: "http", status: 422, error: "RequiredSlotMissingError" }, { label: "stock note", typed: null })).toEqual({ state: "required", message: "stock note is required", retry: false, keepsTyped: false });
    });

    test("403 is the read-only state with the vault's reason; 404 says the record is no longer there", () => {
      expect(problemOf({ kind: "http", status: 403, error: "WriteForbiddenError", message: "You do not have write access to this record." }, cell)).toEqual({ state: "read-only", message: "You do not have write access to this record.", retry: false, keepsTyped: false });
      expect(problemOf({ kind: "http", status: 403 }, cell).message).toBe("You can read this record but not change it");
      expect(problemOf({ kind: "http", status: 404 }, cell)).toEqual({ state: "gone", message: "This record is no longer there", retry: false, keepsTyped: false });
    });

    test("409 UndefinedTermError, and any other refusal, shows the vault's own words and keeps what was typed", () => {
      expect(problemOf({ kind: "http", status: 409, error: "UndefinedTermError", message: "a:helpPictureKind is not a defined term" }, cell)).toEqual({ state: "refused", message: "Not saved: a:helpPictureKind is not a defined term", retry: false, keepsTyped: true });
      expect(problemOf({ kind: "http", status: 400, error: "InvalidDatomError" }, cell).message).toBe("Not saved: the vault answered 400 InvalidDatomError");
    });

    test("a 401 says the person is signed out, and can be tried again after signing in", () => {
      expect(problemOf({ kind: "http", status: 401 }, cell)).toMatchObject({ state: "failed", retry: true, keepsTyped: true });
    });
  });

  // Spec: step 2 brief 11, Keyboard: "Arrows move the selection. Enter edits. Enter again saves and moves down. Tab saves and moves
  // right. Esc cancels and restores the stored value. Typing a character starts an edit that replaces the value." And 9, Checkbox:
  // "Space or Enter toggles it and saves at once." Step 1: Space opens the row's record.
  describe("the keyboard", () => {
    const nav = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({ key, mode: "nav", editable: true, editor: "text", ...extra });
    const edit = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({ key, mode: "edit", editable: true, editor: "text", ...extra });

    test("while moving: the arrows move the selection by one cell", () => {
      expect(keyAct(nav("ArrowDown"))).toEqual({ act: "move", rows: 1, cols: 0 });
      expect(keyAct(nav("ArrowUp"))).toEqual({ act: "move", rows: -1, cols: 0 });
      expect(keyAct(nav("ArrowRight"))).toEqual({ act: "move", rows: 0, cols: 1 });
      expect(keyAct(nav("ArrowLeft"))).toEqual({ act: "move", rows: 0, cols: -1 });
      expect(keyAct(nav("PageDown"))).toEqual({ act: "page", direction: 1 });
      expect(keyAct(nav("PageUp"))).toEqual({ act: "page", direction: -1 });
      expect(keyAct(nav("Home"))).toEqual({ act: "edge", to: "first-row" });
      expect(keyAct(nav("End"))).toEqual({ act: "edge", to: "last-row" });
    });

    test("while moving: Enter edits, a typed character starts an edit that replaces the value, Delete and Backspace clear", () => {
      expect(keyAct(nav("Enter"))).toEqual({ act: "edit" });
      expect(keyAct(nav("a"))).toEqual({ act: "edit", replaceWith: "a" });
      expect(keyAct(nav("7", { editor: "number" }))).toEqual({ act: "edit", replaceWith: "7" });
      expect(keyAct(nav("é"))).toEqual({ act: "edit", replaceWith: "é" });
      expect(keyAct(nav("😀"))).toEqual({ act: "edit", replaceWith: "😀" });
      expect(keyAct(nav("Delete"))).toEqual({ act: "clear" });
      expect(keyAct(nav("Backspace"))).toEqual({ act: "clear" });
    });

    test("while moving: Space opens the row's record, except on a yes-or-no cell, where Space and Enter change it", () => {
      expect(keyAct(nav(" "))).toEqual({ act: "open" });
      expect(keyAct(nav(" ", { editable: false, editor: null }))).toEqual({ act: "open" });
      expect(keyAct(nav(" ", { editor: "checkbox" }))).toEqual({ act: "toggle" });
      expect(keyAct(nav("Enter", { editor: "checkbox" }))).toEqual({ act: "toggle" });
      expect(keyAct(nav("x", { editor: "checkbox" }))).toEqual({ act: "none" });
      // A read-only yes-or-no cell is not changed by Space: Space opens the record, as on any cell.
      expect(keyAct(nav(" ", { editable: false, editor: "checkbox" }))).toEqual({ act: "open" });
    });

    test("on a cell that may not be edited, Enter, a character and Delete say why and change nothing", () => {
      const ro = { editable: false, editor: null } as const;
      expect(keyAct(nav("Enter", ro))).toEqual({ act: "explain" });
      expect(keyAct(nav("a", ro))).toEqual({ act: "explain" });
      expect(keyAct(nav("Delete", ro))).toEqual({ act: "explain" });
      expect(keyAct(nav("ArrowDown", ro))).toEqual({ act: "move", rows: 1, cols: 0 });
    });

    test("while moving: a named key, a shortcut and Tab are not the table's", () => {
      for (const key of ["Shift", "Control", "F2", "CapsLock", "Tab", "Escape", "Dead"]) expect(keyAct(nav(key)), key).toEqual({ act: "none" });
      expect(keyAct(nav("c", { command: true }))).toEqual({ act: "none" });
      expect(keyAct(nav("a", { alt: true }))).toEqual({ act: "none" });
    });

    test("while typing: Enter saves and moves down, Tab saves and moves right, Shift reverses, Escape gives the edit up", () => {
      expect(keyAct(edit("Enter"))).toEqual({ act: "commit", then: "down" });
      expect(keyAct(edit("Enter", { shift: true }))).toEqual({ act: "commit", then: "up" });
      expect(keyAct(edit("Tab"))).toEqual({ act: "commit", then: "right" });
      expect(keyAct(edit("Tab", { shift: true }))).toEqual({ act: "commit", then: "left" });
      expect(keyAct(edit("Escape"))).toEqual({ act: "cancel" });
    });

    test("while typing: every other key is the editor's, and so is Alt+Enter (a new line) and a key of an input method", () => {
      for (const key of ["a", " ", "ArrowLeft", "ArrowDown", "Backspace", "Delete", "Home", "z"]) expect(keyAct(edit(key)), key).toEqual({ act: "none" });
      expect(keyAct(edit("Enter", { alt: true }))).toEqual({ act: "none" });
      expect(keyAct(edit("Enter", { composing: true }))).toEqual({ act: "none" });
      expect(keyAct(nav("a", { composing: true }))).toEqual({ act: "none" });
    });

    test("the selection: a move stops at the table's edges, an edit is entered and left, a commit moves on", () => {
      const size = { rows: 3, cols: 4, pageRows: 2 };
      const at00 = { row: 0, col: 0, mode: "nav" as const };
      expect(nextGridState(at00, { act: "move", rows: -1, cols: 0 }, size)).toEqual(at00);
      expect(nextGridState(at00, { act: "move", rows: 0, cols: -1 }, size)).toEqual(at00);
      expect(nextGridState({ row: 2, col: 3, mode: "nav" }, { act: "move", rows: 1, cols: 1 }, size)).toEqual({ row: 2, col: 3, mode: "nav" });
      expect(nextGridState(at00, { act: "move", rows: 1, cols: 1 }, size)).toEqual({ row: 1, col: 1, mode: "nav" });
      expect(nextGridState(at00, { act: "page", direction: 1 }, size)).toEqual({ row: 2, col: 0, mode: "nav" });
      expect(nextGridState({ row: 1, col: 2, mode: "nav" }, { act: "edge", to: "last-row" }, size)).toEqual({ row: 2, col: 2, mode: "nav" });
      expect(nextGridState({ row: 1, col: 2, mode: "nav" }, { act: "edge", to: "first-row" }, size)).toEqual({ row: 0, col: 2, mode: "nav" });
      const typing = nextGridState({ row: 1, col: 1, mode: "nav" }, { act: "edit", replaceWith: "x" }, size);
      expect(typing).toEqual({ row: 1, col: 1, mode: "edit" });
      expect(nextGridState(typing, { act: "commit", then: "down" }, size)).toEqual({ row: 2, col: 1, mode: "nav" });
      expect(nextGridState(typing, { act: "commit", then: "right" }, size)).toEqual({ row: 1, col: 2, mode: "nav" });
      expect(nextGridState({ row: 2, col: 3, mode: "edit" }, { act: "commit", then: "down" }, size)).toEqual({ row: 2, col: 3, mode: "nav" });
      expect(nextGridState(typing, { act: "cancel" }, size)).toEqual({ row: 1, col: 1, mode: "nav" });
      expect(nextGridState(typing, { act: "none" }, size)).toBe(typing);
    });

    test("a whole pass: Enter, type, Enter saves and moves down; then a character replaces; Escape restores", () => {
      const size = { rows: 5, cols: 3 };
      let state = { row: 0, col: 1, mode: "nav" as "nav" | "edit" };
      const press = (key: string) => {
        const act = keyAct({ key, mode: state.mode, editable: true, editor: "text" });
        state = nextGridState(state, act, size);
        return act.act;
      };
      expect(["Enter", "h", "i", "Enter"].map(press)).toEqual(["edit", "none", "none", "commit"]);
      expect(state).toEqual({ row: 1, col: 1, mode: "nav" });
      expect(["x", "Escape"].map(press)).toEqual(["edit", "cancel"]);
      expect(state).toEqual({ row: 1, col: 1, mode: "nav" });
      expect(["Enter", "Tab"].map(press)).toEqual(["edit", "commit"]);
      expect(state).toEqual({ row: 1, col: 2, mode: "nav" });
    });
  });
});
