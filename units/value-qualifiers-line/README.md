# value-qualifiers-line

Draws and edits the Qualifiers line of a Value card: each qualifier of the Scale (such as [Country]) with its options, definitions and default option, renaming, the preset qualifiers, the "Not in the Scale" warning and the conditions that can move into a qualifier, giving every change up whole through onChange.

## What this is

Draws and edits the Qualifiers line of a Value card: each qualifier of the Scale (such as [Country]) with its options, definitions and default option, renaming, the preset qualifiers, the "Not in the Scale" warning and the conditions that can move into a qualifier, giving every change up whole through onChange.

One component, `PlanVariablesBody`, the body of the group titled "Qualifiers" on a Value card and on a Development Resource card (`planLinesFor` of `plan-kinds` gives the `scaleVariables` line to both; `PLAN_VALUE_LINE_LABELS.scaleVariables` is "Qualifiers"). On the card it comes fourth, after the Endpoint and before the Levels. It takes the props of `ValueLineProps` (`value-line-kit`) and reads `data.scale`, `data.variables` and `data.levels`; it never writes to a vault.

- One row for each name the Scale gives (the `[Name]` words of its unit, rate and context, once each, matched without case, in Scale order), then one for each defined name the Scale no longer has (greyed, with "Not in the Scale"). A Scale name that has no record yet is a blank row; its record is made, once, by the first value or definition added to it (the new variable is appended to `data.variables`; the card's save writes the record).
- Read (the card is not in Edit): a row is `[Name]`, its options as chips, a "default" badge on the default option, "definition: ..." and the row's source. Rows carry `data-testid="plan-variable-view-row"`, `data-qualifier-row` (the name in lower case), `data-in-scale` (`yes` or `no`), `data-has-record` (`yes` or `no`) and `tabIndex={-1}`. The Scale line's `[Name]` chips focus these rows.
- Click to type (`canEdit` and not Edit):
  - an option is a button that turns into an input: Enter or leaving saves a changed name (trimmed; the default follows the rename), an emptied name removes the option (and clears the default if it was that option); "Make default <name>" and "Clear default <name>" (on the badge); "Remove value <name>";
  - "+ value" adds options: a typed "Norway, Sweden" (split at commas and semicolons) becomes two; a word the row has already (any case) is not added again; Enter adds and keeps the box open, leaving adds and closes, Escape drops the words and closes;
  - the definition ("Add definition") and, for a name that is not in the Scale, its name, each edited in place;
  - a definition that is really a list (2 to 20 short items, no full stop at the end) offers "Make "Norway", "Sweden" values" (options made, definition cleared);
  - for a name that is not in the Scale: "Remove qualifier <name>" and "Add <name> to the Scale";
  - "+ Qualifier" opens a box and the preset names (Release, User type, Task, Device, Country, Region, Age-Group, Language, Market, Customer segment, Scenario, less those the Scale has); a name is added to the Scale as ` for [Name]` at the end of its context, never to a list of its own; a name the Scale has, or a blank name, is not added; brackets in the name are dropped;
  - "Move '<condition>' into [<Name>] on N level(s)" for a level condition that is now an option of a qualifier the level has not set.
- The rename offer: when exactly one defined name is no longer in the Scale and exactly one Scale name has no record, the Scale name's row offers "Rename [Old] to [New]?". A click calls `onRenameQualifier(from, to)`: the card renames the record and the levels' choices in one group write. The line itself sends nothing for it.
- Edit: a card for each row with a box for each part: the name (only for a name not in the Scale), "Remove qualifier", the rename offer, "Not in the Scale" with "Add to Scale", a select for the default option ("No default" first), a name box and a definition box for each option with "Remove option", "+ Option" (for a name with a record; for a name without one, "+ value"), "Make ... values", the definition and the source. Boxes save on Enter or on leaving; the selects and the buttons at once. Then "+ Qualifier" with the presets shown, and the "Move ..." buttons.
- Older stored lists: with `legacy.qualifiers` more than 0 the whole line is shown read-only (as if not in Edit and not editable), and the one button that moves the older lists (`LegacyMoveButton` of the kit) is in this line if no older list of levels is there to claim it.
- What goes up: `onChange({ ...data, variables: next })` where `next` carries the unknown items of the old list (`carryOthers`) and each edited variable carries its unknown members (`carryRaw`); a change of the Scale (adding a name) goes up as `{ ...data, scale: next }`, and a moved condition as the model's `moveConditionIntoVariable`. The lists the line did not touch go up as the same objects. Adding values, renaming a name or an option, and a definition make the signed-in person (`selfId`) the source of a record that has none; making or clearing the default, removing an option or a value, "+ Option" in Edit, and the source itself do not.

## What this is not

- Not a writer. Nothing is sent to a vault; `onChange` and `onRenameQualifier` are the only ways out, and the card saves.
- Not the rules: the rows (`qualifierRows`), the names a Scale gives (`scaleQualifierNames`), the rename candidate, the presets, `listLikeDefinition`, the movable conditions and the unknown members (`carryRaw`, `carryOthers`) are `value-card-model`.
- Not the rename itself: the line offers it; renaming a qualifier on its record and on every level's choice is the card's.
- Not the qualifier pickers on a level or a meter: those are `qualifier-value-picker`, used by the Levels and Meters lines.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-qualifiers-line`

Take it together with its peers `plan-card-facts`, `value-card-model` (0.2.0 or later) and `value-line-kit`, and their own peers (the kit's: `base-record`, `plan-source` and `type-chooser`, with theirs). React 19 is a peer. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/value-card-model <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source <path-to-the-library>/units/open-popups <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-qualifiers-line
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off.

## Examples

A card that holds the data in state, saves what the line hands up and does the rename itself. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { PlanVariablesBody } from "@kaigilb/gilbplatformcode-value-qualifiers-line";

// The providers of plan-source (its host, the record label, the picker query) sit above the card, once.
function QualifiersCard({ start, save, rename }: { start: ValueCardData; save: (next: ValueCardData) => void; rename: (from: string, to: string) => void }) {
  const [data, setData] = useState(start);
  return (
    <PlanVariablesBody
      data={data}
      editing={false}
      canEdit
      vaultId={vaultId}
      record={record}
      onOpen={openRecord}
      selfId={signedInPersonUri}
      onChange={(next) => {
        save(next); // the whole card; the lists the line did not touch are the same objects
        setData(next);
      }}
      onRenameQualifier={rename} // renames the record and every level's choice, in one group write
    />
  );
}
```

## What the host must supply

- The props of `ValueLineProps` (`value-line-kit`) that this line reads: `data`, `editing`, `canEdit`, `vaultId`, `record`, `onOpen`, `selfId`, `onChange(next: ValueCardData)`, `onRenameQualifier?(from, to)` and `legacy?`. `onChange` is the only write seam; it gets the whole card, once for one act. A qualifier with no record yet becomes one in `data.variables` by `onChange`; the card must make its record from the new list, and show the saved data again as `data`. Without `onRenameQualifier` the rename offer is not shown. The line ignores `host`.
- `legacy`: when the Value still holds older stored lists of qualifiers (`legacy.qualifiers` more than 0) the line is read-only; the card moves them with `legacy.onMove`.
- The providers of `plan-source` above it (its host, `RefLabelContext` of `entity-ref-value` and `PickerQueryContext` of `record-picker`): the source control reads them. This line does not use the host of the lines (`ValueLinesHostContext`) and draws without it.
- The DOM contract with the Scale line, kept as the source has it: every row carries `data-qualifier-row` (the name trimmed and in lower case) and `tabIndex={-1}`, so that a `[Name]` chip of the Scale line can focus it; the card wraps its lines in an element with `data-testid="record-detail-content"`.
- The test ids and labels the card and its tests use: `plan-variables-view`, `plan-variable-view-row`, `plan-variable-row`, `plan-variable-name`, `plan-variable-option`, `plan-variable-default`, `plan-variable-make-default`, `plan-variable-not-in-scale`, `plan-variable-rename-helper`, `plan-qualifier-add`, `plan-qualifier-presets`, `data-in-scale`, `data-has-record`, and the labels `Qualifier N name`, `Qualifier N value K`, `Qualifier N definition`, `Qualifier N default option`, `Qualifier N option K name`, `New qualifier name`, `New Qualifier N value`, `Add qualifier <Name>`, `Remove qualifier <Name>`, `Add <Name> to the Scale`.
- Tailwind scanning this unit's `src` (and the kit's): the classes are arbitrary-value classes such as `min-h-11`, `text-[12px]`, `group-focus-within/row:pointer-events-auto` and `[@media(hover:none)]:opacity-100`. Without it the "Make default" button, which shows on hover or focus, never shows.
- CSS variables: `--accent`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--focus`, `--r-md`, and `--surface-2` (with its fallback). The `editorial-tokens` unit defines every one of them but `--surface-2`.
- React 19.

## Do not

- Do not copy `data` before you pass it in, or the card's comparison of list references (what changed) breaks.
- Do not make the record of a new qualifier anywhere but from the list `onChange` gives: a Scale name has no record until its first value or definition is written, and the line shows it as a row with `data-has-record="no"` until then.
- Do not write a rename from `onChange`. A rename touches the record and every level's choice; use `onRenameQualifier` and write them together.
- Do not drop the unknown items of `data.variables` when you read them from the vault: they ride on the list (not enumerable) and the line hands them back.
- Do not pass `withScaleQualifiers(data)` to this line: that list holds blank rows for names with no record, which must not be written.

## Wrong readings

- "'Add qualifier' makes a record." It adds ` for [Name]` to the Scale's context. The qualifier's record is made later, by the first value or definition added to its row.
- "The rename offer is on the old name." It is on the new one (the Scale name with no record); the old name is "Not in the Scale".
- "The rename offer works for any two names." It needs exactly one defined name the Scale lacks and exactly one Scale name with no record: adding a second new name to the Scale takes it away.
- "Emptying an option's name removes it everywhere." Only in the read line. In Edit the option is kept with an empty name (a blank option is also what "+ Option" adds); remove it with "Remove option".
- "Every change stamps the person as the source." Making or clearing a default, removing an option or a value and "+ Option" in Edit do not; adding values, renaming a name or an option and a definition do, and only when the record has no source.
- "The 'Move ...' button names the first spelling of the condition." It names the spelling on the last level that holds it ("norway" on one level and "Norway" on another: it says 'Norway'), although the model's comment says "first seen". The move itself writes the option's own spelling.
- "Escape always closes the '+ Qualifier' box." Only while the focus is in it. After a click on a preset the pressed button is gone and the focus is on the page, so Escape does not reach the box.
- "An older stored list can be edited in Edit." It is read-only until moved; the line hides every edit control while `legacy.qualifiers` is more than 0.
- "Two records with the same name in different case are one row." The first goes to the Scale's row; the second is a row of its own, "Not in the Scale". Both rows then share one React key (their lower-cased name), which makes React warn; kept as in the source.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanValueLines.tsx`; the symbols of this unit, all in `src/PlanVariablesBody.tsx` in the source's order, each copied by `sed -n 'A,Bp'`:

| Symbol | Lines |
|---|---|
| `AddQualifier` | 891-946 |
| `AddValues` | 948-986 |
| `MakeValuesButton` | 988-995 |
| `PlanVariablesBody` | 997-1005 |
| `DEFAULT_BADGE` | 1007-1008 |
| `NotInScale` | 1010-1023 |
| `PlanVariablesList` | 1025-1364 |

The pieces the other lines share with this one (`CommitText`, `Src`, `TextPiece`, `ViewSrc`, `LegacyMoveButton`, `own`, `inPlace`, `eq`, `box`, `small`, `quiet`, `faint`, `chip`, `faintBtn`, `ValueLineProps`) are in `value-line-kit`. Code verbatim except the named changes (the comment-stripped text of each of the seven symbols is the same as in the source, and the check is scripted).

Named changes:
1. Imports: `../../lib/base/planValue` and `../../lib/base/planValueModel` are `@kaigilb/gilbplatformcode-value-card-model` (each name was checked to be exported there: `blankVariable`, `carryOthers`, `carryRaw`, `listLikeDefinition`, `movableConditions`, `moveConditionIntoVariable`, `PRESET_QUALIFIERS`, `qualifierRows`, `renameCandidate`, `scaleQualifierNames` and the types `QualifierRow`, `ScaleVariable`); `../../lib/base/planCard` is `@kaigilb/gilbplatformcode-plan-card-facts` (`planSourceEmpty`); the shared pieces above are from `@kaigilb/gilbplatformcode-value-line-kit`. The symbols are otherwise unchanged.
2. Comments: the batch tags of the source's comments on `DEFAULT_BADGE` are removed, keeping the technical meaning.
3. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx` and the tests below.

Tests: no test of the app renders the Qualifiers line on its own. The app's tests that reach it go through the whole card (`RecordDetail.planValueCard.vaultit.test.tsx`, `RecordDetail.planValueClickToType.vaultit.test.tsx`, `RecordDetail.planValueV21.vaultit.test.tsx`, `RecordDetail.planValueQaFixes.vaultit.test.tsx`, `RecordDetail.planValueHost.vaultit.test.tsx`, `RecordDetail.planResourceCard.vaultit.test.tsx`, `PlanValueQualifiersFollowScale.v32.test.tsx`, `PlanValueRename.qa4.v36.test.tsx`): they are the app's regression harness for the whole card, not for one line, and none of them is ported to this unit. All tests here are new: `src/qualifiers.test.tsx` (49: the rows and their marks, the options, the default, the definition, "Make values", the rename offer, "+ Qualifier" and the presets, the moved conditions, Edit, the older lists, and the whole card going up with the untouched lists as the same objects and the unknown members carried), `src/example.test.tsx` (1), `src/exports.test.ts` (1) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
