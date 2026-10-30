# add-information

Offers '+ Add Information' on a record card and opens the sheet of groups to add.

## What this is

Offers '+ Add Information' on a record card and opens the sheet of groups to add.

A record card does not have to show all its fields all the time. It shows what it has, and the person adds more kinds of information as they need them. This unit is the two parts of that: a button and a chooser. Both read the card's mode from the `card-mode` provider and take no props.

- `AddInformationButton()` is the full-width outlined "+ Add Information" at the foot of the card (`data-testid="card-add-info-button"`, `aria-haspopup="dialog"`). It is drawn only on a card that has a `card-mode` provider and may be written (`canEdit`). Pressing it calls `setChooserOpen(true)`. The "+" at the top of the card (`CardModeActions`, in `card-mode`) opens the same chooser.
- `AddInformationSheet()` is the chooser, mounted once per card, anywhere under the provider. While `chooserOpen` is true, on a card that may be written, it draws a full-window dialog (`role="dialog"`, `aria-modal`, named "Add information", `data-testid="add-information-sheet"`) in a portal on `document.body`, at layer `z-[70]`: above a phone's detail drawer (`z-50`) and a bottom nav (`z-[60]`), below a photo viewer (`z-[80]`) and an image picker (`z-[90]`). It holds:
  - a Search box (`type="search"`, "Search the kinds of information", placeholder "Search") that has the cursor when the sheet opens, and an italic Cancel;
  - a bold title "Add information";
  - the choices under bold headings. It lists the card's own groups that are NOT shown now and that the card may add to, as each group reported itself with `register({ kind, label, section, shown, addable })`; it keeps no catalogue of its own. The headings are the groups' `section`s in the order they are first met. Each choice is a row of at least 44 px (`data-testid="add-information-<kind>"`).
  - Search keeps the groups whose label or heading contains the typed words, ignoring case and the white space around them. With no match it says "Nothing matches."; with nothing to add it says "Everything this card can hold is already on it." (`data-testid="add-information-none"`).
  - Choosing a row calls `openGroup(kind)` (edit mode on, that group shown empty with the cursor on its add row) and closes the sheet. Cancel and Escape close it and change nothing.
- The sheet is a history entry, through `sheet-history`: on a phone the system Back closes only the chooser. It calls `dropStaleSheetEntry()` when it mounts, so a reload that landed on its entry steps back off it once. The search is emptied whenever it closes.
- Escape closes THIS sheet, whoever has the focus, and nothing under it. It listens on the document first (capture) and stops the event there, so a drawer listening for Escape does not also close. It leaves Escape alone when a create dialog is open above it and the key was pressed outside that dialog (`open-popups`).

## What this is not

- Not the groups. Each group (Email, Phone, Address, ...) draws itself and reports itself to the card mode; the chooser only lists what they report.
- Not the card mode. Edit and Done, the "+", the list of groups and `openGroup` are `card-mode`.
- Not a history manager (`sheet-history`) or a layer manager (`open-popups`).

## How to take it

Package: `@kaigilb/gilbplatformcode-add-information`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/add-information` prints:

```sh
npm install react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/card-mode <path-to-the-library>/units/open-popups <path-to-the-library>/units/sheet-history <path-to-the-library>/units/add-information
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/add-information/src";`. The page must define these variables (all eight are read):

`--accent` (the button, Cancel, the focus outline), `--paper` (the button and sheet background), `--ink` (the sheet text), `--line` (the Search box border), `--surface` (the Search box background), `--serif` (the title, the headings, Cancel), `--ink-faint` (the empty-state line), `--sel` (a choice under the pointer).

## Examples

```tsx
import { CardModeActions, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { AddInformationButton, AddInformationSheet } from "@kaigilb/gilbplatformcode-add-information";

function Card({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return (
    <CardModeProvider canEdit={canEdit}>
      <CardModeActions />          {/* Edit / Done and the "+" at the top */}
      {children}                   {/* groups that register themselves with the card mode */}
      <AddInformationButton />     {/* "+ Add Information" at the foot */}
      <AddInformationSheet />      {/* the chooser, once per card */}
    </CardModeProvider>
  );
}
```

## What the host must supply

Nothing of its own: no host object and no setting. The card's mode comes from the `card-mode` provider that wraps it.

## Module state

None in this unit. The history entry's guard (`dropStaleSheetEntry` steps back once for all callers) is module state of `sheet-history`, a singleton peer; install that unit once.

## Do not

- Do not mount more than one `AddInformationSheet` per card: both would open together and push two history entries.
- Do not mount the sheet outside a `CardModeProvider`: with no provider the card is "always editing" and the sheet never opens.
- Do not keep a list of kinds in your app for the chooser. A group appears in it by reporting itself.
- Do not give a layer above `z-[70]` to anything that must stay under the chooser.

## Wrong readings

- "The button opens the chooser by itself." It sets `chooserOpen` in the card mode; the sheet draws it.
- "The sheet lists every group of the card." Only those not shown and that may be added to.
- "Escape closes the drawer too." The sheet takes it first and stops it.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/components/records/AddInformation.tsx` (whole, 148 lines) to `src/AddInformation.tsx`.

Imports: `react`, `react-dom` (`createPortal`), and three units whose whole files I compared with the source's, comment-stripped: `useCardMode` from `card-mode` (`cardMode.tsx` equal, 0 diff lines), `dropStaleSheetEntry` and `useSheetHistory` from `sheet-history` (`useSheetHistory.ts` equal, 0), `eventTargetInTopDialog` and `modalIsOpen` from `open-popups` (`layers.ts` equal, 0). Named changes, and only these: the three import paths (`./cardMode`, `./useSheetHistory`, `../ui/layers`) are the units' packages; the file's header comment, and two inline comments that name a cycle, a decision, a person and a tester, are reworded and the header's mention of the host app reads "this app". No code changed. The comment-stripped file, imports excluded, equals the source's (0 diff lines). `src/index.ts` is new.

## Tests

52 tests in 3 files (`npx vitest run`):

- `AddInformation.test.tsx` 37: all 11 cases of the source's two files ported (`AddInformation.history.s12` 5, `AddInformation.s10iter1drawer` 6), and 26 new (the button on a card that may and may not be written, and outside a card; the chooser closed, never open on a card that cannot be written, its roles and names, the cursor in the Search box, what it lists and what it leaves out, both empty-state lines, the search, the search emptied on close, a pick, the header "+", groups that register or become shown while it is open, 44 px rows; Escape inside the sheet, outside it, with a create dialog open above, with a key that is not Escape, and its listener added and removed). In place of the app's `CardGroup` a small stand-in registers with the card mode as `CardGroup` does; the drawer is the real `drawer` unit; `history.back()` is a fake that answers at once, and the timers are fake: no wait on the clock. The source test's real `waitFor` and `setTimeout(450)` are gone for that reason.
- `exports.test.ts` 2.
- `hostAgnostic.test.ts` 13.

Nothing from the source is left out. The tests need `drawer` (with `class-merge`) and `@testing-library/user-event` as dev dependencies; they are not peers.
