# value-illustration

Draws the Illustration line of a Value card: the value graph of its levels, read-only while an older stored list of levels is not moved, giving every change of the levels up whole through onChange.

## What this is

Draws the Illustration line of a Value card: the value graph of its levels, read-only while an older stored list of levels is not moved, giving every change of the levels up whole through onChange.

One component, `PlanValuePictureBody`, the body of the group titled "Illustration" on a Value card and on a Development Resource card (`planLinesFor` of `plan-kinds` gives the `valueGraph` line to both; `PLAN_VALUE_LINE_LABELS.valueGraph` is "Illustration"). On the card it comes first. It takes the props of `ValueLineProps` (`value-line-kit`), puts the `PlanValueGraph` of `value-graph` in a block (`w-full py-2`) and wires it to the card; it never writes to a vault.

- The graph draws `data` (see `value-graph` for the Arrow and the Timeline, the markers, the "+ New" menu, the chips and the full-screen view).
- Editing: the graph is editable when the card is in Edit or the person may edit (`editing || canEdit`); the Illustration is a graph you can work in without turning the card to Edit.
- Older stored list: while `legacy.levels` is more than 0 (the Value still holds an old stored list of levels and has no level records) the line forces both `editing` and `canEdit` off: the graph is read-only, whatever the card says. The card moves the list (the Levels line shows the button); then the graph is editable again. An older list of qualifiers or Meters does not matter here.
- What the card gives the graph: the card's title (`record.facts.title`; without one the graph names itself from the Scale's text, then "Illustration") for the full-screen header; `host.progress` ("Moving 1 of 5…" while the card moves a whole row), `host.capped` ("Showing the first 2 of 24 records at this level.") and, only when it is given, `host.onNotice` (the graph's one notice, "This level was removed by someone else.", also goes to the card's notice line).
- What goes up: every change of the levels is `onChange({ ...data, levels: next })` where `next` is the graph's whole new list with the unknown items of the old list carried (`carryOthers`); the rest of the card (the Scale, the qualifiers, the Endpoint, the Meters) goes up as the same objects. The graph calls it once for one act (a drop, a key step, a pick, a chip), never on each pointer move.

## What this is not

- Not a writer. Nothing is sent to a vault; `onChange` is the only way out, and the card saves.
- Not the graph: the drawing, the dragging, the menus and the rules are `value-graph` (and `value-graph-geometry`); this line is the wiring between it and the card.
- Not the Levels list: removing a level is the Levels line's; the graph has no delete.
- Not a type picture: the pictures at the ends of the Arrow are the graph's, read through `type-picture` and `type-term-popover`.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-illustration`

Take it together with its peers `value-card-model` (0.2.0 or later), `value-graph` and `value-line-kit` (for the props type), and their own peers (`value-graph`'s: `open-popups`, `qualifier-value-picker`, `type-picture`, `type-term-popover`, `value-graph-geometry` with theirs; the kit's: `base-record`, `plan-source` and `type-chooser`, with theirs). React 19 and `react-dom` (for the graph's full-screen layer and menus) are peers. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each: one open-popups stack, one set of contexts, one term origin, one level-key table):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/value-card-model <path-to-the-library>/units/open-popups <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/date-rules <path-to-the-library>/units/value-graph-geometry <path-to-the-library>/units/value-graph <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source <path-to-the-library>/units/type-chooser <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-illustration
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off.

## Examples

A card that holds the data in state and saves what the line hands up; the older list, while it is not moved, makes the graph read-only. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { PlanValuePictureBody } from "@kaigilb/gilbplatformcode-value-illustration";

// Above the card, once: the providers of value-graph (the picture source of the types and the reader of a type's definition) and setTermOrigin(...).
function IllustrationCard({ start, save, olderListMoved }: { start: ValueCardData; save: (next: ValueCardData) => void; olderListMoved: boolean }) {
  const [data, setData] = useState(start);
  return (
    <PlanValuePictureBody
      data={data}
      editing={false}
      canEdit
      vaultId={vaultId}
      record={record}
      onOpen={openRecord}
      selfId={me}
      legacy={olderListMoved ? undefined : { levels: 2, qualifiers: 0, meters: 0, busy: false, canMove: true, onMove: moveOlderLists }}
      onChange={(next) => {
        save(next); // the whole card; the lists the graph did not touch are the same objects
        setData(next);
      }}
    />
  );
}
```

## What the host must supply

- The props of `ValueLineProps` (`value-line-kit`) that this line reads: `data`, `editing`, `canEdit`, `onChange(next: ValueCardData)`, `legacy?`, `record` (its `facts.title`) and `host?` (`progress`, `capped`, `onNotice`). `onChange` is the only write seam; it gets the whole card, once for one act. Show the saved data again as `data` and keep the level objects (or their record keys) while the list is unchanged. The line ignores `vaultId`, `onOpen`, `selfId` and `onRenameQualifier`.
- What `value-graph` supplies for itself, through this line: the `TypePictureSourceContext` provider of `type-picture` and the `TermDefinitionContext` provider of `type-term-popover` above the graph (the second is needed as soon as the Endpoint names a type), `setTermOrigin(...)`, Tailwind scanning of its source, and its CSS variables and inline SVG colours; see the README of `value-graph`. This line does not read the host of the lines (`ValueLinesHostContext`) nor the providers of `plan-source`; it draws without the host of the lines.
- The DOM contract of the graph with the Levels line (its "New qualifier set..." presses "+ Level" in the card): see `value-graph` and `value-levels-line`; the card must put the Illustration and the Levels line in one element.
- Tailwind scanning this unit's `src` (and the graph's): the block uses `w-full` and `py-2`.
- React 19 and `react-dom`.

## Do not

- Do not give the graph level objects made anew on every render with no record keys: an open popover or a drag loses its level (see `value-graph`, "Wrong readings").
- Do not copy `data` before you pass it in, or the card's comparison of list references (what changed) breaks.
- Do not rely on this line to hide the graph while the older list is not moved: it shows it, read-only.
- Do not write from the graph's props or from the data you pass in; show the saved data again as `data`, and a failed write snaps the marker back.

## Wrong readings

- "The Illustration is only editable in Edit." It is editable for a person who may edit (`canEdit`) even on a card that is not in Edit; `editing` and `canEdit` are added.
- "The older list of qualifiers or Meters locks the graph too." Only an older list of levels does (`legacy.levels`).
- "While the card moves a whole row, the graph is locked." `host.progress` shows the "Moving ..." note and turns the dragging off; a key step is still taken, as in `value-graph`.
- "The title is the Scale's name." It is the card's title (`record.facts.title`); only a card without a title takes the graph's own default.
- "A change hands up only the levels." It hands up the whole card, with the levels list new and the other parts as the same objects; an unknown item the old levels list carried is on the new list.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanValueLines.tsx`; the symbol of this unit, in `src/PlanValuePictureBody.tsx`, copied by `sed -n 'A,Bp'`:

| Symbol | Lines |
|---|---|
| `PlanValuePictureBody` | 2596-2615 |

`ValueLineProps` (type only) is in `value-line-kit`. Code verbatim except the named changes (the comment-stripped text of the symbol is the same as in the source, and the check is scripted).

Named changes:
1. Imports: `./PlanValueGraph` is `@kaigilb/gilbplatformcode-value-graph` (`PlanValueGraph`); `../../lib/base/planValue` is `@kaigilb/gilbplatformcode-value-card-model` (`carryOthers`, checked to be exported there); `ValueLineProps` is imported as a type from `@kaigilb/gilbplatformcode-value-line-kit`. The symbol is otherwise unchanged.
2. Comments: none; the source's line comment ("The old stored list is read-only until it is moved into records.") has no name or tag. The file's header comment is the unit's own.
3. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx`, `test/graph.tsx` and the tests below.

Tests: no test of the app renders the Illustration line on its own (the app's `PlanValueGraph.*.test.tsx` render the graph, which is `value-graph`'s; `RecordDetail.planValueCard.vaultit.test.tsx` reaches the line through the whole card and is not ported). All tests here are new: `src/illustration.test.tsx` (14: what is editable and what the older list locks; the whole card going up, with the unknown items of the levels list carried and the untouched parts as the same objects; the title, the progress, the cap note and the notice line), `src/example.test.tsx` (2), `src/exports.test.ts` (1) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
