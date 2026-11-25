Needs: base-record, record-autosave, table-core

# table-react

A read-only table of vault records on screen: one row per record and one column per field, with only the rows in view drawn.

## What this is

A read-only table of vault records on screen: one row per record and one column per field, with only the rows in view drawn.

One component, `RecordTable`, built on TanStack Table (the column and row model) and TanStack Virtual (only the rows in view are in the page). It draws the `TableModel` that `table-core` built and nothing else.

- `RecordTable({ table, loading?, selectedId?, onOpenRow, renderRef?, onRefIntent?, narrow?, editing?, label?, rowHeight?, overscan? })`.
  - **Columns.** Name is the first column and stays in place when the table scrolls sideways. Every other column is 190 px wide; Name is 280 px. A heading carries `data-column-source` (`name`, `type`, `other`, `stored`, as `table-core` gives it), and the heading of a column that is not a field of the type says in its title why it is there.
  - **Headings and labels.** A column's heading in the grid and a field's label in the narrow list are the same letters, the label as its term gives it, in its own case; both are drawn as small spaced capitals by one style, never typed in capitals (since 0.1.1).
  - **Links.** Every link is drawn as a chip, whether its cell holds one value or several, and in the list of all values too; plain text is a value that is not a link (since 0.1.1). `onRefIntent(ref)` tells the host when the person goes to a cell that holds a link (a mouse over it, a tap or a click on it), with the cell's first link: for a host that reads a link's name only on request.
  - **Editing (since 0.2.0, only with `editing`).** `editing: { write, rowReadOnly?, cellReadOnly?, systemKeys?, locale? }` (`rowReadOnly(row)` and `cellReadOnly(row, column)` answer the host's reason when the person may not write a row, or when the host saves one field by a rule of its own; `systemKeys` are fields the vault sets itself). A click, a tap or the arrows select one cell; the keys go to its row. Enter opens a box on the stored value, and Enter again saves and moves down; Tab saves and moves right (Shift reverses both); leaving the box saves; Escape gives the edit up. A typed character starts an edit that replaces the value. Delete and Backspace clear the cell. A yes-or-no cell has no box: Space, Enter or a click on it changes it and saves at once. Space on any other cell still opens the row's record. On the narrow list a tap on a value selects it and a second tap opens its box. What may be edited, how typed text is read, and each read-only reason are `table-core`'s (`editabilityOf`, `parseEdit`): text (a box that grows; Alt+Enter is a new line), a number in the locale's marks, a date in a date box, a choice from a closed list (the list is shown; a value outside it stays in the box in red with "<value> is not in this list" and is not written). A cell that cannot be edited can still be selected; it says why in the line under the table and in its title, and holds no disabled control.
    - **The write is the host's.** `write({ rowId, columnId, plan, value, base })` is called once for one finished edit: `value` is the value to store (`null` removes the fact), `base` is what the field held when the edit started. It resolves when the vault has confirmed, or rejects with a `CellWriteError`: `{ theirs }` when the field no longer holds `base` (and not `value`), else `{ problem }` (a `CellProblem` of `table-core`'s `problemOf`). The table never writes a record cache: after the write resolves, the host's table model must hold the value.
    - **A clash outside the table.** `CONFLICT_WORDS` and `ConflictActs` are the clash's words ("Changed by someone else: …", "Yours: …") and its two buttons ("Use theirs", "Keep mine"), exported so a host's own form offers the same choice as a cell.
    - **Changes the host holds.** `editing.held` lists cells whose save did not reach the vault (the host keeps them, for example in an app-level holder): each is drawn as not saved and handed to `write` once. `editing.onDropped(rowId, columnId)` is called when the person gives a cell's change up ("Change dropped", "Use theirs"), so the host forgets it.
    - **What a cell shows.** The typed value at once; "…" while it is sent; a tick when confirmed; a red edge when it was not saved, with the typed value kept and, when sending again can help, a Retry button in the cell. Escape on such a cell puts the stored value back and says "Change dropped". Someone else's change: a red edge, and with that cell selected the line under the table says "Changed by someone else: <theirs> · Yours: <mine>" with "Use theirs" and "Keep mine" ("Keep mine" calls `write` again with `base` set to the value the person was shown). A refusal that the same value cannot get past (required, read-only, gone) puts the stored value back and says why. Text that cannot be stored and whose box was left stays in its cell, in red, with the reason.
    - **The line under the table** (`data-testid="record-table-bar"`): at the left it speaks for the selected cell (a polite live region); at the right it is the code library's `SaveStateLine` over all cells: "Saving…", "Saved", or "Not saved: N cells" with "Show" (goes to the first unsaved cell) while another cell is selected, and with "Try again" (every cell that can be tried again) once an unsaved cell is. The two choices of a conflict are a line of their own under it, right-aligned.
    - **The saves** are the code library's save-as-you-type machine, one per edited cell (`record-autosave`, `saveOn: "commit"`): a value is sent once, a refused write keeps what was typed, and what is unsaved is sent when the page is hidden or left. While a cell is being saved or is not saved, the browser asks before the page is left. Nothing is kept on the device.
  - **Cells.** An empty cell holds nothing at all. A value is its text (a boolean reads Yes or No); a value longer than 300 characters is in the page once, in its cell, and not again as a tooltip. A value with no plain reading is shown as its JSON text. A fact that was not read says "Not loaded", with the reason as its title.
  - **Several values in one cell.** The cell shows the first value and a button with how many more it holds (`+4`, `data-testid="record-table-more"`). The list of ALL the cell's values (`role="group"`, named "All 5 values", drawn outside the table so it is not clipped) is opened three ways, and each is ended by its own opposite. A mouse pointer on the button or on the list opens it; the pointer leaving both puts it away (a finger is not a hover: the mouse events a browser makes up after a touch are not counted). Focus that came from the keyboard opens it; the focus leaving puts it away (focus that a tap or click put on the button is not counted). A tap or click on the cell or on the button opens it; a second one anywhere on the same cell puts it away, in any order (the button then the value beside it, the value then the button, the cell's edge), and a third opens it again. Escape, any scroll outside the list, and a press anywhere outside the cell and the list put it away whatever opened it. When that press is a finger's it ONLY puts the list away: its click is held back, so the first tap outside does not also open the row under it; a mouse click outside is delivered. A press or a scroll inside the list keeps it. A tap on the cell never opens the record. No value is cut without a sign. The area a finger can hit around `+N` is a box centred on the chip, 44 px wide (the chip's own width when that is more); in the narrow layout it is 44 px high (see Narrow screen), in the grid the row's 36 px.
  - **Links.** A link cell is drawn by the host: `renderRef({ uri, id })`. With no `renderRef` the stored address is shown (`data-ref-state="unresolved"`): a link is never given a made-up name. A short form the record does not explain is shown as stored (`data-ref-state="unknown"`) and is not handed to the host.
  - **Opening a row.** Space on a focused row, or the button at the left of the row (`aria-label="Open <name>"`), calls `onOpenRow(id)`. A click on the row does not open it.
  - **Keys.** Arrow up and down move one row, Page up and Page down one screen of rows less one, Home to the first row and End to the last; each brings its row into view under the header. Exactly one drawn row holds the Tab stop at any time: the row the person last focused or moved to while it has focus or is in view, else the open record's row when it is in view, else the first row in view. The row with focus stays in the page while the table is scrolled away from it, so the keys always have a row to act from. In that row the `+N` buttons take a Tab stop too.
  - **Selected.** The row of `selectedId` is marked (`aria-selected="true"`), and brought into view when `selectedId` changes (a link that opens on a record far down the list shows it).
  - **Loading.** With `loading`, or `table={null}`, the header and 12 rows are drawn as a skeleton in the real layout (`aria-busy="true"`). When the columns are already known the real header is drawn over skeleton rows of the same column widths. Rows given while loading are not drawn.
  - **Empty.** A table with no rows shows its column headers only. No words are put in their place.
  - **Narrow screen.** With `narrow` it is a list (`role="list"`): each row shows the name and, under it, only the columns that hold a value in that row: the first three of them in column order, each on its own line with its label (since 0.1.1). A row that holds nothing is its name alone, and a row is as tall as what it lists. A tap on the row opens the record; the name is the button a keyboard uses (`button[data-row-id]`). A cell with several values is the one part of a row that does not: a tap on it lists its values. The line such a cell is on is 44 px high (other lines are 20 px), so a finger has 44 px on the cell and around its `+N` while the chip is drawn no larger; the row is taller by 24 px for each such line.
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

Tests: `src/RecordTable.editing.test.tsx` (43, with a stand-in host write: the selection and the arrows; Enter, Tab, Escape, a typed character, leaving the box, the page being hidden; clearing and a required field; a number, a date, a yes-or-no cell, a choice with Purple refused in Red/Green; text that cannot be stored; no connection, Retry, Escape on a failed cell, the question before leaving the page; a refusal that puts the stored value back; a conflict with both choices; read-only cells and rows; the narrow list; no device store; axe). `src/RecordTable.test.tsx` (54, in jsdom with the viewport size given to it): the keys on a long table (one Tab stop among the drawn rows after a far open record, a wheel scroll, Page keys, Home and End); a cell with several values (the count, the list on focus, hover and tap, and how the list is put away: a second tap in every order of the count, the value beside it and the cell; a scroll; a press outside by finger and by mouse, also after the list was opened from the value; Escape; the focus leaving); a long value in the page once; three accessibility-rule runs (axe, contrast left to the browser); Name first and marked frozen; a cell with no fact holds nothing; a link drawn by the host; Space and the row's button open; the skeleton in the real layout; an empty table is headers only; 1000 rows drawn as the rows in view; the list on a narrow screen; where a column comes from. jsdom lays nothing out and has no finger: the tests of how the list is put away send what a real tap sends (the press, the focus it brings, the click), with a pointer type the test gives the event. That the Name column stays in place while the table scrolls sideways, and what real touch events do at 390 px (tap, second tap, scroll, tap elsewhere, the 44 px a finger has), are proved in a browser by the host (GilbApp `scripts/measure-sheet.mjs`), not by these tests. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
