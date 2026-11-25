/**
 * A table over vault records, with no screen: one type, its fields and its records in; columns, rows and cells out.
 *
 * A table is one type read in one vault. A row is one record. A column is one field of the type, or a fact some loaded record holds
 * that the type's own fields do not cover. A cell is one fact, and where the record holds no fact the cell is empty: nothing is put in
 * its place. This file draws nothing and asks nothing of the network.
 */

import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import type { TypeField, TypeFields } from "@kaigilb/gilbplatformcode-type-fields";
import { readList } from "@kaigilb/gilbplatformcode-vocabulary-source";

/** The id of the Name column: always the first column, always frozen. */
export const NAME_COLUMN_ID = "name";

/** One cell: one fact of one record under one column, or the statement that there is none. */
export type Cell =
  /** The record holds no fact under this column. */
  | { kind: "empty" }
  /** A plain value. `text` is what a screen shows. */
  | { kind: "value"; value: string | number | boolean; text: string }
  /**
   * A link to another record or term. `id` is the record's id when `uri` is a record address, else null.
   * `known` is false for a short form the document does not declare (`t:…`, `base:…`, a path with no scheme): an unknown address, which
   * is shown as stored and never expanded, matched or resolved.
   */
  | { kind: "ref"; uri: string; id: string | null; known: boolean }
  /** Several values under one column, in stored order. Every member is kept. */
  | { kind: "list"; items: Cell[] }
  /** A structured value with no plain reading, kept as its JSON text. */
  | { kind: "object"; json: string }
  /** The fact could not be read, which is not the same as there being none. `reason` says why. */
  | { kind: "unread"; reason: string };

/**
 * Where a column comes from.
 * - `name`: the Name column.
 * - `type`: a field of the table's own type. Always a column, also when no record holds a value.
 * - `other`: a fact some loaded record holds under a field the type's own fields do not cover, whose term the host handed in (a field
 *   declared on another type, for example one above this type). A column only while a loaded record holds a value.
 * - `stored`: a fact some loaded record holds that no field term in hand describes. A column only while a loaded record holds a value.
 */
export type ColumnSource = "name" | "type" | "other" | "stored";

/** One column of a table. */
export interface TableColumn {
  /** {@link NAME_COLUMN_ID}; a field's anchor (`a:<slug>`); or, for a `stored` column, `stored:` and the key the record holds the fact under. */
  id: string;
  label: string;
  source: ColumnSource;
  /** The field this column shows; null for the Name column and for a `stored` column. */
  field: TypeField | null;
  /** For a `stored` column: the key the record holds the fact under, as the record cache keeps it. Null for every other column. */
  storedKey: string | null;
  /** True for the Name column: it stays in place when the table scrolls sideways. */
  frozen: boolean;
}

/** One row of a table: one record. */
export interface TableRow<R extends BaseRecord = BaseRecord> {
  /** The record's id. */
  id: string;
  /** The same record object the table was given, so a host can hand it on without reading it again. */
  record: R;
  /** The record's name, from the host's own naming function. */
  name: string;
  /** One cell per column after Name, in column order (the Name column has no cell: it is `name`). */
  cells: Cell[];
}

/** A table: its type, its columns and its rows. */
export interface TableModel<R extends BaseRecord = BaseRecord> {
  /** The type's anchor, `t:<Type>`. */
  typeAnchor: string;
  /** The Name column first, then the type's own fields, then the columns that exist because a loaded record holds a value. */
  columns: TableColumn[];
  /** One row per record given, in the order given. */
  rows: TableRow<R>[];
}

/** What {@link buildTable} is given. */
export interface BuildTableInput<R extends BaseRecord> {
  /** The type's fields, from the field reader. */
  fields: TypeFields;
  records: readonly R[];
  /** The host's name for a record (the same one its cards and lists show). */
  nameOf: (record: R) => string;
  /** The heading of the Name column. Default "Name". */
  nameLabel?: string;
  /**
   * Every field the host knows, by each key a stored fact of it may carry (the field reader's `fieldIndex`). A fact a loaded record
   * holds outside the type's own fields is drawn with its field's heading and read by its field's rules when its key is here; without
   * this, or for a key that is not in it, the fact is a `stored` column headed by its key.
   */
  otherFields?: ReadonlyMap<string, TypeField>;
}

const EMPTY: Cell = { kind: "empty" };

function refCell(uri: string): Cell {
  const address = uri.trim();
  const known = /^https?:\/\//i.test(address);
  let id: string | null = null;
  if (known) {
    try {
      id = entityRefFromFact(address)?.id ?? null;
    } catch {
      // An address whose percent-encoding is broken is still shown as stored; it names no record id.
      id = null;
    }
  }
  return { kind: "ref", uri: address, id, known };
}

/** True when a stored string is the address of a record. A broken percent-encoding is not an address. */
function isRecordAddress(text: string): boolean {
  try {
    return entityRefFromFact(text) !== null;
  } catch {
    return false;
  }
}

/**
 * One stored value as a cell. A link (`{"@id": …}`) is a reference under any column. A plain address is a reference under a field whose
 * term says it holds links; under a text or address field it is the text that was stored. With no field (a `stored` column) only the
 * address of a record is a reference, as a card shows it.
 */
function valueCell(value: unknown, field: TypeField | null): Cell {
  if (value === undefined || value === null) return EMPTY;
  if (typeof value === "string") {
    if (field === null ? isRecordAddress(value) : field.kind === "reference" && value.trim() !== "") return refCell(value);
    return { kind: "value", value, text: value };
  }
  if (typeof value === "number" || typeof value === "boolean") return { kind: "value", value, text: String(value) };
  if (Array.isArray(value)) return listCell(value, field);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o["@id"] === "string" && o["@id"].trim() !== "") return refCell(o["@id"]);
    const literal = o["@value"];
    if (typeof literal === "string" || typeof literal === "number" || typeof literal === "boolean") return { kind: "value", value: literal, text: String(literal) };
    return { kind: "object", json: JSON.stringify(value) };
  }
  return { kind: "object", json: String(value) };
}

/** Several stored values as one cell. None is an empty cell; every member is kept, also one this file has no plain reading of. */
function listCell(values: readonly unknown[], field: TypeField | null): Cell {
  const items = values.filter((v) => v !== undefined && v !== null).map((v) => valueCell(v, field));
  if (items.length === 0) return EMPTY;
  return { kind: "list", items };
}

/** What is stored under some keys, as stored: nothing is an empty cell, one value is a value, several are a list. */
function storedCell(facts: Readonly<Record<string, unknown>>, keys: readonly string[], field: TypeField | null): Cell {
  const stored: unknown[] = [];
  for (const key of keys) {
    const v = facts[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) stored.push(...v);
    else stored.push(v);
  }
  if (stored.length === 0) return EMPTY;
  if (stored.length === 1) return valueCell(stored[0], field);
  return listCell(stored, field);
}

/** The cell of a record that carries no served document: its flattened strings, and "unread" where those cannot answer. */
function flatCell(record: BaseRecord, keys: readonly string[], field: TypeField | null): Cell {
  const flat = record.facts;
  for (const key of keys) {
    if (!(key in flat)) continue;
    if (record.opaqueFacts.includes(key)) return { kind: "unread", reason: "This value has no plain text form, and the record's full content is not loaded." };
    const text = flat[key];
    if (text !== undefined && text !== "") return valueCell(text, field);
  }
  // A row known by its name only: its content was not read, which is not the same as holding no fact.
  if ((record as { hydrated?: boolean }).hydrated === false) return { kind: "unread", reason: "This record's content is not loaded." };
  return EMPTY;
}

/**
 * The cell of one record under one field.
 *
 * The value is read from the record's served document, where a link is still a link and a list is still a list. A field whose term says
 * `single` or `multi` is read with `readList`: a `multi` field is always a list, whether the vault sent no value, one bare value or
 * several. A field whose term states neither is shown as stored (one value as a value, several as a list); that is what the vault
 * holds, and no cardinality is claimed for it.
 *
 * @param record the record
 * @param field the field, from the field reader
 * @returns the cell; `unread` when the fact could not be read, never an empty cell for that
 */
export function cellOf(record: BaseRecord, field: TypeField): Cell {
  const served = record.served ? record.served.facts : null;
  if (served === null) return flatCell(record, field.readKeys, field);
  if (field.cardinality === "multi") {
    try {
      return listCell(readList(served, field.doc) as unknown[], field);
    } catch (e) {
      return { kind: "unread", reason: e instanceof Error ? e.message : String(e) };
    }
  }
  if (field.cardinality === "single") {
    try {
      return valueCell(readList(served, field.doc), field);
    } catch (e) {
      return { kind: "unread", reason: e instanceof Error ? e.message : String(e) };
    }
  }
  // The term does not say whether the field holds one value or several: show what is stored under its keys, as stored.
  return storedCell(served, field.readKeys, field);
}

/**
 * The cell of one record under one column.
 *
 * @param record the record
 * @param column a column of the record's table; the Name column has no cell and gives an empty one
 */
export function cellOfColumn(record: BaseRecord, column: TableColumn): Cell {
  if (column.field) return cellOf(record, column.field);
  if (column.storedKey === null) return EMPTY;
  const served = record.served ? record.served.facts : null;
  return served === null ? flatCell(record, [column.storedKey], null) : storedCell(served, [column.storedKey], null);
}

/**
 * The columns of a type alone: Name first and frozen, then one per field of the type, in the field reader's order.
 *
 * @param fields the type's fields
 * @param nameLabel the heading of the Name column (default "Name")
 */
export function columnsOf(fields: TypeFields, nameLabel = "Name"): TableColumn[] {
  return [
    { id: NAME_COLUMN_ID, label: nameLabel, source: "name", field: null, storedKey: null, frozen: true },
    ...fields.fields.map((field): TableColumn => ({ id: field.anchor, label: field.label, source: "type", field, storedKey: null, frozen: false })),
  ];
}

/** The keys a record holds a fact under: its served document's, or its flattened strings' when it carries none. */
function heldKeys(record: BaseRecord): string[] {
  if (record.served) return Object.keys(record.served.facts).filter((k) => record.served?.facts[k] !== undefined && record.served?.facts[k] !== null);
  return Object.keys(record.facts).filter((k) => record.facts[k] !== undefined && record.facts[k] !== "");
}

/**
 * The columns that exist only because a loaded record holds a value: every fact a record holds outside the type's own fields.
 *
 * A key the host's field index knows becomes an `other` column, with its field's heading and reading rules (several keys of one field
 * are one column). Any other key becomes a `stored` column, headed by the key. A column whose every value is the row's own name is
 * left out: that value is already on screen in the Name column. Order: `other` columns by heading, then `stored` columns by key.
 */
function usedColumns<R extends BaseRecord>(input: BuildTableInput<R>, names: readonly string[]): TableColumn[] {
  const own = new Set<string>();
  for (const field of input.fields.fields) for (const key of field.readKeys) own.add(key);
  const otherByTerm = new Map<string, TableColumn>();
  const storedByKey = new Map<string, TableColumn>();
  for (const record of input.records) {
    for (const key of heldKeys(record)) {
      if (own.has(key)) continue;
      const field = input.otherFields?.get(key) ?? null;
      if (field) {
        if (!otherByTerm.has(field.term)) otherByTerm.set(field.term, { id: field.anchor, label: field.label, source: "other", field, storedKey: null, frozen: false });
      } else if (!storedByKey.has(key)) {
        storedByKey.set(key, { id: `stored:${key}`, label: key, source: "stored", field: null, storedKey: key, frozen: false });
      }
    }
  }
  const found = [
    ...[...otherByTerm.values()].sort((a, b) => a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id, "en")),
    ...[...storedByKey.values()].sort((a, b) => a.id.localeCompare(b.id, "en")),
  ];
  // Two kinds of such a column are left out, because neither would put anything on screen that is not already there:
  //  - one whose every held value is the row's own name. The Name column, always first and always in view, already shows that value
  //    on that row (most records hold their name under `label`). ⚠ This is by value, not by key: if every record's Email happens to
  //    equal its name, there is no Email column either, and the value is still on screen, in Name. One row that differs brings the
  //    column back.
  //  - one whose every held value is blank text: there is nothing to read in it.
  return found.filter((column) => {
    for (let i = 0; i < input.records.length; i++) {
      const cell = cellOfColumn(input.records[i] as R, column);
      if (cell.kind === "empty" || (cell.kind === "value" && cell.text.trim() === "")) continue;
      if (cell.kind !== "value" || cell.text !== names[i]) return true;
    }
    // Every value held is the row's name or blank (or, after reading, none is held at all): no column.
    return false;
  });
}

/**
 * The table of one type.
 *
 * Columns: Name, then every field of the type (also when no record holds a value), then one column for each fact a loaded record holds
 * outside those fields, so that every value a record holds is on screen. Rows: one per record given, in the order given. Records are
 * not sorted, filtered, merged or dropped; a type with no record gives the type's columns and no rows.
 *
 * @param input the type's fields, the records, the host's naming function and, optionally, the host's index of every field
 * @returns the table
 */
export function buildTable<R extends BaseRecord>(input: BuildTableInput<R>): TableModel<R> {
  const names = input.records.map((record) => input.nameOf(record));
  const columns = [...columnsOf(input.fields, input.nameLabel), ...usedColumns(input, names)];
  const cellColumns = columns.slice(1);
  const rows = input.records.map((record, i): TableRow<R> => ({
    id: record.id,
    record,
    name: names[i] as string,
    cells: cellColumns.map((column) => cellOfColumn(record, column)),
  }));
  return { typeAnchor: input.fields.typeAnchor, columns, rows };
}

/**
 * A cell as plain text, for a tooltip, a narrow list or a copy. A link is its address (a screen that can name it shows the name).
 *
 * @param cell the cell
 * @returns its text; "" for an empty or unread cell
 */
export function cellText(cell: Cell): string {
  switch (cell.kind) {
    case "empty":
      return "";
    case "value":
      return cell.text;
    case "ref":
      return cell.uri;
    case "list":
      return cell.items.map(cellText).join(", ");
    case "object":
      return cell.json;
    case "unread":
      return "";
  }
}

/**
 * The columns a narrow screen lists under each row's name: the first `max` columns after Name (the Name column is the row's heading).
 *
 * @param columns a table's columns
 * @param max how many to list (default 3)
 */
export function narrowColumns(columns: readonly TableColumn[], max = 3): TableColumn[] {
  return columns.filter((c) => c.id !== NAME_COLUMN_ID).slice(0, Math.max(0, max));
}

/** True when a cell puts something on screen: any cell but an empty one and a value that is blank text. */
export function cellHoldsValue(cell: Cell | undefined): boolean {
  if (!cell || cell.kind === "empty") return false;
  return !(cell.kind === "value" && typeof cell.value === "string" && cell.value.trim() === "");
}

/** One column of a row on a narrow screen, with the row's cell under it. */
export interface NarrowField {
  column: TableColumn;
  cell: Cell;
}

/**
 * What a narrow screen lists under ONE row's name: the first `max` columns, in column order, that hold a value in that row, each with
 * its cell. A column the row holds nothing under is not listed (its heading alone would say nothing), so a row with no values lists
 * nothing and is its name alone.
 *
 * @param columns a table's columns
 * @param cells the row's cells (`TableRow.cells`: one per column after Name)
 * @param max how many to list (default 3)
 */
export function narrowFieldsOfRow(columns: readonly TableColumn[], cells: readonly Cell[], max = 3): NarrowField[] {
  const out: NarrowField[] = [];
  let at = 0;
  for (const column of columns) {
    if (column.id === NAME_COLUMN_ID) continue;
    const cell = cells[at];
    at += 1;
    if (out.length >= Math.max(0, max)) break;
    if (cell && cellHoldsValue(cell)) out.push({ column, cell });
  }
  return out;
}
