# value-graph

The Value card's graph: the Scale as an arrow and as a timeline, with the levels as markers you can drag, a "+ New" menu, qualifier chips, endpoint pictures and a full-screen view; it never writes, the host saves what onChangeLevels gives.

## What this is

One component, `PlanValueGraph`, with its parts. It draws the Illustration line of a Value card (and of a Development Resource card) from the card's data, and gives every change back as the whole new list of levels.

- Two views, chosen by the tabs `Arrow` and `Timeline`:
  - Arrow: one row for each qualifier set (the same choices, conditions and side; the date is not part of the set). Each row is an arrow along the Scale with the coloured bands (red, yellow, green) that follow the latest-dated Tolerable and Goal, a dashed line from Past to Status, a dotted green line from Status to Goal with the distance ("40 min to Goal"), and one marker for each level with its own value and date under it. A level whose number is a range text ("5-10") is a short bar and shows the text as written; a text that is not a number ("approx. 5") shows as written and is not drawn on the line.
  - Timeline: a real chart. Dates on the x axis with ticks, values and the unit on the y axis, gridlines, a "today" line, one line for each qualifier set (solid up to its Status, dashed after it), a Fail drawn as a red dashed horizontal line, a lane at the right for levels with no date (60% opacity), and a legend whose click highlights one set.
- Markers (Status a filled circle, Past a ring, Tolerable a bar, Goal a tall block, Wish a star, Fail and Survival a red bar, any other word a diamond), each with a transparent hit area of at least 44 by 44 px. A click opens the level's popover (its value, its date, a close button). With editing on, a marker drags (the Arrow along the value; the Timeline in value and date, locked to the main direction after 6 px, Shift releases the lock, Escape cancels, a drop is one write), and the keys step it: Left and Right step the value on the Arrow, Up and Down on the Timeline; on the Timeline Alt with Left or Right moves the date a day (Shift: seven days), written once on key-up or after 400 ms.
- The "+ New" menu (button, or the key N): one section for each qualifier set drawn, with the kinds `MENU_KINDS` (Past, Status, Tolerable, Goal, Wish; on a Development Resource `RESOURCE_MENU_KINDS`, Budget in place of Goal), "Other word..." for any other kind, a search and "Show all (N)" when there are more than `MENU_SETS_SHOWN` (12) sets, and "New qualifier set...". A pick is one write of the old list with the new level at its end: the new level copies the set's qualifier, takes its date and value from the set (`levelLike` of the value-card-model unit) and opens selected with its number ready to type. On the Timeline a click on an empty spot of the plot offers "Add here: date, value" at that date and value, the nearest set first.
- Qualifier chips (`RowChips`): while editing, each variable a row sets is a chip that opens the qualifier picker; a pick moves every level of the set in one call. A filter strip above the graph (`plan-graph-filter`) narrows the sets shown by a variable's value without changing the list.
- Endpoint pictures (`EndpointEnd`): the picture of the Subject type at the base of each Arrow row and of the Reference type at the tip, with a caption that opens the type's definition. The picture is the type's picture and nothing else: a type with none draws no image, only the caption.
- Full screen (the `Full screen` button, or the key F): the graph moves into a dialog layer in a portal on the page body; the view and the filter are kept across the switch; the page scroll is locked while it is open; Escape closes one layer at a time (a drag, then a popover or the "+ New" menu or a qualifier picker, then the layer); focus returns to the button.
- Header notes: `progress` ("Moving 12 of 50..."), `capped` ("Showing the first 2000 of 2400 records at this level.") and a notice line.

## What this is not

- Not a writer. It holds no record, calls no network and keeps no copy of the levels: every change is `onChangeLevels(next)` with the full new list, and the host saves it (and shows the saved data again).
- Not the Levels list, the Scale line or the Value's other lines. "New qualifier set..." only asks the card's own "add level" editor to take the focus (see "What the host must supply").
- Not the model or the geometry: the data types and the level rules are `value-card-model`, the axes, the snapping and the bands are `value-graph-geometry`.
- Not the level date field as a piece: the date field in the level popover is the same field that `level-date-input` holds as a standalone piece, copied inside this graph as in the source, and this unit does not use that unit.
- Not a store of types: the pictures and definitions of the endpoint types come from the app through the contexts of `type-picture` and `type-term-popover`.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-graph`

Take it together with its peers: `open-popups`, `qualifier-value-picker`, `type-picture`, `type-term-popover`, `value-card-model` (0.2.0 or later) and `value-graph-geometry` (0.2.0 or later). Their own peers are installed too: `qualifier-value-picker` has `plan-button-row` and `qualifier-values`; `type-picture` has `type-name`; `type-term-popover` has `term-origin`; `value-card-model` has `plan-card-facts`, `plan-kinds` (which has `type-key`), `qualifier-values`, `term-origin` and `type-key`; `value-graph-geometry` has `date-rules`. React 19 and `react-dom` are peers (`react-dom` for the full-screen layer, the "+ New" menu and the type popover, which are portalled to the page body). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each: one open-popups stack, one set of contexts, one term origin, one level-key table):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/date-rules <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-key <path-to-the-library>/units/type-name <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/open-popups <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/value-card-model <path-to-the-library>/units/value-graph-geometry <path-to-the-library>/units/value-graph
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off, as those of `value-card-model` and `value-graph-geometry` do.

## Examples

The providers the graph needs, a card that keeps the data in state, and the host saving what `onChangeLevels` gives. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueGraph } from "./index";

// Once, at the start of the app: where the types' documents are, and where their picture files are served from.
setTermOrigin("https://ontology.example.test");
const pictures = createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" });
const readTermDefinition: ReadTermDefinition = async () => ({ state: "none" });

// The graph never writes: the host saves what it gives, here into a list, and shows the saved levels again.
function Illustration({ start, save }: { start: ValueCardData; save: (levels: ValueLevel[]) => void }) {
  const [data, setData] = useState(start);
  return (
    <TypePictureSourceContext.Provider value={pictures}>
      <TermDefinitionContext.Provider value={readTermDefinition}>
        <PlanValueGraph
          data={data}
          editing
          onChangeLevels={(levels) => {
            save(levels);
            setData({ ...data, levels });
          }}
        />
      </TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}
```

## What the host must supply

- The props of `PlanValueGraph` (`PlanValueGraphProps`):
  - `data: ValueCardData`: the card's data (`value-card-model`). `data.resource` true makes it a Development Resource: a Budget level is drawn, joined and snapped as the Goal point (`kindClass`), the caption says "to Budget", and the "+ New" menu offers `RESOURCE_MENU_KINDS`.
  - `editing: boolean`: dragging, stepping, the chips and "+ New" are on only when true.
  - `onChangeLevels(next: ValueLevel[])`: called with the whole new list after a drag, a key step, a popover edit, a chip pick or an add. It is the only write seam. Called once for one act (a drop, a pick), never on each pointer move.
  - `height?: number`: the Timeline's height in px; default is the width times 0.45, between 320 and 560.
  - `title?: string`: the name shown in the full-screen header; default the Scale's text, then "Illustration".
  - `progress?: { done: number; total: number } | null`: while the host moves a whole row, "Moving 12 of 50..." shows and dragging is off.
  - `capped?: { total: number; cap: number } | null`: the host's find stopped at its cap: "Showing the first N of M records at this level.".
  - `onNotice?(notice: string | null)`: the graph shows its one notice itself ("This level was removed by someone else.", when a level under a popover, a drag or a key step is gone from the list) and hands it to the card's own notice line; a year out of range is shown under the date field, as `plan-date-year-error`, and is not a notice.
- The `TypePictureSourceContext` provider of `type-picture` (made with `createTypePictureSource`), above the graph. With none, no type has a picture and the endpoint ends draw their captions only.
- The `TermDefinitionContext` provider of `type-term-popover` (a `ReadTermDefinition`), above the graph. With none, the graph throws the error that names it as soon as it draws an endpoint that names a type; a card whose endpoints name no type needs neither. Also `setTermOrigin(...)` of `term-origin`, once, for the link in the popover.
- Level identity is per object: keep the level objects you were given while the list has not changed (see "Wrong readings").
- If the host has a create dialog of its own, it must push its root to the same `open-popups` instance (`openPortalRoots`), so that the graph's Escape and outside-click rules see it.
- Tailwind scanning this unit's `src` (the classes are arbitrary-value classes such as `min-h-[44px]`, `z-[70]`, `[transform-box:fill-box]`, `group-hover:scale-[1.2]`, `rounded-[var(--r-md)]`). Without it the layout classes are missing.
- CSS variables: the graph reads `--accent` and `--ink-soft` (the main file), `--danger` (with the fallback `#b91c1c`, for the year error), `--paper`, `--ink`, `--line`, `--serif`, `--ink-faint` and `--sel` (the full-screen layer and the menu), `--surface` (chips and menu), `--r-md` (the menu). The `editorial-tokens` unit defines every one of them but `--danger`. The qualifier picker reads its own (`--focus`, `--accent`, `--ink`, `--ink-faint`, `--ink-soft`, `--line`, `--r-md`, `--surface`).
- The inline SVG colours, fixed in the drawing and not variables: marker and line fills `#111827 #9ca3af #fff #d97706 #16a34a #dc2626 #eab308 #6366f1`, axis and text `#6b7280 #374151 #15803d #e5e7eb #f3f4f6 #dbeafe`, the series colours of the Timeline `#2563eb #9333ea #0d9488 #db2777 #ca8a04 #4f46e5`; the band colours are those of `value-graph-geometry`.
- The DOM contract with the Value card's Levels line (a later unit): `focusLevelEditor(from)` (called by "New qualifier set...") walks up from the graph to the first ancestor that holds `[data-testid="plan-level-add"]` or `[data-testid="plan-levels-view"]`. In it it looks for `[data-testid="plan-level-panel"]` or `[data-testid="plan-level-add"]`; when there is none it presses, once, the button whose text is `+ Level` and tries again every 40 ms, up to six times in all. In the panel it scrolls to the centre and focuses `input[aria-label="New level kind"]`, else the panel's first button or input. The Levels line must keep those test ids, that label and that button text; without them the call does nothing.
- The other DOM contracts, kept as the source has them: the Escape rule of the full-screen layer leaves a qualifier picker its own Escape by the selector `[role="group"][aria-label^="Choose "]` (`OWN_ESCAPE`), which is the group label of `qualifier-value-picker` (`Choose <name>`); and the test ids `plan-graph-filter`, `plan-graph-placeholder`, `plan-graph-progress`, `plan-graph-capped`, `plan-graph-notice`, `plan-graph-fullscreen`, `plan-date-year-error`, `endpoint-subject`, `endpoint-reference`, `endpoint-type-popover` and the `data-*` attributes (`data-kind="plan-value-graph"`, `data-level`, `data-row`, `data-series`, `data-today`, `data-newmenu`, `data-newmenu-set`, `data-kind-btn`, `data-has-one`, `data-endpoint-end`, ...), which tests and the card use.
- `markerRenders` (`{ count }`) is a test hook: each marker render adds one. A pointer move must re-render at most two markers; the tests of this unit pin that with 200 levels.
- React 19, `react-dom`.

## Do not

- Do not write from the graph's props or the data you pass in: `onChangeLevels` gives a new list, and the data you pass must be the saved one. Show the old data after a failed write and the marker snaps back.
- Do not install a second copy of `open-popups`, `type-picture`, `type-term-popover` or `value-card-model`: each holds a stack, a context or a table of level keys of its own, and a popover held on a freshly added level would close with "This level was removed by someone else." after a save.
- Do not replace the level date field in the popover by `level-date-input`: it is the same field, and this one is wired to the graph's year range, its notice and its single write.
- Do not call `onChangeLevels` back into `data` with level objects made anew on every render (see "Wrong readings").
- Do not add a delete path here: the graph has none; removing a level is the Levels line's.

## Wrong readings

- "A level is the same level when its list position is the same." A level's identity is per object: its record key (`lkey`, kept on the level by `value-card-model`), else a client id made the first time the object is seen (a `WeakMap` keyed by the object). An open popover, a drag, a key step and a selection hold that id, so a list that changes under them (someone else deleted an earlier level) does not move them to another level, and a level that is gone writes nothing and says "This level was removed by someone else.". A host that makes new level objects on every render, with no record key on them, changes the id each time: the popover closes and a drag is lost. Keep the objects (or their record keys) while the list is unchanged.
- "Today on the Timeline is the UTC day." It is the person's own calendar day, as a UTC-midnight timestamp (`Date.UTC(local year, local month, local day)`). Do not swap it for a UTC day: just after local midnight in New Zealand it would be yesterday's line.
- "Budget is Goal on every card." Only on a card whose `data.resource` is true. On a Value a Budget is an ordinary custom kind (a diamond, not joined to the line, no "to Goal" distance).
- "The 'has one' mark of the menu follows `kindClass`." The set's kinds are read through `kindClass`, but the mark is looked up by the button's own lower-case word, so on a Development Resource the Budget button never shows "has one" even when the set holds a Budget (the Goal button of a Value does). Kept as in the source; a test pins it.
- "The date chip is on the Arrow row." It is gone: a level's date is changed on the Timeline, in the level's popover, and in the Levels list. The Arrow row keeps its qualifier chips.
- "A qualifier chip moves one level." It moves every level of the set, Past and Status included, in one call.
- "The number you type is always a plain number." `parseNumberText("0,001")` reads as 1 (the model's rule) and feeds the number shown; a date typed in the popover is accepted in any `YYYY-MM-DD` shape in 1900..2200 without a calendar check (2026-02-30 is accepted).
- "`level-date-input` is a second field." It is the same field as a standalone piece; this graph has its own copy of it, as the source does.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, whole files, in `src/components/records/`:

| Source | Lines | In this unit |
|---|---|---|
| `PlanValueGraph.tsx` | 1-1542 | `src/PlanValueGraph.tsx` |
| `PlanValueGraph.ui.tsx` | 1-199 | `src/ui.tsx` |
| `PlanValueGraph.chips.tsx` | 1-146 | `src/chips.tsx` |
| `PlanValueGraph.endpoint.tsx` | 1-98 | `src/endpoint.tsx` |
| `PlanValueGraph.newMenu.tsx` | 1-235 | `src/newMenu.tsx` |
| `lib/base/planFind.ts` | 15-16 and 39-41 | `src/planCapSentence.ts` |

The geometry file `PlanValueGraph.geometry.ts` is not here: it is the `value-graph-geometry` unit.

Code verbatim except the named changes below (the comment-stripped text of each of the five files differs from the source only in the import lines).

Named changes:
1. File names: the prefix `PlanValueGraph.` is dropped from the four parts (`ui`, `chips`, `endpoint`, `newMenu`), as the unit's import check allows only names without a dot; the imports between the five files follow (`./PlanValueGraph.newMenu` is `./newMenu`, and so on). The component and function names are unchanged.
2. Imports: `../../lib/base/planValueModel` and `../../lib/base/planValue` are `@kaigilb/gilbplatformcode-value-card-model` (each name was checked to be exported there: `kindClass`, `ALL_VALUE`, `carryRaw`, `levelNumberDisplay`, `levelRangeEnds`, `levelNumberTyped`, `levelHasQualifierValue`, `levelKey`, `levelLike`, `qualifierValues`, `resolveLevelKey`, `scaleDirectionOf`, `scaleQualifierNames`, `withScaleQualifiers` and the types `ValueCardData`, `ValueLevel`, `EndpointPart`); `./PlanValueGraph.geometry` is `@kaigilb/gilbplatformcode-value-graph-geometry` (every name checked); `../ui/layers` and `../ui/openStack` are `@kaigilb/gilbplatformcode-open-popups`; `./PlanQualifierValue` is `@kaigilb/gilbplatformcode-qualifier-value-picker`; `useTypePicture` from `./TypePicture` is `@kaigilb/gilbplatformcode-type-picture`; `./TypeTermPopover` is `@kaigilb/gilbplatformcode-type-term-popover`; `planCapSentence` from `../../lib/base/planFind` is `./planCapSentence`.
3. `src/planCapSentence.ts` is new in this unit: the app's `PLAN_FIND_CAP` (with its doc comment) and `planCapSentence`, copied unchanged. The same function is in the `plan-tag-links` unit (`src/planFindNote.ts`); the two texts were compared and are identical.
4. Comments: the names of people, the batch and cycle tags and the QA ids are removed, keeping the technical meaning; a note that named two components of the app (the layer "follows OrgListSheet and Modal") says what the layer does instead, and "in the order the brief names them" is "in this order". No code line changed.
5. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx`, `src/planCapSentence.ts` (above) and the tests below.

Tests (from the app's `PlanValueGraph.*.test.ts(x)` of the same commit; inputs and expectations kept, titles and comments without the batch tags):

| Source | Ported | Left out |
|---|---|---|
| `PlanValueGraph.vaultit.test.tsx` | 9 of 9, `src/basics.test.tsx` | none |
| `PlanValueGraph.markers.v24.test.tsx` | 6 of 6 (8 runs: two cases run for Arrow and Timeline or for Status and Past), `src/markers.test.tsx` | none |
| `PlanValueGraph.fullscreen.v25.test.tsx` | 13 of 13, `src/fullscreen.test.tsx` | none |
| `PlanValueGraph.timeline.v26.test.tsx` | 10 of 10, `src/timeline.test.tsx` | none |
| `PlanValueGraph.dateDrag.v27.test.tsx` | 21 of 21, `src/dateDrag.test.tsx` | none |
| `PlanValueGraph.newMenu.v28.test.tsx` | 30 of 31, `src/newMenu.test.tsx` (including the 3 cases of `levelLike`, a function of `value-card-model` which the menu rests on) | 1: "a Past added from the menu onto a taken tag: one add, POST Speed.Past (409) then Speed.Past.2" (the write chain through `useValueLevels` over a stubbed fetch: the later value-card-write unit) |
| `PlanValueGraph.endpointAndQualifierEdit.v29.test.tsx` | 19 of 23 (20 runs), `src/endpointAndChips.test.tsx` | 4: the whole "the write chain" block: "a level date (popover) onto a date a same-set Goal holds: the tag takes .2 ...", "all three levels of a row move: three patches in order, each renamed", "the 2nd of 3 patches fails: the 3rd is not sent, the 1st is patched back ...", "the put-back also fails: the notice names the levels that moved and those that did not" (the write chain through `useValueLevels`) |
| `PlanValueGraph.oneArrowPerSet.v31.test.tsx` | 7 of 7, `src/oneArrowPerSet.test.tsx` | none |
| `PlanValueGraph.range.v38.test.tsx` | 3 of 3, `src/range.test.tsx` | none |
| `PlanValueGraph.v30.test.tsx` | 20 of 20, `src/behaviour.test.tsx` | none |
| `PlanValueGraph.qa3.v30.test.tsx` | 12 of 12, `src/levelsAndLayers.test.tsx` | none |
| `PlanValueGraph.writePath.v27.test.tsx` | 0 of 8 | all 8 (the write path of a date change through `useValueLevels` over a stubbed fetch, with its 412 and 500 cases: the later value-card-write unit) |
| `PlanValueGraph.bands.vaultit.test.ts` (9) and `PlanValueGraph.timeline.v26.test.ts` (22) | not here | they test the geometry only and are in `value-graph-geometry` |

In the cases that needed the type picture and the type definition, `vi.mock` of the app's `typePicture` and `termDefinition` modules is the two contexts of `test/mount.tsx` (a picture source whose `fetchTypePictureSrc` answers from `pics.map`, and a reader that is `read`), mounted around every `render`; the addresses of the app's ontology server are `https://ontology.example.test/...`. jsdom has no `PointerEvent`, so `test/mount.tsx` gives it a stand-in (a `MouseEvent` that carries `pointerId` and `pointerType`); without it no drag test fires. Clock: `markers.test.tsx` "copies choices ... and lands on the same row" expects the UTC day of `new Date()` where the card uses the person's local day, so it fails between local midnight and UTC midnight (the source has the defect); it runs here with the clock set at midday UTC (`vi.setSystemTime`), which is the same day in every zone from UTC-11 to UTC+11. The other cases that fix the clock do the same (12:00 UTC on 2026-10-27, read as "2026-10-27"); run in a zone at UTC+13 (Pacific/Auckland) two cases fail, one in `markers.test.tsx` and "every kind, from every set ..." in `newMenu.test.tsx`, the source's own limit; the suite passes in UTC, America/Los_Angeles and Europe/Helsinki.

New tests: `src/resource.test.tsx` (10: a Budget on a Development Resource is the Goal marker, joins the Arrow ("to Budget") and the Timeline, makes the band, a Value's Budget does not; the "+ New" menu offers `RESOURCE_MENU_KINDS` and `MENU_KINDS`; a Wish takes a Budget's date on a Resource only; a Budget is written as a Budget; the "has one" mark), `src/today.test.tsx` (2: the Timeline's today line is the local day in New Zealand and in Los Angeles), `src/focusLevelEditor.test.tsx` (5: the DOM contract), `src/hosts.test.tsx` (4: without and with the two contexts), `src/example.test.tsx` (2: the README example), `src/exports.test.ts` (the export list), `src/planCapSentence.test.ts` (2) and `src/hostAgnostic.test.ts` (runs the host-agnostic check against planted faults).
