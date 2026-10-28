# value-endpoint-line

Draws and edits the Endpoint line of a Value card: the Subject and the Reference, each a type picked from the ontology (with its picture and definition) and some words, and a button that finds the types for an older "Subject = X, reference = Y" text, giving every change up whole through onChange.

## What this is

Draws and edits the Endpoint line of a Value card: the Subject and the Reference, each a type picked from the ontology (with its picture and definition) and some words, and a button that finds the types for an older "Subject = X, reference = Y" text, giving every change up whole through onChange.

One component, `PlanEndpointBody`, and one function, `parseEndpointText`. The body is the one of the group titled "Endpoint" on a Value card and on a Development Resource card (`planLinesFor` of `plan-kinds` gives the `endpoint` line to both; `PLAN_VALUE_LINE_LABELS.endpoint` is "Endpoint"). On the card it comes third, after the Scale and before the Qualifiers. It takes the props of `ValueLineProps` (`value-line-kit`) and reads `data.endpoint`; it never writes to a vault.

- The Endpoint is two parts. Each is a type from the ontology (stored as its address, `<term origin>/base/t/<Name>`, with its label) and free words. A Value starts with Thing and Person, a Development Resource with Organization and Person; those defaults are `defaultEndpointFor` of `value-card-model`, put into the data when the card is read, not drawn by this line.
- Read (the card is not in Edit): `Subject = <picture> <type chip> (<words>) · Reference = ...`.
  - The type is a chip (`plan-endpoint-type-chip`, `Type <name>`) that opens the type's definition; before it, the type's 20 px picture when it has one (`plan-endpoint-picture-subject` / `-reference`, `Subject type: <name>`); a part with no type says "none". The words are in brackets.
  - A source with words shows under it.
- Click to type (`canEdit` and not Edit): the type is a button (`Edit Subject type`, `Edit Reference type`; with no type, "Add subject type") that opens the type chooser in place of the parts; a pick closes it and hands up the part with the type; Escape on a control of the picker (not in its search box, which keeps its keys) cancels. A chosen type is followed by an arrow (`About type <name>`) that opens the same popover. The Reference's picker has a "No reference" button that clears the part, words too. The words are an input in place (`Edit Subject words`; empty: "words"). A type pick or a change of the words makes the signed-in person the source when the Endpoint has none.
- The older text (`endpoint.text`, when both parts are empty): shown greyed (`plan-endpoint-legacy`) in place of the parts; for a person who may edit or in Edit, with the button "Find types for 'X' and 'Y'" when the text has the shape `Subject = X, reference = Y` (`parseEndpointText`). The button searches both words with the host's type search, shows what it found ("Subject: Person · Reference: no type found", `plan-endpoint-found`) and offers "Use these types" (writes the types found, with the old words as the words) and "Dismiss". Nothing is written until the person confirms; a search that fails is the same as nothing found.
- Edit: for each part its label, the picture and the chip of the chosen type with "Change type", the picker (open at once when there is no type, with the search box focused; for a chosen type after "Change type", and Escape cancels), a box for the words (`Subject words`, placeholder "mobile app"), on the Reference a "No reference" box once it has a type or words, and the source box.
- `parseEndpointText(text)`: `{ subject, reference }` from `Subject = X, reference = Y` (also `:` for `=`, and a semicolon or a middle dot for the comma; any case; the subject may hold commas, it ends before the word "reference"), else `null`.
- What goes up: `onChange({ ...data, endpoint: next })`, where `next` is the Endpoint with the change, carrying its unknown members (`carryRaw`); the other lists and the Scale go up as the same objects.

## What this is not

- Not a writer. Nothing is sent to a vault; `onChange` is the only way out, and the card saves.
- Not a search: the types come from the host's `searchTypes` (the host of the lines, `value-line-kit`), through `type-chooser`. The line mints no type and takes no free-typed type name.
- Not the pictures or the definitions: those are `type-picture` and `type-term-popover`, read through their contexts.
- Not the defaults of a new card (Thing / Person; Organization / Person): those are in `value-card-model`.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-endpoint-line`

Take it together with its peers `plan-card-facts`, `term-origin`, `type-chooser`, `type-term-popover`, `value-card-model` (0.2.0 or later) and `value-line-kit`, and their own peers (the kit's: `base-record` and `plan-source`; `type-chooser`'s and `type-term-popover`'s: `open-popups` and `type-picture`, with theirs). React 19 is a peer (`react-dom` too, for the type popover and the chooser). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each: one open-popups stack, one term origin):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/term-origin <path-to-the-library>/units/open-popups <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/value-card-model <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-endpoint-line
```

The package ships TypeScript source (`src/`); your bundler compiles it. The source is the app's, compiled without `noUncheckedIndexedAccess`, so this unit's `tsconfig.json` leaves it off.

## Examples

The providers the line needs, and a card that holds the data in state. The same code runs in `src/example.test.tsx`.

```tsx
import { useState } from "react";
import { createTypePictureSource, TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import { TermDefinitionContext, type ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { PlanEndpointBody } from "@kaigilb/gilbplatformcode-value-endpoint-line";

// Once, at the start of the app: where the types' documents are, and where their picture files are served from.
setTermOrigin("https://ontology.example.test");
const pictures = createTypePictureSource({ termOrigin: "https://ontology.example.test", originOf: () => "https://files.example.test" });
const readTermDefinition: ReadTermDefinition = async () => ({ state: "none" });

// The host of the lines: one type search (for the chooser and for "Find types"), its reach, and the opener of the ontology page.
const host: ValueLinesHost = {
  useLinkLabel,
  searchTypes: searchOntologyTypes,
  blankReach: "Type to search the ontology.",
  openOntologyConcept: (typeName) => openOntologyPage(typeName),
};

function EndpointCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <TypePictureSourceContext.Provider value={pictures}>
      <TermDefinitionContext.Provider value={readTermDefinition}>
        <ValueLinesHostContext.Provider value={host}>
          <PlanEndpointBody data={data} editing={false} canEdit vaultId={vaultId} record={record} onOpen={openRecord} selfId={me}
            onChange={(next) => { save(next); setData(next); }} />
        </ValueLinesHostContext.Provider>
      </TermDefinitionContext.Provider>
    </TypePictureSourceContext.Provider>
  );
}
```

## What the host must supply

- The props of `ValueLineProps` (`value-line-kit`) that this line reads: `data`, `editing`, `canEdit`, `vaultId`, `record`, `onOpen`, `selfId` and `onChange(next: ValueCardData)`. `onChange` is the only write seam; it gets the whole card, once for one act (a pick, an Enter, a "Use these types"). Show the saved data again as `data`. The line ignores `onRenameQualifier`, `legacy` and `host`.
- The host of the lines (`ValueLinesHostContext` of `value-line-kit`), above the line, whenever a type is chosen, a picker is open or the older text offers its finder; without it the line throws an error that names the provider. Members used here: `searchTypes`, `blankReach`, `renderTypeIcon?` (all three for the chooser; `searchTypes` is also the search of "Find types", so the two always agree) and `openOntologyConcept?` (the "Open in Ontology" button of the type popover; the button is drawn in any case, and does nothing without it). An Endpoint with no types and no older text needs no host.
- `setTermOrigin(...)` of `term-origin`, once: a pick and "Use these types" write `<term origin>/base/t/<TypeName>`, and the popover's link uses it.
- The `TermDefinitionContext` provider of `type-term-popover` (the chips, the picture buttons and the chooser read definitions through it) and, for pictures, the `TypePictureSourceContext` provider of `type-picture`; with no picture source no type has a picture and none is drawn.
- The providers of `plan-source` (its host, `RefLabelContext` of `entity-ref-value`, `PickerQueryContext` of `record-picker`): the source control reads them.
- The test ids and labels the card and its tests use: `plan-endpoint-subject`, `plan-endpoint-reference`, `plan-endpoint-picker-subject`, `plan-endpoint-picker-reference`, `plan-endpoint-found`, `plan-endpoint-legacy`, `plan-endpoint-type-chip`, `plan-endpoint-type-popover`, `plan-endpoint-picture-subject`, `plan-endpoint-picture-reference`, and the labels `Edit Subject type`, `Edit Subject words`, `Subject words`, `Subject type: <name>`, `About type <name>`, `Type <name>`, `No reference`.
- Tailwind scanning this unit's `src` (and the kit's): the classes are arbitrary-value classes such as `text-[14px]` and `text-[var(--accent)]`.
- CSS variables: `--accent`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--focus`, `--r-md`, and `--surface-2` (with its fallback); the chooser's and the popover's own (see `type-chooser`, `type-term-popover`). The `editorial-tokens` unit defines every one of them but `--surface-2`.
- React 19 and `react-dom`.

## Do not

- Do not give "Find types" a different search from the chooser's: it takes the first hit of each old word, and a different function would give a different "Use these types". The host has one `searchTypes`; keep it so.
- Do not build the type address anywhere else: it is `<term origin>/base/t/<TypeName>`, from `termOrigin()`, and a different shape changes what is stored.
- Do not copy `data` before you pass it in, or the card's comparison of list references (what changed) breaks.
- Do not rely on Escape in the chooser's search box to cancel a pick: the box keeps its keys. A host that wants that must close the picker itself.
- Do not put the older text in the types by hand: let the person confirm "Use these types".

## Wrong readings

- "A Development Resource's Endpoint defaults to Organization and Person by itself." The line shows the parts it is given; `defaultEndpointFor` in `value-card-model` makes them when the card is read, and a Value's are Thing and Person.
- "Escape cancels the picker from anywhere in it." Not from the search box (its keys stop there); on a row, the arrow or the "No reference" button it does. In Edit, a part with no type has no way back, so Escape there is left for the layer around.
- "'Open in Ontology' is only drawn when the app can open it." It is drawn in every type popover on this line, as in the source; without `openOntologyConcept` in the host it does nothing.
- "'No reference' keeps the words." It clears the whole part, type and words; the same for the box in Edit. A part with no type but with words is not empty.
- "The finder writes what it finds." It writes nothing until "Use these types"; and it uses the first hit of each word only, with the old word as the words; a word with no hit keeps its words and gets no type.
- "'Subject = , reference = b' is not in the shape." It is: the subject is one space. `parseEndpointText` checks the shape, not the words.
- "The older text is always shown." Only while both parts are empty; once a part has a type or words it is not shown (it is still stored).
- "The Reference's address is checked." The line reads the last part of the stored address as the type's name (a trailing `/` or `#` is dropped, an escape such as `%20` is kept as it is), and shows the label when there is one.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanValueLines.tsx`; the symbols of this unit, all in `src/PlanEndpointBody.tsx` in the source's order, each copied by `sed -n 'A,Bp'`:

| Symbol | Lines |
|---|---|
| `typeNameOf`, `partEmpty` | 1371, 1372 |
| `TypeChip` | 1374-1391 |
| `PartPicture` | 1393-1409 |
| `PartPicker` | 1411-1451 |
| `parseEndpointText` | 1453-1457 |
| `FindTypes` | 1459-1503 |
| `EndpointPartLine` | 1505-1602 |
| `PlanEndpointBody` | 1604-1653 |

The pieces the other lines share with this one (`CommitText`, `Src`, `TextPiece`, `ViewSrc`, `own`, `inPlace`, `hint`, `quiet`, `chip`, `clickable`, `ValueLineProps`) are in `value-line-kit`. Code verbatim except the named changes (the comment-stripped text of each symbol differs from the source only as 2 to 5 say, and the check is scripted).

Named changes:
1. Imports: `../../lib/base/planValue` and `../../lib/base/planValueModel` are `@kaigilb/gilbplatformcode-value-card-model` (`carryRaw` and the type `EndpointPart`, checked to be exported there); `../../lib/base/planCard` is `@kaigilb/gilbplatformcode-plan-card-facts` (`planSourceEmpty`); `./TypeChooser` and the type `TypeOption` of `../../lib/base/typeSearch` are `@kaigilb/gilbplatformcode-type-chooser`; `./TypeTermPopover` and `TypePictureButton` of `./TypePicture` are `@kaigilb/gilbplatformcode-type-term-popover`; the shared pieces above are from `@kaigilb/gilbplatformcode-value-line-kit`.
2. `useShell()` (source lines 1376 in `TypeChip` and 1395 in `PartPicture`) is `useValueLinesHost()` of the kit; the line read `openOntologyConcept` from it, and now reads it from the host of the lines (member `openOntologyConcept?: (typeName: string) => void`).
3. `GILBVEDA_MASTER_ORIGIN` (from `lib/base/stakeholderKinds`) is `termOrigin()` from `@kaigilb/gilbplatformcode-term-origin`, in the same expressions: `${termOrigin()}/base/t/${o.typeName}` in `PartPicker` (source line 1441) and in `FindTypes` (line 1476).
4. `PartPicker` (source line 1435): the `TypeChooser` got its search, its reach note and its icons from its own defaults in the app. It now gets them from the host of the lines: the new line `const { searchTypes, blankReach, renderTypeIcon } = useValueLinesHost();` and the props `search={searchTypes} blankReach={blankReach} renderTypeIcon={renderTypeIcon}`.
5. `FindTypes` (source line 1466): `searchLiveTerms(...)`, the app's search, is `searchTypes(...)` of the host of the lines (the new first line `const { searchTypes } = useValueLinesHost();`). It is the same function the chooser of 4 gets, as in the source, where both used `searchLiveTerms`.
6. Comments: none of these symbols carried a name or a tag; the file's header comment is the unit's own, and the comment block above `typeNameOf` in the source (two lines, not part of a symbol) is not copied.
7. `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the app's source is not compiled with.

New in this unit: `src/index.ts`, `scripts/check-host-agnostic.mjs`, `test/mount.tsx`, `test/typeHosts.tsx` and the tests below.

Tests:

| Source | Ported | Left out |
|---|---|---|
| `PlanEndpointTypes.vaultit.test.tsx` | 3 of 3, in `src/endpoint.test.tsx` (picking a type for the Subject is one change with the type's address; Escape cancels the picker; the older text with its find-types button and `parseEndpointText("nonsense")`) | none. The app mocked `./TypeChooser` with one button, the shell and a query client; here the chooser is the `type-chooser` unit over the host's search, the shell is the host of the lines, and the Escape case fires the key on a row of the chooser (the real search box keeps its keys) |
| `TypePictures.v32.test.tsx` | 6 of 8 (the six that render `PlanEndpointBody`: picture present, absent, a click on the picture, read-only, Edit, a broken picture); the app's picture and definition modules are the `type-picture` source and the definition reader of `test/typeHosts.tsx` | 2: the two source scans of "V32 4" (the app has no `endpointGlyphs` file; `TypeIcon` has no `fallback` prop): they read the app's files |
| the app's tests through `RecordDetail` (`RecordDetail.planValueCard.vaultit.test.tsx`, `RecordDetail.planValueClickToType.vaultit.test.tsx`, `RecordDetail.planValueLevelRecords.vaultit.test.tsx`, `RecordDetail.planValueV21.vaultit.test.tsx`, `RecordDetail.planValueQaFixes.vaultit.test.tsx`, `RecordDetail.planValueHost.vaultit.test.tsx`, `RecordDetail.planResourceCard.vaultit.test.tsx`, `RecordDetail.planResourceCard.rqa1.test.tsx`, `PlanValueQualifiersFollowScale.v32.test.tsx`, `PlanValueRename.qa4.v36.test.tsx`) | none | all: they are the app's regression harness for the whole card, not for one line |

New tests: the rest of `src/endpoint.test.tsx` (48 in all, with the nine ported above: `parseEndpointText`; the read line; the defaults the model gives; click to type; the finder with one search function for the finder and the chooser; Edit; Escape; what goes up), `src/example.test.tsx` (1), `src/exports.test.ts` (1) and `src/hostAgnostic.test.ts` (10: runs the host-agnostic check against planted faults).
