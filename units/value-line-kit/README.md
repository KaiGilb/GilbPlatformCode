# value-line-kit

The shared pieces of the Value card's lines: the line props, text and select editors that save on Enter or on leaving, the source control slot, the menu of qualifiers a level or meter has not set, the move button for older stored lists, and the host the lines read through.

## What this is

The shared pieces of the Value card's lines: the line props, text and select editors that save on Enter or on leaving, the source control slot, the menu of qualifiers a level or meter has not set, the move button for older stored lists, and the host the lines read through.

The parts that two or more of the Value card's lines use, taken out of one source file so that each line unit can be taken alone (`value-scale-line`, `value-qualifiers-line`, `value-endpoint-line`, `value-meters-line`, `value-levels-line` and `value-illustration` all depend on this unit). The lines write nothing to a vault: every change goes up whole through `onChange(next: ValueCardData)`, and the card saves it.

- `ValueLineProps`: the props every line takes.
  - `data: ValueCardData`, `editing` (the card is in Edit), `canEdit` (the person may edit; out of Edit, a click on a value turns that value into its editor in place), `vaultId`, `record: BaseRecord`, `onOpen(id)`, `selfId` (the signed-in person's record address: a value written with no source gets them as its source), `onChange(next)`.
  - `onRenameQualifier?(from, to)`: the card renames a defined qualifier on its record and on every level's choice in one group write.
  - `legacy?: { levels, qualifiers, meters, busy, canMove, onMove }`: the Value still holds old stored lists and has no records of that kind; a count of 0 means that list is records already. The lines show such a list read-only, with one button that moves them all.
  - `host?: { progress?, capped?, onNotice? }`: the Value's children as the card reads them (a group write in progress, the find's cap note, the notice line). This is not the host of the lines below; it is data the card hands in.
- Editors that save on Enter or on leaving:
  - `InlineInput({ label, value, onCommit, close, multiline?, type?, list?, selectAll?, placeholder?, wide?, check? })`: a text, date or number input in place. Enter or leaving saves a changed value once and calls `close`; Escape saves nothing and calls `close` (the key stops there). An unchanged value closes with nothing sent. `check(text)` returns a sentence when the text cannot be saved: the input then stays open, shows the sentence as an alert and sends nothing. In a text box (`multiline`) Shift+Enter is a line break. Its accessible name is `Edit <label>`.
  - `InlineSelect({ label, value, options, onCommit, close })`: a select in place. A pick saves when it differs and closes; Escape or leaving closes with nothing sent. It opens the browser's own picker when the browser lets it.
  - `CommitText({ label, value, onCommit, multiline?, placeholder?, className?, type?, list? })`: the Edit-mode box. It keeps what is typed and saves a changed text on leaving or Enter (a text box: Enter, not Shift+Enter). Its accessible name is `label` as it is.
  - `Piece({ on, label, face, edit })` and `TextPiece({ on, label, value, onCommit, empty?, face?, ... })`: one value in a read line. Off, it is its face. On, it is a button (`Edit <label>`) that turns into its editor and back. An empty value shows `empty` as a faint hint.
  - `useAutoGrow(text)`: sizes a text box to its content.
- The source control slot: `Src({ p, value, label, onCommit, offerNewStakeholder? })` is the `PlanSource` control of `plan-source` set up from the line props (`editing`, `vaultId`, `record`, `onOpen`); `ViewSrc` is the "Source: X" line of a read line: out of Edit, a click on it (or Enter on it) opens the source picker in place; a pick, Escape or a press outside closes it (a press inside a `[role="dialog"]` does not).
- `UnsetQualifiers({ n, hasBracket, names, chooser, caption?, onCondition? })`: one faint "+ qualifier" chip, its face drawn by CSS so that the line's text stays the pure line, that opens a menu of the qualifiers a level (or, with `caption`, a meter) has not set. A name opens `chooser(name, close)`. With `onCondition` the menu also offers "Add a condition".
- `LegacyMoveButton({ p, group })` and `legacyMoveLabel(old)`: "Move 2 levels, 1 qualifier and 3 meters into their own records". The button is drawn once, in the first group (Levels, then Qualifiers, then Meters) that still shows an old list.
- Small things: `eq` (trimmed, case-folded equality), `own(source, selfId)` (the signed-in person as the source of a value with none), `inPlace(p)` (the person may edit and the card is not in Edit), `hint(text)`, and the class strings `box small quiet faint chip clickable inlineBox faintBtn`.
- The host of the lines: `ValueLinesHostContext`, `useValueLinesHost()` and the type `ValueLinesHost` (see "What the host must supply"). A line that asks for the host with no provider throws an error that names the provider.

All of the above except `ValueLineProps` is exported for the line units; a line unit imports what it uses from here and from nowhere else in the family.

## What this is not

- Not a line. It draws no Scale, Qualifiers, Endpoint, Meters, Levels or Illustration; those are the six line units.
- Not the model: the data types and the rules (`carryRaw`, `carryOthers`, `qualifierRows`, `sortLevels`...) are `value-card-model`.
- Not the source control: `Src` and `ViewSrc` set up `plan-source`, which asks its own host for the records it needs.
- Not a writer. Nothing here sends to a vault. `onCommit` and `onChange` are handed in.
- Not the older-list move itself: `LegacyMoveButton` only calls `legacy.onMove`; moving the lists is the card's.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-line-kit`

Take it together with its peers `base-record`, `plan-card-facts`, `plan-source`, `type-chooser` (its types are used by the host) and `value-card-model` (0.2.0 or later), and their own peers: `plan-source` has `entity-ref`, `entity-ref-value`, `record-picker`, `remove-control` and `type-curie` (`entity-ref-value` has `entity-ref`; `record-picker` has `id-tail`); `type-chooser` has `type-term-popover` (which has `open-popups`, `term-origin` and `type-picture`; `type-picture` has `type-name`); `value-card-model` has `plan-kinds` (which has `type-key`), `qualifier-values`, `term-origin` and `type-key`. React 19 is a peer. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each: one open-popups stack, one term origin):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/type-name <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/open-popups <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/value-card-model <path-to-the-library>/units/plan-source <path-to-the-library>/units/value-line-kit
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off, as that of `value-graph` does.

## Examples

A line of your own built on the kit's pieces, inside the host. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { TextPiece, ValueLinesHostContext, inPlace, own, type ValueLineProps, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";

// A line of your own: the unit of the Scale as text; a click turns it into an input in place.
function UnitLine(p: ValueLineProps) {
  const { data } = p;
  return (
    <TextPiece
      on={inPlace(p)}
      label="Scale unit"
      value={data.scale.unit}
      empty="Add unit"
      onCommit={(unit) => p.onChange({ ...data, scale: { ...data.scale, unit, source: own(data.scale.source, p.selfId) } })}
    />
  );
}

// The host: where the lines get what the app gives them (see the reference body of useLinkLabel below).
const host: ValueLinesHost = {
  useLinkLabel,
  searchTypes: searchOntologyTypes,
  blankReach: "Type to search the ontology.",
};

// The card holds the data and saves whatever onChange gives it.
<ValueLinesHostContext.Provider value={host}>
  <UnitLine data={data} editing={false} canEdit vaultId={vaultId} record={record} onOpen={open} selfId={me} onChange={save} />
</ValueLinesHostContext.Provider>;
```

## What the host must supply

- The provider `ValueLinesHostContext.Provider value={host}`, above the lines, with the same `host` object for as long as it is mounted. Its members (`ValueLinesHost`), each the call the source made outside the unit (GilbApp `src/components/records/PlanValueLines.tsx`, line numbers from that file):
  - `useLinkLabel(uri: string | undefined, vaultId: string): string | null`: a React hook, called on every render in the place the source called its hook, never conditionally. The live label of a linked record (a source that is a record): its unit tag, else its name; `null` while it is being read. The Levels line shows it in a level line whose source has no words. Replaces the source's whole hook `useLinkLabel` (lines 447-466). The reference implementation is GilbApp's body, which the host keeps in its own code (it uses the app's `useRecords`, `useQuery`, `readRecord`, `vaultOriginOf` and `refDisplayName`):

    ```tsx
    function useLinkLabel(uri: string | undefined, vaultId: string): string | null {
      const ref = uri ? entityRefFromFact(uri) : null;
      const list = useRecords(vaultId);
      const hit = ref ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri) : undefined;
      const named = (facts: Record<string, string> | null | undefined, u: string | null | undefined) =>
        facts?.unitTag?.trim() || refDisplayName(facts, u);
      const cached = hit ? named(hit.facts, hit.entityUri) : null;
      const q = useQuery({
        queryKey: ["base", "record", ref?.id ?? "", vaultOriginOf(ref?.uri ?? null)],
        queryFn: () => readRecord(ref!.id, ref!.uri),
        enabled: !!ref && !cached,
        staleTime: 30_000,
      });
      if (!ref) return uri ?? null;
      if (cached) return cached;
      if (q.isPending) return null;
      if (q.data) return named(q.data.facts, q.data.entityUri || ref.uri);
      return refDisplayName(null, ref.uri);
    }
    ```

  - `openOntologyConcept?: (typeName: string) => void`: open a type's page in the app's ontology section. Replaces `useShell().openOntologyConcept` (lines 1376 and 1395). Used by the Endpoint line's type popovers; absent, their "Open in Ontology" button does nothing.
  - `searchTypes: TypeSearchFn`, `blankReach: string` and `renderTypeIcon?: (option: TypeOption, className: string) => ReactNode`: the same shapes as the props of the `type-chooser` unit. They replace `searchLiveTerms` (line 1466) and the defaults the app's type chooser filled in for itself (line 1435). The Endpoint line's type chooser and its "Find types" button use this one `searchTypes`.
  - No write members: these lines do not write.
- The contexts the pieces read: the host of `plan-source` (`PlanSourceHostContext`, with the record label context of `entity-ref-value` and the picker query context of `record-picker` it needs) for `Src` and `ViewSrc`; and, for the line units, those of the peers they use (see each unit).
- Tailwind scanning this unit's `src`: the classes are arbitrary-value classes such as `min-h-[44px]`, `before:content-['+_value']`, `[@media(hover:none)]:`. Without it the layout and the faint "+" faces are missing.
- CSS variables: `--r-md`, `--line`, `--surface`, `--ink`, `--ink-soft`, `--ink-faint`, `--accent`, `--focus`, and `--surface-2` (always with its fallback `rgba(0,0,0,0.05)`). The `editorial-tokens` unit defines every one of them but `--surface-2`.
- React 19.

## Do not

- Do not give the lines a host object made anew on every render: `useLinkLabel` is a hook, and its identity must stay the same while the provider is mounted.
- Do not call `useLinkLabel` conditionally on your side, and do not make it do different hooks on different calls.
- Do not clone `data` before you hand it to a line, or the card's own comparison of list references (which tells it what changed) breaks; the lines hand back the lists they did not touch as the same objects.
- Do not use `Src` or `ViewSrc` without the host of `plan-source` above it: it throws an error that names it.
- Do not put a write in the host of the lines. A write belongs to the card, which receives `onChange`.

## Wrong readings

- "Enter and the blur after it both save." Not in `InlineInput`: after the first save (or Escape) it ignores the rest. `CommitText` is different: it saves each time the text differs from `value`, so if the parent does not change `value` after Enter, leaving the box saves the same text again.
- "An unchanged value is sent when you press Enter." It is not: nothing is sent, the editor only closes.
- "`check` runs on every key." It runs when the person tries to save a changed text; on Escape and on an unchanged text it does not run.
- "`ViewSrc` always lets you add a source." It draws nothing for a source with no words, no record and no document, even where the person may edit (the `PlanSource` control draws nothing for an empty source that is not being edited), so the line has to offer its own way in. A click on a button or link inside the source (for example the name of the record) does not open the editor; it does what the button does.
- "`LegacyMoveButton` is in each group." It is in one: the first of Levels, Qualifiers, Meters that still shows an old list.
- "`legacyMoveLabel` of nothing is an empty string." It is "Move  into their own records" (two spaces); the button is not drawn when there is nothing to move, so the label is not seen.
- "`own` stamps every value." It gives the signed-in person only as the source of a value that has none; a given source comes back as the same object.
- "The host's `searchTypes` is the type chooser's only search." It is also the search of the Endpoint line's "Find types" button; two different functions would give a different "Use these types".

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanValueLines.tsx`; the lines of the symbols in this unit (all in `src/lineKit.tsx`, in the source's order, each copied by `sed -n 'A,Bp'`):

| Symbol | Lines |
|---|---|
| `ValueLineProps` | 66-91 |
| `box`, `small` | 93-94, 95-96 |
| `quiet`, `faint`, `chip` | 97, 98, 99 |
| `eq`, `own` | 112, 114-116 |
| `CommitText` | 118-182 |
| `Src` | 184-209 |
| `clickable`, `inlineBox`, `inPlace`, `hint` | 214-215, 216-217, 219-220, 222 |
| `Piece`, `useAutoGrow` | 224-247, 249-259 |
| `InlineInput`, `InlineSelect`, `TextPiece` | 261-341, 343-393, 395-445 |
| `faintBtn` | 483-484 |
| `UnsetQualifiers` | 523-617 |
| `ViewSrc` | 682-732 |
| `legacyMoveLabel`, `LegacyMoveButton` | 1887-1896, 1898-1909 |

A symbol is here because two or more of the six lines use it (transitively); a symbol one line uses is in that line's unit. Code verbatim except the named changes (the comment-stripped text of each symbol differs from the source only as 2 and 4 say, and the check is scripted).

Named changes:
1. Imports: `./PlanSource` is `@kaigilb/gilbplatformcode-plan-source`; `../../lib/base/planCard` is `@kaigilb/gilbplatformcode-plan-card-facts` (`planSourceEmpty`, `PlanSourceValue`); `../../lib/base/planValueModel` is `@kaigilb/gilbplatformcode-value-card-model` (`ValueCardData`, checked to be exported there); the `BaseRecord` type from `../../lib/base/records` is `@kaigilb/gilbplatformcode-base-record`.
2. `export` is put before each symbol the source did not export (everything above except `ValueLineProps` and `legacyMoveLabel`), as the line units import them. No other change in a symbol.
3. `src/host.ts` is new: `ValueLinesHost`, `ValueLinesHostContext`, `useValueLinesHost()`. Its members replace the app calls the lines made outside the units: the whole hook `useLinkLabel` (source lines 447-466, whose body is the reference host implementation in this README), `useShell().openOntologyConcept` (lines 1376, 1395), and `searchLiveTerms` and the type chooser's defaults (lines 1435, 1466). The line units call them: the Levels line `useLinkLabel`, the Endpoint line the others.
4. Comments: the names of people, the batch and cycle tags and the QA ids are removed, keeping the technical meaning (two batch tags in the comments of `ValueLineProps`).
5. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `src/host.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx` and the tests below.

Tests: the app has no test that renders these pieces on their own (the app's tests render them through the whole card, `RecordDetail`: `planValueClickToType`, `planValueV21`, `planValueQaFixes`, `planValueHost`...; those are left out and are not ported to any unit), so all are new: `src/lineKit.test.tsx` (45: the editors' commit rules — Enter once, leaving once, Escape nothing, unchanged nothing, `check`; the in-place pieces; `own`, `eq`, `inPlace`; the source slot; the unset-qualifier menu; the move button and its label), `src/host.test.tsx` (3), `src/exports.test.ts` (2: the export list and the class strings), `src/example.test.tsx` (1: the README example) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
