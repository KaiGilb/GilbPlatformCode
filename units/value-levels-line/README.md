# value-levels-line

Draws and edits the Levels line of a Value card: every level (Fail, Survival, Past, Status, Tolerable, Goal or on a Development Resource Budget, Wish, or a word of your own) as one line with its number, date, qualifiers, conditions, source and note, with the kind menu, paste of many level lines, and the move of older stored lists, giving every change up whole through onChange.

## What this is

One component, `PlanValueLevelsBody`, the body of the group titled "Levels" on a Value card and on a Development Resource card (`planLinesFor` of `plan-kinds` gives the `valueLevels` line to both; `PLAN_VALUE_LINE_LABELS.valueLevels` is "Levels"). On the card it comes fifth, after the Qualifiers and before the Meter. It takes the props of `ValueLineProps` (`value-line-kit`) and reads `data.levels`, `data.scale`, `data.variables` and `data.resource`; it never writes to a vault.

- A level is a kind (a standard word or any word), a number, and a qualifier: a date, choices for the Scale's qualifiers (Country = Norway), free conditions, and for a Scale where a range in the middle is best, a side (low or high). It has a source and a note. A line is written `Goal [2027-06-30, Release 3.0, Norway] 5 <- Ann estimate`. On a Development Resource the word Goal is stored as Budget, whether typed, pasted or chosen, and a Budget sorts where a Goal does.
- Order: groups of levels that share one qualifier, in the order each group first appears; inside a group the standard kinds from Fail to Wish, then custom words in the order given. A little room is left between groups.
- Read (the card is not in Edit): one block (`plan-levels-view`), a line of text for each level, the find's cap note above them when the card says the find was cut off (`plan-levels-capped`: "Showing the first 300 of 450 records at this level."), a grey " (not in the Scale)" after a choice for a name the Scale no longer has (`level-not-in-scale`), and, for a source that is a record with no words, its live label from the host (`useLinkLabel`; "…" while the host has none). A read-only card with no levels draws nothing.
- Click to type (`canEdit` and not Edit): each piece of a line is a button that turns into its editor and back: the kind (with a datalist of the standard kinds), the date (a date input), each condition, each choice (the qualifier chooser of `qualifier-value-picker`, several options may be ticked), the side (a select), the number, the source (words, or the source picker for a record), the note. Enter or leaving saves a changed text once; Escape saves nothing. Faint ways to add: a date ("Add Level 1 date") where there is none, a condition, and a "+ qualifier" chip for the Scale's names the level has not set (with "Add a condition" in its menu).
  - The number is the author's text: `5-10` is a range drawn at its middle and shown as written, `approx. 5` is a text with no number, `5.50` keeps its text, `1,5` is 1.5; `0,001` is read as 1 (the model's rule, kept as it is). An unchanged number sends nothing. An emptied number clears it.
  - The date: click it and pick another (Enter or leaving saves once, Escape cancels); an emptied date clears it. "Add a date" never clears: it sends nothing unless a date was picked.
- Blank rows: an empty Value shows Status, Tolerable and Goal (a Development Resource: Status, Tolerable, Budget) as blank rows to fill, in click to type and in Edit. A blank row is not written: it joins the card's levels, at the end, only once it has a number, a date, a condition, a choice, a side, a note or a source; renaming its kind alone writes nothing. Blank rows exist from the moment the line mounts with no levels.
- "+ Level" (click to type): opens a panel (`plan-level-panel`) with the controls below; Escape closes it. In Edit the same controls are in the card with no panel (`plan-level-add`).
  - the kind menu: a button "+ Level" (`Pick a level kind`) that opens a menu in a portal on the page body (`Level kinds`): Past, Status, Tolerable, Goal (Budget), Wish, and "Other word…". Arrow keys move and wrap; Escape closes it and gives the focus back to the button; a press outside closes it without moving the focus; it is on the open stack of `open-popups` while open (exclusive: opening another such menu closes it);
  - a button for each of those kinds (`Add Past level`...), and "Other word…" (`Other level word`) which opens a box (`New level kind`, Enter adds);
  - a kind adds a blank row (nothing is written): it copies the qualifier choices (not the date) of the most recent level, a Status gets today's date, and in Edit its number box takes the focus;
  - the paste box (`Paste lines`) and "Add pasted lines": each line is read as a level (`Kind [date, conditions, choices] number <- source note`); blank lines and lines that cannot be read are skipped; the readable ones are added after the card's levels in one change; a warning about what the reading changed ("Country: ALL replaces the other values") is shown once in a status line (`plan-paste-warning`) until the box is typed in again.
- Edit: a card for each level (`plan-level-row`): the kind (a box with the datalist), the date (a date input that writes every change, an emptied one clears it), a button for each of the Scale's defined names (`Country: Norway`, opens the chooser) and for each choice the level has for another name (greyed, "Not in the Scale"), the side (only for a Scale where a range in the middle is best), the conditions as chips (`Condition, Enter`), the number, the source box, the note, "Copy qualifier to a new level" and "Remove level N". The numbers in the labels count the levels in the order they are stored, not in the order they are drawn.
- Older stored lists: with `legacy.levels` more than 0 the whole line is shown read-only (as if not in Edit and not editable) and the one button that moves the older lists (`LegacyMoveButton` of the kit, `plan-levels-move`) is in this line.
- What goes up: `onChange({ ...data, levels: next })`, where `next` carries the unknown items of the old list (`carryOthers`) and each edited level carries its unknown members and its key (`carryRaw`); the other levels go up as the same objects, and the other lists as the same objects. On a Development Resource every write stores Goal as Budget in all the levels it hands up. A change of the number or of the kind makes the signed-in person (`selfId`) the source of a level that has none; a date, a choice, a condition, a side, a note, the source (words or picked), a paste and a copy do not.

## What this is not

- Not a writer. Nothing is sent to a vault; `onChange` is the only way out, and the card saves. The card makes a level's record from the new list.
- Not the rules: the order (`sortLevels`), the line text (`levelLineSegments`), the reading of a pasted line (`parseLevelLineWarn`), the number (`levelOfTyped`, `levelNumberDisplay`), the blank test (`levelIsBlank`), the new row (`newLevelFromClick`), the Budget rule (`resourceKind`), the Scale's names and the unknown members are `value-card-model`.
- Not the label of a record: the live label of a source that is a record is the host's `useLinkLabel` (see below).
- Not the graph: the Illustration line (`value-illustration`, `value-graph`) draws the same levels; its "New qualifier set..." only asks this line to take the focus (see the DOM contract below).

## How to take it

Package: `@kaigilb/gilbplatformcode-value-levels-line`

Take it together with its peers `open-popups`, `plan-card-facts`, `qualifier-value-picker`, `value-card-model` (0.2.0 or later) and `value-line-kit`, and their own peers (`qualifier-value-picker` has `plan-button-row` and `qualifier-values`; the kit's: `base-record`, `plan-source` and `type-chooser`, with theirs). React 19 and `react-dom` (for the kind menu's portal) are peers. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each: one open-popups stack):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/open-popups <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/term-origin <path-to-the-library>/units/value-card-model <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-levels-line
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off.

## Examples

The host of the lines above the line, and a card that holds the data in state. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { PlanValueLevelsBody } from "@kaigilb/gilbplatformcode-value-levels-line";

// The host of the lines: here only the label of a record that is a source. A hook, called on every render; the same object while mounted.
const host: ValueLinesHost = { useLinkLabel, searchTypes: searchOntologyTypes, blankReach: "Type to search the ontology." };

function LevelsCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <ValueLinesHostContext.Provider value={host}>
      <PlanValueLevelsBody data={data} editing={false} canEdit vaultId={vaultId} record={record} onOpen={openRecord} selfId={me}
        onChange={(next) => { save(next); setData(next); }} />
    </ValueLinesHostContext.Provider>
  );
}
```

## What the host must supply

- The props of `ValueLineProps` (`value-line-kit`) that this line reads: `data`, `editing`, `canEdit`, `vaultId`, `record` (its `id` names the datalist of kinds, `plan-level-kinds-<id>`), `onOpen`, `selfId`, `onChange(next: ValueCardData)`, `legacy?` and `host?` (`host.capped` is the cap note; `progress` and `onNotice` are the card's, not read here). `onChange` is the only write seam; it gets the whole card, once for one act. A blank row is not in `data` until it has something.
- The host of the lines (`ValueLinesHostContext` of `value-line-kit`), above the line whenever a level is drawn; without it the line throws an error that names the provider. Member used here: `useLinkLabel(uri, vaultId)`, a hook (see the kit for its reference implementation).
- The providers of `plan-source` above it (its host, `RefLabelContext` of `entity-ref-value`, `PickerQueryContext` of `record-picker`): the source control reads them.
- The DOM contract with the graph's "New qualifier set..." (`focusLevelEditor` of `value-graph`), kept as the source has it: the graph walks up from itself to the first ancestor that holds `[data-testid="plan-level-add"]` or `[data-testid="plan-levels-view"]`, looks in it for `[data-testid="plan-level-panel"]` or `[data-testid="plan-level-add"]`, else presses, once, the button whose text is `+ Level`, and tries again every 40 ms; in the panel it focuses `input[aria-label="New level kind"]`, else the first button or input. This line draws those ids, that label and that button text; the card must put the Illustration and the Levels in one element so the walk finds it.
- The layers: the kind menu is portalled to the page body, or to the create dialog's root when the line sits in one (`useModalPortalTarget` of `open-popups`), at `MODAL_LAYER_Z`. A host with a create dialog of its own pushes its root to the same `open-popups` instance (`openPortalRoots`).
- The test ids and labels the card and its tests use: `plan-levels-view`, `plan-level-row`, `plan-level-add`, `plan-level-panel`, `plan-paste-warning`, `plan-levels-capped`, `plan-levels-move`, `level-not-in-scale`, and the labels `Level N kind`, `Level N date`, `Level N value`, `Level N note`, `Level N source`, `Level N condition`, `Level N side`, `Level N <Name>`, `Add Level N date`, `Add Level N condition`, `Add Level N qualifier`, `Set Level N <Name>`, `Pick a level kind`, `Level kinds`, `Add <Kind> level`, `Other level word`, `New level kind`, `Paste lines`, `Copy qualifier to a new level`, `Remove level N`, `Remove condition <text>`.
- Tailwind scanning this unit's `src` (and the kit's and the chooser's): the classes are arbitrary-value classes such as `min-h-11`, `min-[900px]:flex-nowrap`, `before:content-['_[date']` and `w-48`. Without it the layout and the faint "+" and "date" faces are missing.
- CSS variables: `--accent`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--focus`, `--r-md`, `--r-sm`, and `--surface-2` (with its fallback). The `editorial-tokens` unit defines every one of them but `--surface-2`.
- React 19 and `react-dom`.

## Do not

- Do not copy `data` before you pass it in, or the card's comparison of list references (what changed) breaks: the line hands back the levels it did not touch as the same objects.
- Do not make a level's record from anything but the list `onChange` gives. A level's identity is its key (`lkey`, kept by `carryRaw`); do not make level objects anew on every render without keys, or an open editor loses its level.
- Do not rename the ids, labels and button text of the DOM contract on one side only: the graph depends on them.
- Do not give the host's `useLinkLabel` a different hook order on different calls, or a new function identity on each render.
- Do not drop the unknown items of `data.levels` when you read them from the vault: they ride on the list (not enumerable) and the line hands them back.

## Wrong readings

- "The placeholder of the paste box is neutral." It is copied as it is: `Paste lines, e.g. Goal [2027-06-30, Release 3.0] 5 <- Kai-Zen estimate` (Budget in place of Goal on a Development Resource). Its example source, Kai-Zen, is the name of an agent of the app's owner, and it is user-visible text; the unit keeps it because changing it changes what people see. A copy for another audience changes that one string.
- "A blank row is a level." It is not written until it has something; a Status added from the menu is a blank row with today's date, and that date makes it something once it is edited, not before.
- "Renaming a blank row's kind writes it." It does not; the row moves to its place among the kinds.
- "Goal is Goal on every card." On a Development Resource it is Budget; every write of such a card stores Goal as Budget, also in levels that were not touched.
- "The number you type is kept as you typed it." Only a text that is not the plain number is kept (a range, words, `5.50`, `1 000`); `1,5` becomes 1.5 and `0,001` becomes 1, and the text typed is gone.
- "Add a date can clear a date." It cannot: it opens on nothing and sends nothing unless a date was picked. The date piece of a level that has a date can be emptied; the date box in Edit clears at each change.
- "A date typed in Edit is saved on leaving." The date box in Edit writes at every change; a date piece in click to type writes on Enter or leaving.
- "The labels count the lines in the order they are drawn." They count the levels in the order they are stored (a blank row after the stored ones); the drawing is sorted.
- "A press anywhere outside the kind menu closes it and takes the focus back to its button." It closes it without moving the focus; a press on the menu's own button is left to the button, which toggles it.
- "Escape in the source picker closes it from anywhere." Only while the focus is inside it; the picker does not take the focus when it opens.
- "The cap note is in Edit." It is in the read view only.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanValueLines.tsx`; the symbols of this unit, all in `src/PlanValueLevelsBody.tsx` in the source's order, each copied by `sed -n 'A,Bp'`:

| Symbol | Lines |
|---|---|
| `useLinkLabel` | 447-466 |
| `WithSourceLabel` | 468-481 |
| `QualifierField` | 486-521 |
| `AddPiece` | 619-636 |
| `LinkedSourcePiece` | 638-680 |
| `ConditionChips` | 1831-1860 |
| `NumberText` | 1862-1885 |
| `PlanValueLevelsBody` | 1911-1925 |
| `LevelKindMenu` | 1927-2023 |
| `PlanValueLevelsList` | 2025-2592 |

- `src/lib/base/planFind.ts` lines 15-16 (`PLAN_FIND_CAP` with its doc comment) and 39-41 (`planCapSentence`) to `src/planCapSentence.ts`, unchanged (the same text is in `value-graph` and `plan-tag-links`).

The pieces the other lines share with this one (`CommitText`, `Src`, `Piece`, `TextPiece`, `InlineInput`, `InlineSelect`, `UnsetQualifiers`, `LegacyMoveButton`, `own`, `inPlace`, `eq`, `hint`, `box`, `small`, `quiet`, `faint`, `chip`, `faintBtn`, `ValueLineProps`) are in `value-line-kit`. Code verbatim except the named changes (the comment-stripped text of each of the ten symbols differs from the source only as 1 and 2 say, and the check is scripted).

Named changes:
1. `useLinkLabel` (source lines 447-466, whose body read `useRecords`, `useQuery`, `readRecord`, `vaultOriginOf` and `refDisplayName`) is the host member `useLinkLabel(uri, vaultId)` of the host of the lines (`value-line-kit`); here the function keeps its name, its doc comment and its signature, and its body is `return useValueLinesHost().useLinkLabel(uri, vaultId);`. `WithSourceLabel` calls it unchanged. GilbApp's body, verbatim, is the reference host implementation in the kit's README.
2. Imports: `../ui/layers` and `../ui/openStack` are `@kaigilb/gilbplatformcode-open-popups` (`MODAL_LAYER_Z`, `useModalPortalTarget`, `registerOpen`); `./PlanQualifierValue` is `@kaigilb/gilbplatformcode-qualifier-value-picker`; `../../lib/base/planCard` is `@kaigilb/gilbplatformcode-plan-card-facts` (`sourceWithText`, `PlanSourceValue`); `../../lib/base/planValue` and `../../lib/base/planValueModel` are `@kaigilb/gilbplatformcode-value-card-model` (each name was checked to be exported there: `blankLevel`, `carryOthers`, `carryRaw`, `defaultLevelRowsFor`, `levelGroupKey`, `levelIsBlank`, `levelLineSegments`, `levelNumberDisplay`, `levelOfTyped`, `newLevelFromClick`, `offeredLevelKindsFor`, `parseLevelLineWarn`, `qualifierValues`, `resourceKind`, `scaleDirectionOf`, `scaleQualifierNames`, `sortLevels`, `withScaleQualifiers`, `RESOURCE_LEVEL_KINDS`, `STANDARD_LEVEL_KINDS` and the type `ValueLevel`); `planCapSentence` from `../../lib/base/planFind` is `./planCapSentence`; the shared pieces above are from `@kaigilb/gilbplatformcode-value-line-kit`. The remaining symbols are otherwise unchanged.
3. Comments: the batch tags of the source's comments (in `LevelKindMenu` and `PlanValueLevelsList`, and on `NumberText`) are removed, keeping the technical meaning. The paste placeholder is not a comment and is kept (see "Wrong readings").
4. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `src/planCapSentence.ts` (above), `scripts/check-host-agnostic.mjs`, `test/mount.tsx`, `test/levels.tsx` and the tests below.

Tests: no test of the app renders the Levels line on its own. The app's tests that reach it go through the whole card (`RecordDetail.planValueCard.vaultit.test.tsx`, `RecordDetail.planValueClickToType.vaultit.test.tsx`, `RecordDetail.planValueLevelRecords.vaultit.test.tsx`, `RecordDetail.planValueV21.vaultit.test.tsx`, `RecordDetail.planValueQaFixes.vaultit.test.tsx`, `RecordDetail.planValueHost.vaultit.test.tsx`, `RecordDetail.planResourceCard.vaultit.test.tsx`, `RecordDetail.planResourceCard.rqa1.test.tsx`, `PlanValueQualifiersFollowScale.v32.test.tsx`, `PlanValueRename.qa4.v36.test.tsx`): they are the app's regression harness for the whole card, not for one line, and none of them is ported to this unit. All tests here are new: `src/levelsRead.test.tsx` (the read lines, the host's label, the cap note, the older lists), `src/levelsPlace.test.tsx` (blank rows, the number, the three date inputs, the pieces, the qualifiers, the "+ Level" panel, the kind menu, paste, the DOM contract), `src/levelsEdit.test.tsx` (the rows, the boxes, the add controls, what goes up), `src/example.test.tsx`, `src/exports.test.ts`, `src/planCapSentence.test.ts` (2) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
