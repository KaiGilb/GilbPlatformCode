# value-meters-line

Draws and edits the Meters line of a Value card: each Meter with its qualifiers and its Human, AI and Instrument lines, each line with its method and source, giving every change up whole through onChange.

## What this is

One component, `PlanValueMetersBody`, the body of the group titled "Meter" on a Value card and on a Development Resource card (`planLinesFor` of `plan-kinds` gives the `valueMeters` line to both; `PLAN_VALUE_LINE_LABELS.valueMeters` is "Meter"). On the card it comes last of the Value's own lines, after the Levels. It takes the props of `ValueLineProps` (`value-line-kit`) and reads `data.meters` and, for the qualifier chip, `data.scale` and `data.variables`; it never writes to a vault.

- A Meter is a qualifier (text such as `During Development`, or `Country = Norway`) and up to three lines: HumanAgent, AiAgent, Instrument. Each line is a method (text) and a source.
- Read (the card is not in Edit): for each Meter `Meter [qualifier]:`, then the lines that have a method or a source, in the order HumanAgent, AiAgent, Instrument whatever the stored order: `HumanAgent: <method>` and the source under it. A Meter with no qualifier has no brackets; the hint `Add qualifier` is drawn in its place, even for a person who may not edit.
- Click to type (`canEdit` and not Edit): the qualifier (`Edit Meter 1 qualifier`) and each method (`Edit Meter 1 HumanAgent`, ...; empty: "Add HumanAgent method") are buttons that turn into an editor and back: Enter or leaving saves a changed text once, Escape saves nothing; a method is a text box (Shift+Enter is a line break). A source is the kit's `ViewSrc` (`Edit HumanAgent source`). All three lines are offered, whether or not they exist; a line is made when its method or its source is first written.
- "+ Meter" (click to type): opens a blank Meter and writes nothing; it is written, at the end of the list, once it has a qualifier or a method (leaving a blank editor without typing writes nothing). In Edit "+ Meter" is different: it hands up a blank Meter at once.
- The qualifier chip: a faint "+ value" after the qualifier (`Add Meter 1 qualifier value`), shown when the Scale names qualifiers. It opens a menu of the Scale's names; a name opens the one-value chooser of `qualifier-value-picker` (the name's defined options, with their definitions, and a free word when it has none); Done adds `<Name> = <value>` to the Meter's qualifier, after a comma if it has one already (`During Development, Country = Norway`). Escape and Clear add nothing.
- Edit: a card for each Meter (`plan-value-meter`): a qualifier box (`Meter 1 qualifier`, placeholder "Qualifier, e.g. During Development"), the chip, "Remove meter 1", then for each of the three lines a text box (`Meter 1 HumanAgent`) and a source box (`Meter 1 HumanAgent source`), and "+ Meter".
- What goes up: `onChange({ ...data, meters: next })` where `next` carries the unknown items of the old list (`carryOthers`), and each Meter and each line carry their unknown members (`carryRaw`) and the unknown items of a Meter's lines; the other lists go up as the same objects. A method written (read mode, Edit, or a new line) makes the signed-in person (`selfId`) the source of a line that has none; a source change, and a qualifier, do not.
- Older stored lists: with `legacy.meters` more than 0 the whole line is shown read-only (as if not in Edit and not editable), and the one button that moves the older lists (`LegacyMoveButton` of the kit) is in this line if no older list of levels or qualifiers is there to claim it.

## What this is not

- Not a writer. Nothing is sent to a vault; `onChange` is the only way out, and the card saves.
- Not the rules: the Scale's names (`scaleQualifierNames`), the qualifier definitions (`withScaleQualifiers`), the value of a pick (`qualifierValues`) and the unknown members (`carryRaw`, `carryOthers`) are `value-card-model`.
- Not the chooser: the one-value qualifier chooser is `qualifier-value-picker`, the source control is `plan-source` (set up by the kit), the faint "+ value" menu is the kit's `UnsetQualifiers`.
- Not a parser of the qualifier text: the line writes `Name = value` and reads nothing back out of it.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-meters-line`

Take it together with its peers `plan-card-facts`, `qualifier-value-picker`, `value-card-model` (0.2.0 or later) and `value-line-kit`, and their own peers (`qualifier-value-picker` has `plan-button-row` and `qualifier-values`; the kit's: `base-record`, `plan-source` and `type-chooser`, with theirs). React 19 is a peer. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/term-origin <path-to-the-library>/units/value-card-model <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source <path-to-the-library>/units/open-popups <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-meters-line
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off.

## Examples

A card that holds the data in state and saves what the line hands up. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { PlanValueMetersBody } from "@kaigilb/gilbplatformcode-value-meters-line";

// The providers of plan-source (its host, the record label, the picker query) sit above the card, once.
function MetersCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <PlanValueMetersBody
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
    />
  );
}
```

## What the host must supply

- The props of `ValueLineProps` (`value-line-kit`) that this line reads: `data`, `editing`, `canEdit`, `vaultId`, `record`, `onOpen`, `selfId`, `onChange(next: ValueCardData)` and `legacy?`. `onChange` is the only write seam; it gets the whole card, once for one act. A Meter is a member of `data.meters`; the card makes its records from the new list and shows the saved data again as `data`. The line ignores `onRenameQualifier` and `host`.
- `legacy`: when the Value still holds older stored Meters (`legacy.meters` more than 0) the line is read-only; the card moves them with `legacy.onMove`.
- The providers of `plan-source` above it (its host, `RefLabelContext` of `entity-ref-value` and `PickerQueryContext` of `record-picker`): the source control reads them. This line does not use the host of the lines (`ValueLinesHostContext`) and draws without it.
- The DOM contract of the qualifier chooser, from `qualifier-value-picker` (the group `Choose <label>`, here `Choose Meter 1 Country`, and its rows): the full-screen layer of `value-graph` leaves a chooser its own Escape by that group label.
- The test ids and labels the card and its tests use: `plan-value-meters-view`, `plan-value-meter`, the menu `Meter N qualifiers`, and the labels `Meter N qualifier`, `Meter N HumanAgent`, `Meter N AiAgent`, `Meter N Instrument` (and `... source`), `Add Meter N qualifier value`, `Set Meter N <Name>`, `Remove meter N`, `Edit ...`.
- Tailwind scanning this unit's `src` (and the kit's and the chooser's): the classes are arbitrary-value classes such as `text-[14px]`, `pl-3` and `before:content-['+_value']`. Without it the faint "+ value" has no face.
- CSS variables: `--accent`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--focus`, `--r-md`, and `--surface-2` (with its fallback). The `editorial-tokens` unit defines every one of them but `--surface-2`.
- React 19.

## Do not

- Do not copy `data` before you pass it in, or the card's comparison of list references (what changed) breaks.
- Do not make a Meter's record from anything but the list `onChange` gives: a blank Meter in click-to-type mode is not in `data` until it has a qualifier or a method.
- Do not parse the qualifier text for the Scale's names and write them back: the line writes `Name = value` as free text.
- Do not drop the unknown items of `data.meters` (or of a Meter's lines) when you read them from the vault: they ride on the list (not enumerable) and the line hands them back.

## Wrong readings

- "'+ Meter' writes a Meter." In click-to-type mode it only opens a blank one; the Meter is written when it has a qualifier or a method. In Edit it writes a blank Meter at once.
- "A Meter with no qualifier reads 'Meter:'." It reads `MeterAdd qualifier:` (no space, the hint in place of the brackets), also for a person who may not edit.
- "The lines are listed in the order they are stored." They are listed HumanAgent, AiAgent, Instrument; a stored line that is none of these three kinds is not shown (it is kept, with the list's other items).
- "A source with no method does not count." It does: a line with a source and no method is drawn.
- "Every change stamps the person as the source." A method does (when the line has no source); a source change, a qualifier and a pick of the chip do not. A removed source stays removed.
- "The chip offers every option as a multi-select." It is a one-value chooser: ticking a second option unticks the first.
- "The qualifier text is a list of pairs." It is a string; the chip appends `, Name = value` to it.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanValueLines.tsx`; the symbols of this unit, all in `src/PlanValueMetersBody.tsx` in the source's order, each copied by `sed -n 'A,Bp'`:

| Symbol | Lines |
|---|---|
| `METER_ROWS` | 106-110 |
| `PlanValueMetersBody` | 1657-1665 |
| `PlanValueMetersList` | 1667-1827 |

The pieces the other lines share with this one (`CommitText`, `Src`, `TextPiece`, `ViewSrc`, `UnsetQualifiers`, `LegacyMoveButton`, `own`, `inPlace`, `eq`, `faint`, `quiet`, `ValueLineProps`) are in `value-line-kit`. Code verbatim except the named changes (the comment-stripped text of each of the three symbols is the same as in the source, and the check is scripted).

Named changes:
1. Imports: `../../lib/base/planValue` and `../../lib/base/planValueModel` are `@kaigilb/gilbplatformcode-value-card-model` (`carryOthers`, `carryRaw`, `qualifierValues`, `scaleQualifierNames`, `withScaleQualifiers` and the types `MeterKind`, `ValueMeter`, checked to be exported there); `../../lib/base/planCard` is `@kaigilb/gilbplatformcode-plan-card-facts` (`planSourceEmpty`, `PlanSourceValue`); `./PlanQualifierValue` is `@kaigilb/gilbplatformcode-qualifier-value-picker`; the shared pieces above are from `@kaigilb/gilbplatformcode-value-line-kit`. The symbols are otherwise unchanged.
2. Comments: none of these symbols carried a name or a tag; the file's header comment is the unit's own.
3. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx` and the tests below.

Tests: no test of the app renders the Meters line on its own. The app's tests that reach it go through the whole card (`RecordDetail.planValueCard.vaultit.test.tsx`, `RecordDetail.planValueClickToType.vaultit.test.tsx`, `RecordDetail.planValueV21.vaultit.test.tsx`, `RecordDetail.planValueQaFixes.vaultit.test.tsx`, `RecordDetail.planValueHost.vaultit.test.tsx`, `RecordDetail.planResourceCard.vaultit.test.tsx`): they are the app's regression harness for the whole card, not for one line, and none of them is ported to this unit. All tests here are new: `src/meters.test.tsx` (35: the read line; click to type; "+ Meter" in click-to-type and in Edit; the qualifier chip and its text; Edit; the whole card going up with the untouched lists as the same objects, the unknown items and members carried; the older lists), `src/example.test.tsx` (2), `src/exports.test.ts` (1) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
