# value-scale-line

Draws and edits the Scale line of a Value card or a Development Resource card: its unit, rate and context (each [Qualifier] in the rate and context is a chip that jumps to that qualifier's row), which direction is better, and its source, giving every change up whole through onChange.

## What this is

One component, `PlanScaleBody`, the body of the group titled "Scale" on a Value card and on a Development Resource card (`planLinesFor` of `plan-kinds` gives the Scale line to both; `PLAN_VALUE_LINE_LABELS.scale` is "Scale"). On the card it comes second, after the Illustration and before the Endpoint. It takes the props of `ValueLineProps` (`value-line-kit`) and reads `data.scale`; it never writes to a vault.

- Read (the card is not in Edit): one block, `data-testid="plan-scale-view"`.
  - "Unit: minutes" when there is a unit; "Rate: ..." and "Context: ..." when there are some; each `[Name]` in them is a chip (see below).
  - The direction in words (`Lower is better`, `Higher is better`, `Target range`), when the Scale says something (a unit, a rate or a context) or the person may edit.
  - The source under it ("Source: ..."), when it has one.
  - The Scale's older sentence (`scale.text`) is kept as it is and never shown or written anew.
- Click to type (`canEdit` and not Edit): each value is a button, `Edit Scale unit`, `Edit Scale rate`, `Edit Scale context`, `Edit Scale direction`, `Edit Scale source`, that turns into its editor and back. An empty unit, rate or context shows `Add unit`, `Add rate`, `Add context`. Enter or leaving saves a changed text once; Escape saves nothing. The rate and the context are text boxes (Shift+Enter is a line break). The direction is a select; a pick saves at once.
- Edit: one box for each part, with the names Unit, Rate, Context, Better, and the source box open. The boxes save on Enter or on leaving when the text differs. The direction select saves at once.
- The chips: each `[Name]` in the rate or the context is a button (`role="button"`, `data-kind="plan-scale-variable"`, `aria-label="Go to qualifier <Name>"`). A click, or Enter or Space, focuses the row of that qualifier in the same card (the Qualifiers line) and scrolls it near. The click and the keys stop at the chip, so in click-to-type mode a chip does not open the rate's editor. A name with no row does nothing.
- What goes up: `onChange({ ...data, scale: next })`, where `next` is the Scale with the change, carrying the Scale's unknown members (`carryRaw`). The lists the line did not touch (`variables`, `endpoint`, `meters`, `levels`) go up as the same objects. A change of the unit, the rate or the context also makes the signed-in person (`selfId`) the source when the Scale has none; a change of the direction or of the source does not.

## What this is not

- Not a writer. Nothing is sent to a vault; `onChange` is the only way out, and the card saves what it gives.
- Not the Scale's rules: the direction rule (`scaleDirectionOf`), the qualifier names in a text (`scaleQualifierNames`), the keeping of unknown members (`carryRaw`) and the defaults of a new card are `value-card-model`. The line has no default of its own: it shows the direction the data holds, so a Development Resource that reads "lower" and a Value that reads "higher" come from the model, not from here.
- Not the Qualifiers line: the chips only go to its rows. The rows are drawn by `value-qualifiers-line`.
- Not the source control: that is `plan-source`, set up by the kit's `Src` and `ViewSrc`.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-scale-line`

Take it together with its peers `value-card-model` (0.2.0 or later) and `value-line-kit`, and their own peers (the kit's: `base-record`, `plan-card-facts`, `plan-source` and `type-chooser`, with theirs). React 19 is a peer. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/value-card-model <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source <path-to-the-library>/units/open-popups <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-scale-line
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off.

## Examples

A card that holds the data in state and saves what the line hands up. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { PlanScaleBody } from "@kaigilb/gilbplatformcode-value-scale-line";

// The providers of plan-source (its host, the record label, the picker query) sit above the card, once.
function ScaleCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <PlanScaleBody
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

- The props of `ValueLineProps` (`value-line-kit`) that this line reads: `data`, `editing`, `canEdit`, `vaultId`, `record`, `onOpen`, `selfId` and `onChange(next: ValueCardData)`. `onChange` is the only write seam; it gets the whole card, once for one act (an Enter, a blur that changed the text, a pick). Show the saved data again as `data`. The line ignores `onRenameQualifier`, `legacy` and `host`.
- The providers of `plan-source` above it (its host, `RefLabelContext` of `entity-ref-value` and `PickerQueryContext` of `record-picker`): the source control reads them. The Scale line does not use the host of the lines (`ValueLinesHostContext`) and draws without it.
- The DOM contract with the Qualifiers line, kept as the source has it: a chip looks, starting from its own card (the nearest ancestor `[data-testid="record-detail-content"]`, else the whole page), for the first element `[data-qualifier-row]` whose `data-qualifier-row` equals the chip's name trimmed and lower-cased, scrolls it near (`scrollIntoView({ block: "nearest" })`, when the browser has it) and focuses it. The Qualifiers line draws such rows (`value-qualifiers-line`; they carry `tabIndex={-1}`); the card must wrap its lines in an element with `data-testid="record-detail-content"` for the chips to stay inside their own card.
- The test ids and labels the card and its tests use: `plan-scale-view`, `data-kind="plan-scale-variable"`, and the labels `Scale unit`, `Scale rate`, `Scale context`, `Scale direction`, `Scale source`, `Edit ...` and `Go to qualifier ...`.
- Tailwind scanning this unit's `src` (and the kit's): the classes are arbitrary-value classes such as `text-[14px]`, `text-[var(--ink)]` and `bg-[var(--accent-soft,#e8eefc)]`.
- CSS variables: `--accent`, `--accent-soft` (with the fallback `#e8eefc`), `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--focus`, `--r-md`, and `--surface-2` (with its fallback). The `editorial-tokens` unit defines every one of them but `--surface-2`.
- React 19.

## Do not

- Do not copy `data` before you pass it in, or the card's comparison of list references (what changed) breaks: the line hands back the lists it did not touch as the same objects.
- Do not save from inside the line: it has no save. Save what `onChange` gives.
- Do not give the direction a default in the line. A card that has no direction reads "Higher is better"; the default of a Development Resource ("lower") is `defaultDirectionFor` in `value-card-model`, applied when the card is read.
- Do not rename the labels, the test id or the `data-qualifier-row` rule on one side only: the chips and the Qualifiers line depend on each other.

## Wrong readings

- "A Development Resource shows 'Lower is better' by itself." The line shows `scaleDirectionOf` of the data it is given, which is "higher" when the Scale has no direction. The "lower" of a Development Resource is put into the data by the model; a Resource whose data says "higher" shows "Higher is better".
- "The Scale is a sentence with chips." It has no sentence: it has a unit, a rate and a context, and the chips are in the rate and the context. An older `scale.text` is carried but never shown, and never rewritten.
- "A change of the direction makes the signed-in person the source." Not so: only a change of the unit, the rate or the context does, and only when the Scale has no source yet. A change of the source never does.
- "The unit is trimmed when it is saved." It is sent as typed (`"  min "` goes up with its blanks). Only the test for whether the line says anything (unit, rate or context) trims.
- "A click on a chip edits the rate." In click-to-type mode a chip goes to the qualifier and stops there; the words around the chip, and the rate when it has no chip, open the editor. The label "Rate:" is outside the button.
- "There is always a way to add a source." Out of Edit, a Scale with no source draws no source and no button; the source box is in Edit.
- "A chip always finds its row." Only if the Qualifiers line has drawn a row of that name in the same card; the Scale's name is matched trimmed and in lower case.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanValueLines.tsx`; the symbols of this unit, all in `src/PlanScaleBody.tsx` in the source's order, each copied by `sed -n 'A,Bp'`:

| Symbol | Lines |
|---|---|
| `DIRECTION_WORDS` | 101-105 |
| `goToQualifier` | 734-742 |
| `SentenceWithChips` | 744-787 |
| `PlanScaleBody` | 791-887 |

The pieces the other lines share with this one (`CommitText`, `Src`, `Piece`, `TextPiece`, `InlineSelect`, `ViewSrc`, `own`, `inPlace`, `box`, `faint`) are in `value-line-kit`. Code verbatim except the named changes (the comment-stripped text of each of the four symbols is the same as in the source, and the check is scripted).

Named changes:
1. Imports: `../../lib/base/planValue` and `../../lib/base/planValueModel` are `@kaigilb/gilbplatformcode-value-card-model` (`carryRaw`, `scaleDirectionOf` and the type `ScaleDirection`, checked to be exported there); the shared pieces above are from `@kaigilb/gilbplatformcode-value-line-kit`. The symbols are otherwise unchanged.
2. Comments: none of these four symbols carried a name or a tag; the file's header comment is the unit's own.
3. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx` and the tests below.

Tests: no test of the app renders the Scale line on its own. The app's tests that reach it go through the whole card (`RecordDetail.planValueCard.vaultit.test.tsx`, `RecordDetail.planValueClickToType.vaultit.test.tsx`, `RecordDetail.planValueV21.vaultit.test.tsx`, `RecordDetail.planValueQaFixes.vaultit.test.tsx`, `RecordDetail.planValueHost.vaultit.test.tsx`, `RecordDetail.planResourceCard.vaultit.test.tsx`, `RecordDetail.planResourceCard.rqa1.test.tsx`, `PlanValueQualifiersFollowScale.v32.test.tsx`, `PlanValueRename.qa4.v36.test.tsx`): they are the app's regression harness for the whole card, not for one line, and none of them is ported to this unit. All tests here are new: `src/scale.test.tsx` (37: the read text and directions; the chips and their DOM contract; click to type; Edit; the whole card going up with the untouched lists as the same objects; the unknown members carried; the stamp rule), `src/example.test.tsx` (2), `src/exports.test.ts` (1) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
