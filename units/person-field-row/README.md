# person-field-row

Draws one field of a person's own card as an editable row, with a picker where one exists.

## What this is

Draws one field of a person's own card as an editable row, with a picker where one exists.

One plain field of a person card (a time zone, a web address, a level, an interest, a birthday): the master's label above, the value below, a click on the value edits it, and the edit is handed back through `onCommit` to the card's own save. The row draws nothing of its own: it is `FieldRow` from `field-row`, given three things it does not know.

- the field's **value set**, read by the field's term from the master (`termValueSet` of `term-slots`). Where the term publishes a closed `a:valueSet`, the edit is a choice among its members. Where it publishes none, or the master does not answer, the edit is free text.
- the field's **picker**, found by the field's term: `contactLanguage` is edited in the host's language picker, `timeZone` in the host's time-zone picker, `birthday` in the birthday picker (day and month, year optional). Any other term has none.
- the read-only flag and the commit, passed straight on.

`PersonFieldRow({ label, value, termName, readOnly, onCommit })`:

- `label`: the master's label for the field (the row's sub-label).
- `value`: the stored value, as text.
- `termName`: the field's term name, or `null` when the field is not addressable. With `null` the master is not asked and the edit is a text box.
- `readOnly`: the row cannot be opened.
- `onCommit(value)`: called with the trimmed new value when the edit ends with a different value.

No field is named in the code but the three picked terms. The value-set read is a React Query query, keyed `["mynet", "term-value-set", termName]` (the key kept as it was in the app, so a cache shared with the app's other code still finds it), read once per page (`staleTime: Infinity`) and enabled only when there is a term.

## What this is not

- Not a save. `onCommit` is yours; the row never writes.
- Not the picker components. The contact-language and time-zone pickers are the host's, supplied with `FieldPickersProvider` from `field-row`. With no provider the row is a text box.
- Not a list of fields. Which fields a card has, and in what order, is the card's.
- Not the row of a Plan record or a contact's own rows; those are other units.

## How to take it

Package: `@kaigilb/gilbplatformcode-person-field-row`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/person-field-row` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker <path-to-the-library>/units/card-mode <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/person-field-row
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { PersonFieldRow } from "@kaigilb/gilbplatformcode-person-field-row";

<PersonFieldRow
  label="Time zone"
  value="Europe/Oslo"
  termName="timeZone"
  readOnly={!canEdit}
  onCommit={(v) => saveThroughTheCard("timeZone", v)}
/>;
```

## What the host must supply

- A `QueryClientProvider` above the row.
- `setTermOrigin(...)` from `term-origin`, once at start-up: the master the value set is read from (through `term-slots`). The read is a public GET with no credential.
- A `CardModeProvider` from `card-mode` above the row if the card has an edit mode. Without one the row is always in edit mode (`field-row`'s rule), and editable where `readOnly` is false.
- Optionally `FieldPickersProvider` from `field-row`, with `ContactLanguagePicker` and `TimeZonePicker` (and their display functions). Without it the language and time-zone rows are text boxes; the birthday picker needs nothing from the host.

## Module state

None of its own. `term-slots` holds the per-term document cache the value set is read from, and `field-row` holds the picker context; an app must have ONE copy of each.

## Do not

- Do not give a different `queryKey` or wrap the row in a second `QueryClient` for it: the value set is held once per page under the key above.
- Do not use this row for a field whose term you do not have: pass `termName={null}` and it is a text box.
- Do not add a picker for a term here. The three picked terms are the source's; a new one is a named change.

## Wrong readings

- "The language and time-zone rows are always pickers." They are pickers only where the host supplied the picker; otherwise they are text boxes.
- "A value set always makes a choice." Only where the master publishes one. The live master serves some tokens (a level, a time zone) with no `a:valueSet`; those are free text (or a picker).
- "The row saves." It hands the value to `onCommit` and nothing more.
- "A term name is matched loosely." It is matched exactly and case-sensitively: `TimeZone` and `timezone` have no picker.
- "A stored value outside the published set is dropped when the choice opens." It is still offered (that is `field-row`'s rule).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, symbol by symbol:

- `src/components/records/PersonFieldRow.tsx` to `src/PersonFieldRow.tsx`: lines 28-65 (`PICKED_BY_TERM`, `PersonFieldRow`). Lines 1-27 (the header comment and the imports) are replaced.

Named changes, and only these:

1. the imports of `FieldRow` and its type `FieldPicker` (`../mynet/FieldRow`) and `termValueSet` (`../../lib/base/termSlots`) are imports of `field-row` and `term-slots`; the import of `useQuery` is unchanged, and the two imports of `FieldRow` and `FieldPicker` are one statement;
2. the header comment is shorter: it drops the cycle, agent, ticket and walk references and the history of two corrections; no code changed.

With comments and imports removed, the file is token-equal to the source (0 diff lines).

`src/index.ts` is new. Tests: none in the source; all new. `PersonFieldRow.test.tsx` (26) covers the plain row, the pickers (the host's, none supplied, the birthday picker, and the terms that have none), and the value set. `exports.test.ts` (1) pins the export list. `hostAgnostic.test.ts` (13) is the same host-agnostic check test as the other units. 40 tests in all; the master is a fake `fetch`.
