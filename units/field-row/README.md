# field-row

One click-to-edit text field row on a card: it shows the value (or nothing, in view mode, when empty), turns into an input on a click in edit mode, commits on Enter or on leaving, reverts on Escape, and does not treat a click into an open dialog or popover as leaving.

## What this is

One click-to-edit text field row on a card: it shows the value (or nothing, in view mode, when empty), turns into an input on a click in edit mode, commits on Enter or on leaving, reverts on Escape, and does not treat a click into an open dialog or popover as leaving.

`FieldRow({ label, value, onCommitValue, readOnly?, options?, picker?, multiline?, hideLabel?, prominent?, onEditingChange?, retainFocusWithinSection?, enterCard?, initialEditing? })`.

- The row is the sub-label (`label`, in italics) above the value, as a button named `Edit <label>`. A click on it opens the editor in place: an input of type text, focused, with the whole value selected and scrolled into view (where the browser has `scrollIntoView`).
- Commit: Enter, or the box losing focus, calls `onCommitValue(trimmedText)` once, and only if the trimmed text differs from the trimmed `value`. Escape reverts and commits nothing. The editor closes in all three cases.
- An empty value reads `Add <label in lower case>` in the button, and carries `data-card-add=""` so a chooser can press it. A `readOnly` row is a disabled button; its empty value reads `—`.
- In the card's view mode (the `card-mode` peer: a card that is managed and not editing) a row with no value, or only spaces, is not drawn at all. A click on a value there turns the card's edit mode on (unless `enterCard={false}`) and edits that value. Outside any `CardModeProvider` the row is always drawn.
- `retainFocusWithinSection`: a blur whose next focus is inside the row's own `<section>` saves a changed value but leaves the editor open; Escape anywhere in that section closes the editor without saving (not when it is pressed inside a dialog in the section, and not while a create dialog is open).
- A click into an open dialog or popover is not leaving: a blur whose next focus is inside an element matching `[data-testid="connected-create-root"]`, `[aria-modal="true"]` or `[role="dialog"]`, or any blur at all while a create dialog is open (`openPortalRoots` of the `open-popups` peer has a root), does not commit and does not close the editor.
- `options`: when given, the edit is a `select` of those values (plus a `—` that clears); a stored value outside the set is offered first, so opening never drops it; picking commits at once. `multiline`: a 4-row textarea where Enter inserts a line and blur commits. `hideLabel`: do not print the sub-label (the button keeps its name). `prominent`: the larger, semibold look. `initialEditing`: open the editor on mount (not reported through `onEditingChange`). `onEditingChange(editing)`: called when the row's own editor opens or closes.
- `picker`: `"contact-language"`, `"time-zone"` or `"birthday"`. The value is then picked, never typed. `"birthday"` opens the `birthday-picker` unit (a peer, always there) and shows the stored value as `birthday-text` words it ("14 March"; an odd stored value reads as stored). `"contact-language"` and `"time-zone"` open the host's picker (see "Host pickers"). Each picker is given `label`, `value`, `onPick`, `onCancel` and `onClear`; a pick different from the trimmed stored value commits and closes, Clear commits `""` when something is stored. With `picker` null, or when the host supplied no picker for it, the row is the text box.
- Test ids: `field-row` (with `data-field-label`).

## Host pickers

The contact-language and time-zone pickers are the app's own components (a language catalogue search, the browser's IANA zone list), so they are optional members of a host object, supplied through a React context:

```tsx
import { FieldPickersProvider } from "@kaigilb/gilbplatformcode-field-row";

<FieldPickersProvider pickers={{ ContactLanguagePicker, TimeZonePicker, contactLanguageDisplay, timeZoneDisplay }}>
  {card}
</FieldPickersProvider>;
```

Every member is optional; each names the app call it replaces (the file:line is in the source's doc comments):

| Member | Replaces (GilbApp 9a602ea7) | Used for |
|---|---|---|
| `ContactLanguagePicker` | `components/mynet/ContactLanguagePicker`, `FieldRow.tsx:37` | the editor of `picker="contact-language"` |
| `TimeZonePicker` | `components/mynet/TimeZonePicker`, `FieldRow.tsx:38` | the editor of `picker="time-zone"` |
| `contactLanguageDisplay(value)` | `lib/mynet/languages/contactLanguageTag`, `FieldRow.tsx:39` | how a stored language reads in the button |
| `timeZoneDisplay(value)` | `lib/mynet/time/timeZones`, `FieldRow.tsx:40` | how a stored time zone reads in the button |

With no provider, or with a member missing, the row draws as 0.1.0 did: a picker that is not supplied means the text box, a display that is not supplied means the value as stored. (This is the one host context of the library that does not throw without its provider: the members are optional.) A picker component is called with the same props at the same place as the app's own: `label`, `value`, `onPick(value)`, `onCancel()`, `onClear()`. The app's `PickerBox` is not used by the row: it is inside the app's `ContactLanguagePicker`, so it stays with that member.

## What this is not

- Not the contact-language and time-zone pickers: those are the app's components and come in as optional host members (`FieldPickersProvider`). The birthday picker is the `birthday-picker` unit.
- Not `field-control`: that is a controlled field (the caller holds its text and `onChange` hears every keystroke, a closed list is a menu); this row keeps its own draft, reads as text until clicked, and reports only a committed value.
- Not a save: `onCommitValue` is the caller's. The row does not know whether the write worked.
- Not the card's mode: it only reads it (`card-mode`).

## How to take it

Package: `@kaigilb/gilbplatformcode-field-row`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/field-row` prints). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row
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
- React 19, and the `card-mode`, `open-popups`, `birthday-picker` and `birthday-text` units installed beside this one. `open-popups` is where a create dialog registers itself (`openPortalRoots`), which is how the row knows one is open.

## Do not

- Do not list `card-mode`, `open-popups`, `birthday-picker` or `birthday-text` under this unit's `dependencies`, or give the app a second copy of any of them, or of this unit (its `FieldPickersContext` is a module context: a provider from another copy is not seen, and the pickers fall back to the text box). For the first two: a row reading another copy of `card-mode` never sees your provider (it is then always drawn), and another copy of `open-popups` never sees your dialogs.
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
- "A `picker` always opens a picker." Only when the host supplied that picker; otherwise the row is the text box, and the stored value is shown as stored. A display member without its picker member is never called.
- "`picker` and `options` together give a choice." The picker wins (the picker branches come before the choice).
- "`field-control` and this row are alike." See "What this is not".

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`:

- `src/components/mynet/FieldRow.tsx` lines 36-330, the whole range, to `src/FieldRow.tsx` (the header comment, lines 1-35, is replaced by a short generic one). The unit's code is the source's code with the following named changes, and only these (a token diff shows nothing else):
  - the imports are the peers' (`useCardMode` from `@kaigilb/gilbplatformcode-card-mode`; `insideOpenLayer` and `modalIsOpen` from `@kaigilb/gilbplatformcode-open-popups`; `BirthdayPicker` from `@kaigilb/gilbplatformcode-birthday-picker`; `birthdayText` from `@kaigilb/gilbplatformcode-birthday-text`; in the source they were `../records/cardMode`, `../records/planLeave`, `../ui/layers`, `gilb-stakeholders-ui` and `gilb-stakeholders`). The four host imports (`ContactLanguagePicker`, `TimeZonePicker`, `contactLanguageDisplay`, `timeZoneDisplay`) are the members of `FieldPickers`, read with `useFieldPickers()` from `./fieldPickers`;
  - `pickedDisplay` takes the host's pickers as a third argument and calls `pickers.contactLanguageDisplay` and `pickers.timeZoneDisplay` where the source called the imports; a missing display member returns the value as stored (the source's own last line);
  - a new function `pickerOf(picker, pickers)` returns the asked-for picker, or null when the host has no component for it; the destructured prop `picker = null` is `picker: pickerAsked = null`, and the added line `const picker = pickerOf(pickerAsked, pickers);` (after `const pickers = useFieldPickers();`) gives the `picker` every later line uses, so the birthday and picker branches below it are the source's lines;
  - in the picker branch, `const Picker = picker === "contact-language" ? ContactLanguagePicker : TimeZonePicker;` reads `pickers.ContactLanguagePicker` and `pickers.TimeZonePicker`, with a `!` because `pickerOf` has already left out a picker with no component;
  - comments made generic (two of them mention the "(−)" control, now "remove control").
- The props the Plan cards use are `label`, `value`, `readOnly`, `hideLabel`, `multiline`, `initialEditing`, `enterCard`, `retainFocusWithinSection`, `onEditingChange` and `onCommitValue`; `options`, `prominent` and `picker` are as in the source.

`src/index.ts` and `src/fieldPickers.tsx` are new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/mynet/FieldRow.s8cardlook.test.tsx` (6 cases) | Ported, with the same inputs and expectations (`CardModeBar` and `CardModeProvider` are the peer's; hosts are example.test). |
| `src/components/mynet/FieldRow.c214e8.test.tsx` (4 cases) | Ported, same inputs and expectations. |
| `src/components/mynet/FieldRow.contactPrefs.c214.test.tsx` (language, time zone, Clear) | Left out: it drives the app's real language and time-zone pickers (a catalogue search over a stubbed network and the browser's zone list), which are host members here. `FieldRowPickers.test.tsx` pins the same calls with a fake host: label, value, pick, cancel, clear. |
| `src/components/mynet/FieldRow.c214bn.test.tsx` (birthday, 3 cases) | Ported as `FieldRowBirthday.test.tsx`, same inputs and expectations. |
| `RecordDetail.planForm`, `planSolutionParts`, `stakeholderCard.c214` and `c214bnNick` test files | Left out: they render whole cards. |

The rest of `src/FieldRow.test.tsx` is new and pins what the source tests did not: the blur into a dialog or portal root, with and without a create dialog open, and that nothing is committed later by itself; `retainFocusWithinSection`; the multi-line and choice editors; `onEditingChange`; `initialEditing`; the pre-selection and the scroll. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.

## Changes in 0.2.0

The unit is the app's `FieldRow.tsx` again, with the picker branches that 0.1.0 had cut. Re-copied from 9a602ea7 (the 0.1.0 range was token-equal there, so the re-copy changes only what follows).

Restored: the `picker` prop and the `FieldPicker` type; `pickedDisplay`; the birthday branch and the picker branch of the editing chain; `pickedDisplay(picker, value, pickers)` for the button's text (source lines 37-54, 64, 81, 202-232 and 322).

New: `FieldPickersProvider`, `useFieldPickers` and the types `FieldPickers` and `FieldPickerProps` for the contact-language and time-zone pickers, which are the app's components and so optional host members (see "Host pickers"). New peers: `birthday-picker` and `birthday-text` (^0.1.0).

Not changed: with no provider (no host pickers) and no `picker` prop the row draws and behaves exactly as 0.1.0 did, and every 0.1.0 test passes unchanged. The 0.1.0 named change "the picker branches are cut" is gone.
