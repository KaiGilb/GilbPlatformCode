Needs: base-record, table-core

# table-react

A read-only table of vault records on screen: one row per record and one column per field, with only the rows in view drawn.

## What this is

A read-only table of vault records on screen: one row per record and one column per field, with only the rows in view drawn.

One component, `RecordTable`, built on TanStack Table (the column and row model) and TanStack Virtual (only the rows in view are in the page). It draws the `TableModel` that `table-core` built and nothing else.

- `RecordTable({ table, loading?, selectedId?, onOpenRow, renderRef?, footer?, narrow?, label?, rowHeight?, overscan? })`.
  - **Columns.** Name is the first column and stays in place when the table scrolls sideways. Every other column is one field, 190 px wide; Name is 280 px.
  - **Cells.** An empty cell holds nothing at all. A value is its text (a boolean reads Yes or No). A list shows each member in its own small box. A value with no plain reading is shown as its JSON text. A fact that was not read says "Not loaded", with the reason as its title.
  - **Links.** A link cell is drawn by the host: `renderRef({ uri, id })`. With no `renderRef` the stored address is shown (`data-ref-state="unresolved"`): a link is never given a made-up name. A short form the record does not explain is shown as stored (`data-ref-state="unknown"`) and is not handed to the host.
  - **Opening a row.** Space on a focused row, or the button at the left of the row (`aria-label="Open <name>"`), calls `onOpenRow(id)`. A click on the row does not open it. Arrow up and down move between rows; one row holds the Tab stop.
  - **Selected.** The row of `selectedId` is marked (`aria-selected="true"`).
  - **Loading.** With `loading`, or `table={null}`, the header and 12 rows are drawn as a skeleton in the real layout (`aria-busy="true"`). When the columns are already known the real header is drawn over skeleton rows of the same column widths. Rows given while loading are not drawn.
  - **Empty.** A table with no rows shows its column headers only. No words are put in their place.
  - **Footer.** `footer` is a line under the table (`role="status"`), for example `rowLimitNotice` of `table-core`.
  - **Narrow screen.** With `narrow` it is a list (`role="list"`): each row a button with the name and the first three field columns, each on its own line with its heading. A tap opens the record.
  - Test ids and marks: `record-table` (with `data-layout="grid"` or `"list"`), `record-table-skeleton`, `record-table-open`, `record-table-footer`; rows carry `data-row-id`, cells and headers `data-column-id`.
- Types: `RecordTableProps`, `TableRef`.

## What this is not

- Not the table's data: `table-core` builds it, and the host reads the records and the fields.
- Not an editor. No cell can be changed, no row or column added, nothing sorted or filtered.
- Not a card: the host opens its own card when `onOpenRow` is called.
- Not a namer of links: the host's `renderRef` draws them.
- Not a breakpoint: the host says when the screen is narrow.

## How to take it

Package: `@kaigilb/gilbplatformcode-table-react`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/table-react` prints. The app also installs `@tanstack/react-table` (9.3.1 or later in 9) and `@tanstack/react-virtual` (3.14.28 or later in 3):

```sh
npm install --install-links <path-to-the-library>/units/table-react
npm install @tanstack/react-table@^9.3.1 @tanstack/react-virtual@^3.14.28
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { buildTable, rowLimitNotice } from "@kaigilb/gilbplatformcode-table-core";
import { RecordTable } from "@kaigilb/gilbplatformcode-table-react";

<RecordTable
  table={fields ? buildTable({ fields, records, nameOf }) : null}
  loading={recordsPending}
  selectedId={openRecordId}
  onOpenRow={(id) => openCard(id)}
  renderRef={({ uri }) => <RecordName address={uri} />}
  footer={rowLimitNotice({ shown: records.length, limit: 1000, complete, total })}
  narrow={screenIsNarrow}
  label="Garment stock lines"
/>;
```

## What the host must supply

- A parent with a height: the table fills it and scrolls inside it.
- The style: Tailwind (the classes are in `src/`, so the app's Tailwind must scan this package, for example `@source "../node_modules/@kaigilb/gilbplatformcode-table-react/src";`), and these CSS variables: `--surface`, `--paper-2`, `--ink`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--line`, `--line-2`, `--accent`, `--accent-ink`, `--sel`, `--r-sm`, `--mono`. The unit holds no colour of its own.
- `onOpenRow`: opens the host's own card for the record and keeps the selection where the host keeps it.
- `renderRef`: draws a link as the record's name. It must not draw a button when the table is `narrow` (the row is already a button there).
- `narrow`: true below the host's own breakpoint.

## Module state

None.

## Do not

- Do not pass rows while they are still loading and expect them drawn: `loading` draws the skeleton.
- Do not put text into the empty state from outside by making up rows. An empty table is its headers.
- Do not hand `renderRef` a component that fetches once per cell without a shared cache: a column of links would ask once per row in view.

## Wrong readings

- "The rows in the page are the rows of the table." Only the rows in view are in the page. `aria-rowcount` on the grid is the whole count plus the header row.
- "Enter opens a row." Space does, and the row's button.

## Where it came from

New code, written for the table view (GilbApp, Solution TableView.SameRecords, delivery step 1).

Tests (`src/RecordTable.test.tsx`, 20, in jsdom with the viewport size given to it): Name first and marked frozen; a cell with no fact holds nothing; a link drawn by the host; Space and the row's button open; the skeleton in the real layout; an empty table is headers only; the footer; 1000 rows drawn as the rows in view; the list on a narrow screen. jsdom lays nothing out, so that the Name column stays in place while the table scrolls sideways is proved in a browser, not by these tests. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
