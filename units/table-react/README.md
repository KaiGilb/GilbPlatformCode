Needs: base-record, table-core

# table-react

A read-only table of vault records on screen: one row per record and one column per field, with only the rows in view drawn.

## What this is

A read-only table of vault records on screen: one row per record and one column per field, with only the rows in view drawn.

One component, `RecordTable`, built on TanStack Table (the column and row model) and TanStack Virtual (only the rows in view are in the page). It draws the `TableModel` that `table-core` built and nothing else.

- `RecordTable({ table, loading?, selectedId?, onOpenRow, renderRef?, narrow?, label?, rowHeight?, overscan? })`.
  - **Columns.** Name is the first column and stays in place when the table scrolls sideways. Every other column is 190 px wide; Name is 280 px. A heading carries `data-column-source` (`name`, `type`, `other`, `stored`, as `table-core` gives it), and the heading of a column that is not a field of the type says in its title why it is there.
  - **Cells.** An empty cell holds nothing at all. A value is its text (a boolean reads Yes or No); a value longer than 300 characters is in the page once, in its cell, and not again as a tooltip. A value with no plain reading is shown as its JSON text. A fact that was not read says "Not loaded", with the reason as its title.
  - **Several values in one cell.** The cell shows the first value and a button with how many more it holds (`+4`, `data-testid="record-table-more"`). The pointer on the button, focus on it, or a tap lists ALL the cell's values (`role="group"`, named "All 5 values", drawn outside the table so it is not clipped); the pointer leaving, the focus leaving, a second tap, Escape or any scroll puts the list away. A tap on it never opens the record. No value is cut without a sign.
  - **Links.** A link cell is drawn by the host: `renderRef({ uri, id })`. With no `renderRef` the stored address is shown (`data-ref-state="unresolved"`): a link is never given a made-up name. A short form the record does not explain is shown as stored (`data-ref-state="unknown"`) and is not handed to the host.
  - **Opening a row.** Space on a focused row, or the button at the left of the row (`aria-label="Open <name>"`), calls `onOpenRow(id)`. A click on the row does not open it.
  - **Keys.** Arrow up and down move one row, Page up and Page down one screen of rows less one, Home to the first row and End to the last; each brings its row into view under the header. Exactly one drawn row holds the Tab stop at any time: the row the person last focused or moved to while it has focus or is in view, else the open record's row when it is in view, else the first row in view. The row with focus stays in the page while the table is scrolled away from it, so the keys always have a row to act from. In that row the `+N` buttons take a Tab stop too.
  - **Selected.** The row of `selectedId` is marked (`aria-selected="true"`), and brought into view when `selectedId` changes (a link that opens on a record far down the list shows it).
  - **Loading.** With `loading`, or `table={null}`, the header and 12 rows are drawn as a skeleton in the real layout (`aria-busy="true"`). When the columns are already known the real header is drawn over skeleton rows of the same column widths. Rows given while loading are not drawn.
  - **Empty.** A table with no rows shows its column headers only. No words are put in their place.
  - **Narrow screen.** With `narrow` it is a list (`role="list"`): each row shows the name and the first three columns after it, each on its own line with its heading. A tap anywhere on the row opens the record; the name is the button a keyboard uses (`button[data-row-id]`). A cell's `+N` button sits in the row beside it.
  - Test ids and marks: `record-table` (with `data-layout="grid"` or `"list"`), `record-table-skeleton`, `record-table-open`; rows carry `data-row-id`, cells and headers `data-column-id`.
- Types: `RecordTableProps`, `TableRef`.

## What this is not

- Not the table's data: `table-core` builds it, and the host reads the records and the fields.
- Not an editor. No cell can be changed, no row or column added, nothing sorted or filtered.
- Not a card: the host opens its own card when `onOpenRow` is called.
- Not the notice of a list that is cut short: the host draws its own, outside the table.
- Not a namer of links: the host's `renderRef` draws them.
- Not a breakpoint: the host says when the screen is narrow.

## How to take it

Package: `@kaigilb/gilbplatformcode-table-react`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/table-react` prints. The app also installs `@tanstack/react-table` (9.3.1 or later in 9) and `@tanstack/react-virtual` (3.14.28 or later in 3); `react-dom` is a peer beside `react` (the list of all values is drawn through a portal):

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
import { buildTable } from "@kaigilb/gilbplatformcode-table-core";
import { RecordTable } from "@kaigilb/gilbplatformcode-table-react";

<RecordTable
  table={fields ? buildTable({ fields, records, nameOf }) : null}
  loading={recordsPending}
  selectedId={openRecordId}
  onOpenRow={(id) => openCard(id)}
  renderRef={({ uri }) => <RecordName address={uri} />}
  narrow={screenIsNarrow}
  label="Garment stock lines"
/>;
```

## What the host must supply

- A parent with a height: the table fills it and scrolls inside it.
- The style: Tailwind (the classes are in `src/`, so the app's Tailwind must scan this package, for example `@source "../node_modules/@kaigilb/gilbplatformcode-table-react/src";`), and these CSS variables: `--surface`, `--paper-2`, `--ink`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--line`, `--line-2`, `--accent`, `--accent-ink`, `--sel`, `--r-sm`, `--r-md`, `--shadow-md`, `--mono`. The unit holds no colour of its own.
- `onOpenRow`: opens the host's own card for the record and keeps the selection where the host keeps it.
- `renderRef`: draws a link as the record's name, at the cell's own text size. It is called once for each link in view, so it must not read once per link: resolve the names in view together.
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
- "A cell shows all its values." It shows the first and `+N`; all of them are one focus, hover or tap away.

## Where it came from

New code, written for the table view (GilbApp, Solution TableView.SameRecords, delivery step 1).

Tests (`src/RecordTable.test.tsx`, 37, in jsdom with the viewport size given to it): the keys on a long table (one Tab stop among the drawn rows after a far open record, a wheel scroll, Page keys, Home and End); a cell with several values (the count, and the list on focus, hover and tap); a long value in the page once; three accessibility-rule runs (axe, contrast left to the browser); Name first and marked frozen; a cell with no fact holds nothing; a link drawn by the host; Space and the row's button open; the skeleton in the real layout; an empty table is headers only; 1000 rows drawn as the rows in view; the list on a narrow screen; where a column comes from. jsdom lays nothing out, so that the Name column stays in place while the table scrolls sideways is proved in a browser, not by these tests. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
