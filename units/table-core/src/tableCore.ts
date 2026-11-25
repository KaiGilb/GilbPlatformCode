// A table over vault records, with no screen: one type, its fields and its records in; columns, rows and cells out.
//
// A table is one type read in one vault. A row is one record. A column is one field of the type. A cell is one fact, and where the
// record holds no fact the cell is empty: nothing is put in its place. This file draws nothing and asks nothing of the network.

import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import type { TypeField, TypeFields } from "@kaigilb/gilbplatformcode-type-fields";
import { readList } from "@kaigilb/gilbplatformcode-vocabulary-source";

/** The id of the Name column: always the first column, always frozen. */
export const NAME_COLUMN_ID = "name";

/** One cell: one fact of one record under one field, or the statement that there is none. */
export type Cell =
  /** The record holds no fact under this field. */
  | { kind: "empty" }
  /** A plain value. `text` is what a screen shows. */
  | { kind: "value"; value: string | number | boolean; text: string }
  /**
   * A link to another record or term. `id` is the record's id when `uri` is a record address, else null.
   * `known` is false for a short form the document does not declare (`t:…`, `base:…`, a path with no scheme): an unknown address, which
   * is shown as stored and never expanded, matched or resolved.
   */
  | { kind: "ref"; uri: string; id: string | null; known: boolean }
  /** Several values under one field, in stored order. Every member is kept. */
  | { kind: "list"; items: Cell[] }
  /** A structured value with no plain reading, kept as its JSON text. */
  | { kind: "object"; json: string }
  /** The fact could not be read, which is not the same as there being none. `reason` says why. */
  | { kind: "unread"; reason: string };

/** One column. The Name column has no field; every other column is one field of the type. */
export interface TableColumn {
  /** {@link NAME_COLUMN_ID}, or the field's anchor (`a:<slug>`). */
  id: string;
  label: string;
  /** The field this column shows; null for the Name column. */
  field: TypeField | null;
  /** True for the Name column: it stays in place when the table scrolls sideways. */
  frozen: boolean;
}

/** One row: one record. */
export interface TableRow<R extends BaseRecord = BaseRecord> {
  /** The record's id. */
  id: string;
  /** The same record object the table was given, so a host can hand it on without reading it again. */
  record: R;
  /** The record's name, from the host's own naming function. */
  name: string;
  /** One cell per field column, in column order (the Name column has no cell: it is `name`). */
  cells: Cell[];
}

export interface TableModel<R extends BaseRecord = BaseRecord> {
  /** The type's anchor, `t:<Type>`. */
  typeAnchor: string;
  /** The Name column first, then one column per field. */
  columns: TableColumn[];
  /** One row per record given, in the order given. */
  rows: TableRow<R>[];
}

export interface BuildTableInput<R extends BaseRecord> {
  /** The type's fields, from the field reader. */
  fields: TypeFields;
  records: readonly R[];
  /** The host's name for a record (the same one its cards and lists show). */
  nameOf: (record: R) => string;
  /** The heading of the Name column. Default "Name". */
  nameLabel?: string;
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

/**
 * One stored value as a cell. A link (`{"@id": …}`) is a reference under any field. A plain address is a reference only under a field
 * whose term says it holds links: under a text or address field it is the text that was stored.
 */
function valueCell(value: unknown, field: TypeField): Cell {
  if (value === undefined || value === null) return EMPTY;
  if (typeof value === "string") {
    if (field.kind === "reference" && value.trim() !== "") return refCell(value);
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
function listCell(values: readonly unknown[], field: TypeField): Cell {
  const items = values.filter((v) => v !== undefined && v !== null).map((v) => valueCell(v, field));
  if (items.length === 0) return EMPTY;
  return { kind: "list", items };
}

/**
 * The facts of a record as the vault served them (a link stays a link, a list stays a list), or null when the record carries no served
 * document.
 */
function servedFacts(record: BaseRecord): Readonly<Record<string, unknown>> | null {
  return record.served ? record.served.facts : null;
}

/**
 * The cell of one record under one field.
 *
 * A field whose term says `single` or `multi` is read with `readList`: a `multi` field is always a list, whether the vault sent no value,
 * one bare value or several. A field whose term states neither is shown as stored (one value as a value, several as a list); that is
 * what the vault holds, and no cardinality is claimed for it.
 */
export function cellOf(record: BaseRecord, field: TypeField): Cell {
  const served = servedFacts(record);
  if (served === null) {
    // No served document: the row's content was not read (a row known by name only), or only the flattened strings are in hand.
    const flat = record.facts;
    for (const key of field.readKeys) {
      if (!(key in flat)) continue;
      if (record.opaqueFacts.includes(key)) return { kind: "unread", reason: "This value has no plain text form, and the record's full content is not loaded." };
      const text = flat[key];
      if (text !== undefined && text !== "") return valueCell(text, field);
    }
    if ((record as { hydrated?: boolean }).hydrated === false) return { kind: "unread", reason: "This record's content is not loaded." };
    return EMPTY;
  }
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
  const stored: unknown[] = [];
  for (const key of field.readKeys) {
    const v = served[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) stored.push(...v);
    else stored.push(v);
  }
  if (stored.length === 0) return EMPTY;
  if (stored.length === 1) return valueCell(stored[0], field);
  return listCell(stored, field);
}

/** The columns of a type: Name first and frozen, then one per field, in the field reader's order. */
export function columnsOf(fields: TypeFields, nameLabel = "Name"): TableColumn[] {
  return [
    { id: NAME_COLUMN_ID, label: nameLabel, field: null, frozen: true },
    ...fields.fields.map((field): TableColumn => ({ id: field.anchor, label: field.label, field, frozen: false })),
  ];
}

/**
 * The table of one type: its columns, and one row per record given, in the order given. Records are not sorted, filtered, merged or
 * dropped here; a type with no record gives the columns and no rows.
 */
export function buildTable<R extends BaseRecord>(input: BuildTableInput<R>): TableModel<R> {
  const columns = columnsOf(input.fields, input.nameLabel);
  const fieldColumns = columns.filter((c): c is TableColumn & { field: TypeField } => c.field !== null);
  const rows = input.records.map((record): TableRow<R> => ({
    id: record.id,
    record,
    name: input.nameOf(record),
    cells: fieldColumns.map((c) => cellOf(record, c.field)),
  }));
  return { typeAnchor: input.fields.typeAnchor, columns, rows };
}

/** A cell as plain text, for a tooltip, a narrow list or a copy. A link is its address (a screen that can name it shows the name). */
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

/** The columns a narrow screen lists under each row's name: the first `max` field columns (the Name column is the row's heading). */
export function narrowColumns(columns: readonly TableColumn[], max = 3): TableColumn[] {
  return columns.filter((c) => c.field !== null).slice(0, Math.max(0, max));
}

/** How many records of the type the vault holds, when a read said so. `exact: false` is a floor, not a count. */
export interface KnownTotal {
  count: number;
  exact: boolean;
}

export interface RowLimitInput {
  /** Rows on screen. */
  shown: number;
  /** The most rows the read loads. */
  limit: number;
  /** True when the read said it reached the end of the list. */
  complete: boolean;
  /** The vault's count for this type, when a read gave one; null or absent when none did. */
  total?: KnownTotal | null;
}

/**
 * The footer line of a table cut at the row limit, or null when it is not cut.
 *
 * It is shown only when the rows on screen reached the limit and the read did not reach the end. With an exact count above the rows on
 * screen it names the count; with a floor, or no count, it names none: a number is never made up.
 */
export function rowLimitNotice(input: RowLimitInput): string | null {
  if (input.complete || input.shown < input.limit) return null;
  const first = `first ${input.shown}`;
  const total = input.total;
  if (total && total.exact && Number.isInteger(total.count) && total.count > input.shown) return `${first} of ${total.count} — filter to narrow`;
  return `${first} — filter to narrow`;
}
