Needs: base-record, entity-ref, type-fields, vocabulary-source

# table-core

A table over vault records with no screen: one type's fields and records in; columns, one row per record and one cell per fact out.

## What this is

A table over vault records with no screen: one type's fields and records in; columns, one row per record and one cell per fact out.

Plain functions and types, no React, no network. A table is one type read in one vault. A row is one record. A column is one field of the type, or a fact some loaded record holds that the type's own fields do not cover. A cell is one fact, and where the record holds no fact the cell is empty: nothing is put in its place.

- `buildTable({ fields, records, nameOf, nameLabel?, otherFields? })`: the table, as `TableModel`: `typeAnchor` (`t:<Type>`), `columns` and `rows`. `fields` is the `TypeFields` of the `type-fields` unit. `records` are `BaseRecord`s (the `base-record` unit). `nameOf(record)` is the host's own name for a record. `otherFields` is the field reader's `fieldIndex`. There is one row per record given, in the order given, and each row holds the very record object it was given (`row.record`). Records are not sorted, filtered, merged or dropped. A type with no record gives the type's columns and no rows.
- **Columns, in this order.** (1) Name, first and frozen (`id` is `NAME_COLUMN_ID`). (2) Every field of the type, in the field reader's order, whether or not a record holds a value (`source: "type"`, `id` is the field's anchor `a:<slug>`). (3) One column for each fact a loaded record holds outside those fields, so every value a record holds is on screen: a key `otherFields` knows is drawn with its field's heading and read by its field's rules (`source: "other"`, sorted by heading; the prefixed and the bare key of one field are one column); any other key is headed by the key and shown as stored (`source: "stored"`, `id` is `stored:` and the key, sorted by key). A column of the third group exists only while a loaded record holds a value. Two are left out, because neither would put anything on screen that is not there: one whose every held value is the row's own name (by value, not by key: the Name column already shows it; one row that differs brings the column back), and one whose every held value is blank text.
- `columnsOf(fields, nameLabel?)`: Name and the type's own fields alone.
- `cellOf(record, field)`: one cell. The values are read from the record's served document (`record.served.facts`), where a link is still a link and a list is still a list.
  - A field whose term says `single` or `multi` is read with `readList` (the `vocabulary-source` unit). A `multi` field is always a list, whether the vault sent one bare value or several.
  - A field whose term states neither is shown as stored: one value as a value, several as a list.
  - A record with no served document shows its flattened strings; a string that stands in for a value with no text form, and every field of a record whose content was not read, is `unread`, never empty.
- `cellOfColumn(record, column)`: one cell under any column. In a `stored` column the value is shown as stored; a text that is the address of a record is a `ref`, as a card shows it.
- `cellText(cell)`: a cell as plain text.
- `narrowColumns(columns, max?)`: the first `max` (default 3) columns after Name.
- `narrowFieldsOfRow(columns, cells, max?)` (since 0.1.1): what a narrow screen lists under ONE row's name: the first `max` (default 3) columns, in column order, that hold a value in that row, each with the row's cell. A row that holds nothing lists nothing. `cellHoldsValue(cell)` is its test: any cell but an empty one and blank text (a stored `false` or `0` is a value).

### Editing one cell (since 0.2.0, `src/cellEdit.ts`)

Pure rules for editing the value of one existing cell. Nothing here writes or draws; a host hands the patch to its own write path.

- `editabilityOf(column, cell, { systemKeys? })`: an `EditPlan` (`editor`: `text`, `number`, `date`, `checkbox` or `choice`; `integer`; `options`; `required`; `writeKey`; `label`) or `{ editable: false, reason }`. In scope: one plain value of a text, number, date, yes-or-no or closed-list field. Read-only, each with its sentence (`READ_ONLY_REASON`): the Name column, a link ("Links are changed on the card for now"), a field with several values, a date with a time, any other kind, a value no field describes, a field with no single write key, a field the host names as set by the vault, an unread value. A field whose term states no cardinality is edited as one value while its cell holds one or none.
- `parseEdit(plan, text, locale)`: typed text as the value to store, or why it is not written. Text is stored exactly as typed (no trimming); only empty text is "no value" (`null`). `parseNumberInput` reads the locale's own decimal and grouping marks from `Intl` (`1,234.5` in en, `1.234,5` in de), groups only in threes, refuses what can be read in two ways, stores `-0` as 0 and `1e3` as 1000, and checks whole numbers. `parseDateInput` keeps `YYYY-MM-DD` as text and checks the calendar by arithmetic, never through a `Date`. `checkChoice` checks a closed list ("<value> is not in this list"). A required field cannot be cleared ("<field> is required").
- `valueText(value, locale)`, `formatNumber(value, locale)`: what a stored value reads as and what its editor starts with; that text parses back to the same value.
- `storedValueOf(cell)`, `sameCellValue(a, b)`: the plain value of a cell (`null`: no fact; a stored `""` is a value), and equality of two.
- `cellPatch(writeKey, value)`: the merge-patch of one edit: that one field. Clearing sends `null`; `""` is never sent.
- `decideAfterStale({ base, typed, server })`: after a 412 and a re-read: `retry` (the field still holds what the edit started from), `saved` (it already holds what was typed) or `conflict` (show both and ask; never overwrite).
- `problemOf(failure, { label, typed })`: what a failed write means for the cell (`failed` with Retry for no answer at all or a 5xx; `not-in-list`; `required`; `read-only` for 403; `gone` for 404; `refused` with the vault's own words), whether Retry helps and whether the typed value stays.
- `keyAct(input)`, `nextGridState(state, act, size)`: what a key does while moving and while typing, and where the selection goes.
- `NAME_COLUMN_ID`, and the types `Cell`, `ColumnSource`, `TableColumn`, `TableRow`, `TableModel`, `BuildTableInput`.

A `Cell` is one of:

| `kind` | Meaning |
|---|---|
| `empty` | the record holds no fact under this field |
| `value` | a string, number or boolean (`0`, `false` and `""` are facts); `text` is what a screen shows |
| `ref` | a link: `uri`, `id` (the record id when the address is a record's, else null) and `known` (false for a short form the document does not declare, which is shown as stored and never expanded) |
| `list` | several values in stored order; every member is kept |
| `object` | a structured value with no plain reading, as its JSON text |
| `unread` | the fact could not be read; `reason` says why |

A link (`{"@id": …}`) is a `ref` under any field. A plain address is a `ref` only under a field whose term says it holds links; under a text or address field it is the text that was stored.

## What this is not

- Not a screen: `table-react` draws the table.
- Not a reader of the vault or the master: the host reads the records and the fields and hands them in.
- Not a sort, a filter or a saved view.
- Not the notice of a list that is cut short. The host says that with its own notice, where it already has one.
- Not a check that a field's type is above the table's type. A fact under a field of any other type is shown with that field's heading; the unit asks the master nothing.
- Not a namer of records or links. The host's `nameOf` names a row; a `ref` cell carries the address, and the screen's host names it.
- Not an editor: nothing here writes.

## How to take it

Package: `@kaigilb/gilbplatformcode-table-core`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/table-core` prints:

```sh
npm install --install-links <path-to-the-library>/units/table-core
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```ts
import { fieldIndex, readFieldDeclarations, fieldsOfType } from "@kaigilb/gilbplatformcode-type-fields";
import { buildTable } from "@kaigilb/gilbplatformcode-table-core";

const declarations = await readFieldDeclarations({ vedaOrigin: "https://ontology.platform.example.test" });
const table = buildTable({
  fields: fieldsOfType(declarations, "GarmentStockLine"),
  records,
  nameOf: (r) => r.facts.label ?? "",
  otherFields: fieldIndex(declarations), // build it once and keep it with the declarations
});
```

## What the host must supply

- The type's fields (`TypeFields`), the records (`BaseRecord[]`, with their served documents for full cells) and a name for a record.
- Optionally `otherFields`, the field reader's `fieldIndex`, kept by the host beside the declarations it was built from.

## Module state

None.

## Do not

- Do not put a dash, "n/a" or a default into an `empty` cell. It is the statement that there is no fact.
- Do not show an `unread` cell as empty.
- Do not build a name for a `ref` from the tail of its address. Resolve it, or show that it is not resolved.
- Do not read an `other` column as "a field of this type". It is a fact a record here holds; `source` says so.
- Do not expect a column of the third group to stay: when no loaded record holds a value any more, it is gone.

## Wrong readings

- "`rows.length` is the number of records in the vault." It is the number of records given.
- "A `list` of one is a mistake." A `multi` field with one value is a list of one.
- "The columns are the type's fields." They are the type's fields and every other fact a loaded record holds. Two readings of one type can differ in the columns after the type's own.

## Where it came from

New code, written for the table view (GilbApp, Solution TableView.SameRecords, delivery step 1). It uses `readList` of `vocabulary-source`, `entityRefFromFact` of `entity-ref`, and the types of `base-record` and `type-fields`.

Tests: `src/cellEdit.test.ts` (47: editability by kind and each read-only reason; number parse in en, de, fr and nb; dates at UTC−12 and UTC+14; text of 10 000 characters, spaces, emoji, right-to-left, combining marks and control characters; empty against absent; the closed list; the 412 decision table; each failure as a cell state; the keys). `src/tableCore.test.ts` (36): an empty fact gives an empty cell; a multi value is a list; a link is a reference; rows equal the records; a type with no records gives headers and no rows; a fact outside the type's own fields is a column only while a record holds a value, after the type's own. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
