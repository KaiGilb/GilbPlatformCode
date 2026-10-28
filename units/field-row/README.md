# field-row

One click-to-edit text field row on a card: it shows the value (or nothing, in view mode, when empty), turns into an input on a click in edit mode, commits on Enter or on leaving, reverts on Escape, and does not treat a click into an open dialog or popover as leaving.

## What this is

One click-to-edit text field row on a card: it shows the value (or nothing, in view mode, when empty), turns into an input on a click in edit mode, commits on Enter or on leaving, reverts on Escape, and does not treat a click into an open dialog or popover as leaving.

`FieldRow({ label, value, onCommitValue, readOnly?, options?, multiline?, hideLabel?, prominent?, onEditingChange?, retainFocusWithinSection?, enterCard?, initialEditing? })`.

- The row is the sub-label (`label`, in italics) above the value, as a button named `Edit <label>`. A click on it opens the editor in place: an input of type text, focused, with the whole value selected and scrolled into view (where the browser has `scrollIntoView`).
- Commit: Enter, or the box losing focus, calls `onCommitValue(trimmedText)` once, and only if the trimmed text differs from the trimmed `value`. Escape reverts and commits nothing. The editor closes in all three cases.
- An empty value reads `Add <label in lower case>` in the button, and carries `data-card-add=""` so a chooser can press it. A `readOnly` row is a disabled button; its empty value reads `—`.
- In the card's view mode (the `card-mode` peer: a card that is managed and not editing) a row with no value, or only spaces, is not drawn at all. A click on a value there turns the card's edit mode on (unless `enterCard={false}`) and edits that value. Outside any `CardModeProvider` the row is always drawn.
- `retainFocusWithinSection`: a blur whose next focus is inside the row's own `<section>` saves a changed value but leaves the editor open; Escape anywhere in that section closes the editor without saving (not when it is pressed inside a dialog in the section, and not while a create dialog is open).
- A click into an open dialog or popover is not leaving: a blur whose next focus is inside an element matching `[data-testid="connected-create-root"]`, `[aria-modal="true"]` or `[role="dialog"]`, or any blur at all while a create dialog is open (`openPortalRoots` of the `open-popups` peer has a root), does not commit and does not close the editor.
- `options`: when given, the edit is a `select` of those values (plus a `—` that clears); a stored value outside the set is offered first, so opening never drops it; picking commits at once. `multiline`: a 4-row textarea where Enter inserts a line and blur commits. `hideLabel`: do not print the sub-label (the button keeps its name). `prominent`: the larger, semibold look. `initialEditing`: open the editor on mount (not reported through `onEditingChange`). `onEditingChange(editing)`: called when the row's own editor opens or closes.
- Test ids: `field-row` (with `data-field-label`).

## What this is not

- Not the contact pickers (language, time zone, birthday): those branches of the source row are not in this unit. The source's `picker` prop, `FieldPicker` type and the display of a picked value are gone.
- Not `field-control`: that is a controlled field (the caller holds its text and `onChange` hears every keystroke, a closed list is a menu); this row keeps its own draft, reads as text until clicked, and reports only a committed value.
- Not a save: `onCommitValue` is the caller's. The row does not know whether the write worked.
- Not the card's mode: it only reads it (`card-mode`).

## How to take it

Package: `@kaigilb/gilbplatformcode-field-row`

Take it together with its peers `card-mode` and `open-popups`. Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/card-mode <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { FieldRow } from "@kaigilb/gilbplatformcode-field-row";

<CardModeProvider canEdit>
  <section>
    <FieldRow
      label="Web address"
      value={record.webAddress}
      readOnly={!canWrite}
      enterCard={false}
      retainFocusWithinSection
      onEditingChange={(editing) => setLineOpen(editing)}
      onCommitValue={(text) => save({ webAddress: text || null })}
    />
  </section>
</CardModeProvider>;
```

## What the host must supply

- One `CardModeProvider` (from the `card-mode` unit) above the card, if the card has a view mode. Without one the row behaves as in edit mode.
- Pass `readOnly` yourself for a record that may not be written: the row does not read the card's `canEdit`.
- Tailwind scanning this unit's `src`, so its classes are generated (`text-[15px]`, `text-[16px]`, `text-[20px]`, `min-h-10`, `rounded-[var(--r-sm)]`, `focus-visible:outline-[var(--accent)]`).
- These CSS variables: `--ink`, `--ink-soft`, `--ink-ghost`, `--line`, `--surface`, `--accent`, `--serif`, `--r-sm`.
- React 19, and the `card-mode` and `open-popups` units installed beside this one. `open-popups` is where a create dialog registers itself (`openPortalRoots`), which is how the row knows one is open.

## Do not

- Do not list `card-mode` or `open-popups` under this unit's `dependencies` or give the app a second copy of either: a row reading another copy of `card-mode` never sees your provider (it is then always drawn), and another copy of `open-popups` never sees your dialogs.
- Do not hide an empty row yourself in view mode; the row does that.
- Do not mount a dialog the row opens outside an element matching `[role="dialog"]`, `[aria-modal="true"]` or the create-dialog root, or a click into it will commit the row.
- Do not expect `onCommitValue` to be called for an unchanged value, or with spaces round the edge.

## Wrong readings

- "A blur into a dialog commits later by itself." It does not. The editor stays open with the draft; Enter, or the next blur to somewhere else, commits it.
- "`readOnly` is taken from the card." It is not; a card that cannot be written still opens the editor of a row not marked `readOnly`, though the card stays in view mode.
- "Enter commits a multi-line value." It inserts a line; blur commits.
- "After a save inside `retainFocusWithinSection` the row knows the new value." It compares with the `value` it was given: until the host passes the saved value back, leaving the editor saves the same draft again.
- "`onEditingChange` is told about the editor that opens on mount (`initialEditing`)." It is not.
- "`options` and `multiline` together give a textarea." The choice wins.
- "`field-control` and this row are alike." See "What this is not".

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/mynet/FieldRow.tsx` lines 36-330 to `src/FieldRow.tsx` (the header comment, lines 1-35, is replaced by a short generic one). Named changes:
  - the imports are the peers' (`useCardMode` from `@kaigilb/gilbplatformcode-card-mode`; `insideOpenLayer` and `modalIsOpen` from `@kaigilb/gilbplatformcode-open-popups`; in the source they were `../records/cardMode`, `../records/planLeave` and `../ui/layers`);
  - the picker branches are cut, because the Plan cards use only the text branch. Removed lines: 37-42 (the imports of `ContactLanguagePicker`, `TimeZonePicker`, `contactLanguageDisplay`, `timeZoneDisplay`, `BirthdayPicker`, `birthdayText`); 47-56 (the `FieldPicker` type and `pickedDisplay`); 64 (`picker = null,`); 80-81 (the `picker` prop and its comment); in the comment of `multiline` (line 82) the words "or a picker"; 202-237 (the birthday branch `editing && picker === "birthday" ? ( … )`, the picker branch `editing && picker ? ( … )`, and the head `) : editing ? (` of the text chain, which now starts as `{editing ? (`); at line 322 `pickedDisplay(picker, value)` is `value`. Nothing the text, choice or textarea branches run through is changed;
  - two comments inside the code are made generic (lines 162 and 318).
- The props the Plan cards use are `label`, `value`, `readOnly`, `hideLabel`, `multiline`, `initialEditing`, `enterCard`, `retainFocusWithinSection`, `onEditingChange` and `onCommitValue`; `options` and `prominent` stay as in the source.

`src/index.ts` is new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/mynet/FieldRow.s8cardlook.test.tsx` (6 cases) | Ported, with the same inputs and expectations (`CardModeBar` and `CardModeProvider` are the peer's; hosts are example.test). |
| `src/components/mynet/FieldRow.c214e8.test.tsx` (4 cases) | Ported, same inputs and expectations. |
| `src/components/mynet/FieldRow.contactPrefs.c214.test.tsx` (language, time zone, Clear) | Left out: all of it is the picker branches. |
| `src/components/mynet/FieldRow.c214bn.test.tsx` (birthday) | Left out: the birthday picker. |
| `RecordDetail.planForm`, `planSolutionParts`, `stakeholderCard.c214` and `c214bnNick` test files | Left out: they render whole cards. |

The rest of `src/FieldRow.test.tsx` is new and pins what the source tests did not: the blur into a dialog or portal root, with and without a create dialog open, and that nothing is committed later by itself; `retainFocusWithinSection`; the multi-line and choice editors; `onEditingChange`; `initialEditing`; the pre-selection and the scroll. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
