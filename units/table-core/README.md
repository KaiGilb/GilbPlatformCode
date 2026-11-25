Needs: base-record, entity-ref, type-fields, vocabulary-source

# table-core

A table over vault records with no screen: one type's fields and records in; columns, one row per record and one cell per fact out.

## What this is

A table over vault records with no screen: one type's fields and records in; columns, one row per record and one cell per fact out.

Plain functions and types, no React, no network. A table is one type read in one vault. A row is one record. A column is one field of the type. A cell is one fact, and where the record holds no fact the cell is empty: nothing is put in its place.

- `buildTable({ fields, records, nameOf, nameLabel? })`: the table, as `TableModel`: `typeAnchor` (`t:<Type>`), `columns` and `rows`. `fields` is the `TypeFields` of the `type-fields` unit. `records` are `BaseRecord`s (the `base-record` unit). `nameOf(record)` is the host's own name for a record. There is one row per record given, in the order given, and each row holds the very record object it was given (`row.record`). Records are not sorted, filtered, merged or dropped. A type with no record gives the columns and no rows.
- `columnsOf(fields, nameLabel?)`: the columns. The Name column is first and frozen (`id` is `NAME_COLUMN_ID`, `field` is null). Then one column per field, in the field reader's order; a column's `id` is the field's anchor (`a:<slug>`).
- `cellOf(record, field)`: one cell. The values are read from the record's served document (`record.served.facts`), where a link is still a link and a list is still a list.
  - A field whose term says `single` or `multi` is read with `readList` (the `vocabulary-source` unit). A `multi` field is always a list, whether the vault sent one bare value or several.
  - A field whose term states neither is shown as stored: one value as a value, several as a list.
  - A record with no served document shows its flattened strings; a string that stands in for a value with no text form, and every field of a record whose content was not read, is `unread`, never empty.
- `cellText(cell)`: a cell as plain text.
- `narrowColumns(columns, max?)`: the first `max` (default 3) field columns, for a narrow screen that lists them under each row's name.
- `rowLimitNotice({ shown, limit, complete, total? })`: the footer line of a table cut at the row limit, or null. It is given only when the rows on screen reached the limit and the read did not reach the end: `first 1000 of 2500 — filter to narrow` when `total` is an exact count above the rows on screen, `first 1000 — filter to narrow` when the total is a floor or was not given.
- `NAME_COLUMN_ID`, and the types `Cell`, `TableColumn`, `TableRow`, `TableModel`, `BuildTableInput`, `KnownTotal`, `RowLimitInput`.

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
import { readTypeFields } from "@kaigilb/gilbplatformcode-type-fields";
import { buildTable, rowLimitNotice } from "@kaigilb/gilbplatformcode-table-core";

const fields = await readTypeFields({ vedaOrigin: "https://ontology.platform.example.test" }, "GarmentStockLine");
const table = buildTable({ fields, records, nameOf: (r) => r.facts.label ?? "" });
const footer = rowLimitNotice({ shown: table.rows.length, limit: 1000, complete: listReachedItsEnd, total: null });
```

## What the host must supply

- The type's fields (`TypeFields`), the records (`BaseRecord[]`, with their served documents for full cells) and a name for a record.
- For the footer: the row limit of its read, whether the read reached the end, and the vault's count for the type when a read gave one, with whether it is exact.

## Module state

None.

## Do not

- Do not put a dash, "n/a" or a default into an `empty` cell. It is the statement that there is no fact.
- Do not show an `unread` cell as empty.
- Do not build a name for a `ref` from the tail of its address. Resolve it, or show that it is not resolved.
- Do not give `rowLimitNotice` a count you worked out yourself. Give it what a read said, and say whether it is exact.

## Wrong readings

- "`rows.length` is the number of records in the vault." It is the number of records given.
- "A `list` of one is a mistake." A `multi` field with one value is a list of one.
- "No footer means everything is loaded." It means the table was not cut at the row limit. A read can be incomplete for other reasons, which the host states.

## Where it came from

New code, written for the table view (GilbApp, Solution TableView.SameRecords, delivery step 1). It uses `readList` of `vocabulary-source`, `entityRefFromFact` of `entity-ref`, and the types of `base-record` and `type-fields`.

Tests (`src/tableCore.test.ts`, 26): an empty fact gives an empty cell; a multi value is a list; a link is a reference; rows equal the records; a type with no records gives headers and no rows; the footer appears at 1000 rows and not at 999. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
