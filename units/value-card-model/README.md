# value-card-model

The Value card's data, read from the Value record and its child records and built back into the facts to store, as plain functions with no React and no network.

## What this is

The Value card's data, read from the Value record and its child records and built back into the facts to store, as plain functions with no React and no network.

The Value card's data model: it reads a Value's facts and the records that are parts of it (the Scale, the Scale qualifiers and their option definitions, the level records, the Meters and Meter lines) into one `ValueCardData`, and builds the create facts and the patches that write an edit back. It also holds the level-line text (a level typed or pasted as one line, and shown as one line), the numbers a level is typed with and the dates it takes. Pure: no React, no I/O.

The same model serves the Development Resource card (`t:Resource`), which is the Value card with Budget in the place of Goal, a Scale direction of "lower" and an Endpoint of Organization / Person shown by default. The functions that differ take the card's type (`levelTypeName(kind, cardTypeUri)`, `levelCreateFacts(..., cardTypeUri)`) or a `resource` flag (`readValueCard(facts, scaleRow, resource)`, `sortLevels(levels, direction, resource)`, `scaleFacts(scale, resource)`, `kindClass(kind, resource)`); without it they behave as the Value card.

- Reading: `readValueCard(facts, scaleRow?, resource?)`, `readLevelRecord(s)`, `readQualifierRecord(s)`, `readMeterRecords`, `readMeterLineRecord`, `readScaleRecord`, `readLegacyLevels` / `readLegacyMeters` / `readLegacyVariables` (the older stored lists, read-only), `scaleRowOf`, `scaleRefOf`, `valueLinesEmpty`, `latestChange`.
- Building: `valueCardPatch` (the Value's own patch: the Endpoint only), `scaleFacts`, `scaleCreateFacts` / `scalePatch` / `scaleLinkPatch`, `qualifierCreateFacts` / `qualifierPatch`, `optionDefCreateFacts` / `optionDefPatch`, `meterCreateFacts` / `meterPatch`, `meterLineCreateFacts` / `meterLinePatch`, `levelCreateFacts` / `levelPatch`, and the tags (`scaleTag`, `qualifierTag`, `optionDefTag`, `meterTag`, `meterLineTag`, `levelTag`, `levelTagTry`). A patch holds only the facts that changed, `null` removes a fact, and an older name a record still holds is nulled in the same patch that writes the new one.
- Level lines: `parseLevelLine`, `parseLevelLineWarn`, `formatLevelLine`, `levelLineSegments`, `sortLevels`, `levelGroupKey`, `quoteValue`, `splitOutsideBraces`, `listLikeDefinition`, `movableConditions`, `moveConditionIntoVariable`, `renameLevelQualifier`, `removeLevelQualifier`, `levelsSettingBoth`, `levelsUsingQualifier`, `levelHasQualifierValue`.
- Numbers and dates: `parseNumberText`, `plainNumberText`, `levelDrawNumber`, `levelRangeEnds`, `levelOfText`, `levelOfTyped`, `levelNumberDisplay`, `levelNumberText`, `levelNumberTyped`, `parseLevelDate`, `localToday`, `localDay`.
- New levels: `blankLevel`, `levelLike` (a new level in the set an Arrow row or Timeline series already holds), `newLevelFromClick`, `OFFERED_LEVEL_KINDS`, `DEFAULT_LEVEL_ROWS`, `PRESET_QUALIFIERS`.
- The Development Resource card: `defaultEndpointFor(resource?)` (Thing / Person for a Value, Organization / Person for a Resource; the type addresses are built from the `term-origin` peer), `defaultDirectionFor(resource?)` (`lower` for a Resource, `higher` for a Value), `BUDGET_LEVEL_TYPE` (`Budget`, the stored type of a Resource's Budget level), `resourceKind(kind, resource?)` (the word Goal is Budget on a Resource), `RESOURCE_LEVEL_KINDS` and `levelKindsFor(cardTypeUri)`, `RESOURCE_DEFAULT_LEVEL_ROWS` and `defaultLevelRowsFor(resource?)`, `RESOURCE_OFFERED_LEVEL_KINDS` and `offeredLevelKindsFor(resource?)`, `kindClass(kind, resource?)` (the lower-case kind the sort and the graph reason with: Budget is `goal` on a Resource).
- Scale names: `scaleVariableNames`, `scaleQualifierNames`, `qualifierRows`, `withScaleQualifiers`, `renameCandidate`, `scaleDirectionOf`.
- The hidden carry: `carryRaw`, `carryOthers`, `withOthers`, `othersOf`, `recOf`, `levelKey`, `setLevelKey`, `aliasLevelKey`, `resolveLevelKey`.
- Type tests: `isLevelType`, `isScaleType`, `isQualifierType`, `isOptionDefType`, `isQualifierRowType`, `isLegacyQualifierRow`, `isMeterType`, `isMeterLineType`, all through `isTypeName` of the `type-key` peer.
- Re-exported from `qualifier-values` so the export list is the source's: `ALL_VALUE`, `qualifierValues`, `packQualifierValues`.
- The types: `ValueCardData`, `ValueScale`, `ScaleVariable`, `ValueLevel`, `LevelQualifier`, `ValueMeter`, `ValueMeterLine`, `EndpointPart`, `ScaleDirection`, `MeterKind`, `BaseRecord` and others.

On a Resource, a level typed `Goal` is stored as the type `t:Budget` and writes no `a:label`; a Value's own word `Budget` is still `t:Level` with `a:label`. A `t:Budget` record is read as kind `Budget`. Showing the Resource defaults writes nothing: a Resource reads Scale direction `lower` and Endpoint Organization / Person only while no Scale or Endpoint is stored, and a stored one is never overridden.

Wire vocabulary it reads and writes (`a:` is the attribute prefix; a stored bare name is the same name without `a:`):

- The Value: `VALUE_TERMS` = `a:hasScale` (a reference `{ "@id": <Scale record> }`) and `a:endpoint` (`a:endpointSubject` and `a:endpointReference`, each `{ "@id": <type IRI>, "a:label", "a:description" }`, and `a:description`). The older names are read, never written (`LEGACY_VALUE_SLUGS`): `valueScale`, `valueEndpoint`, `scaleQualifierDefinitions`, `valueMeters`, `valueLevels`, and the older sentence keys `a:scale`, `scaleText`, `endpointText`, `a:definition`.
- The Scale record (`t:Scale`, `a:partOf` the Value): `a:description`, `a:unit`, `a:rate`, `a:scaleContext`, `a:scaleDirection` (`lower`, `higher`, `target`; always written), and the source keys `a:source`, `a:statedBy`, `a:derivedFrom`.
- Level records (`LEVEL_TERMS`): `a:scaleNumber` (the author's text), `a:levelWhen`, `a:levelCondition`, `a:levelQualifierChoice` (a list of `{ "a:name", "a:qualifierOptions" }`; ALL has no `a:qualifierOptions`), `a:levelSide`, `a:note`, `a:unitTag`, `a:label` (a custom word), `a:lineSources`, `a:partOf`, `a:elementOrder`. A level is typed `t:Fail`, `t:Survival`, `t:Past`, `t:Status`, `t:Tolerable`, `t:Goal` or `t:Wish` (`STANDARD_LEVEL_KINDS`), `t:Budget` (a Resource's Budget), or `t:Level` for any other word. The older names `measurementValue`, `levelValue`, `qualifierCondition`, `levelConditions`, `levelVariables` and the older type `PlanguageLevel` are read.
- Child records (`VALUE_CHILD_TERMS`): `t:ScaleQualifier` and `t:ScaleQualifierDefinition` (`a:name`, `a:definition`, `a:defaultOption`, `a:qualifierOptions`), `t:Meter` (`a:meterQualifier`) and `t:MeterLine` (`a:meterAgentKind` of `human`, `ai` or `instrument`, `a:meterMethod`), each with `a:unitTag`, `a:lineSources`, `a:partOf`, `a:elementOrder`. The older `options`, `qualifier`, `method` and `measurementMethod` are read.

The unit holds module state (the `keyAlias` map behind `aliasLevelKey` and `resolveLevelKey`), so an app must install ONE copy of it (it is a peer of every unit that uses the level keys).

## What this is not

- Not React. Nothing here draws.
- Not a writer. The create facts and the patches are returned; sending them to the vault, and creating or ending the records, is the host's (a later unit, `value-card-write`).
- Not the older `spec-card-facts` or `scale-facts` units. They read other, earlier shapes and are not interchangeable with this one.
- Not the graph's geometry (`value-graph-geometry`) or its drawing.
- Not a type registry. Whether a record is a Goal or a Scale is asked of `type-key`; whether a card is a Development Resource is asked of `plan-kinds`.
- Not the owner of the ontology host. The address of a default Endpoint type is built from the origin the app sets in `term-origin`; this unit names no host.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-card-model`

Take it together with its five peers: `plan-card-facts`, `plan-kinds`, `qualifier-values`, `term-origin` and `type-key` (`plan-kinds` has `type-key` as its own peer). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one `keyAlias` map, one type function and one type origin):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-key <path-to-the-library>/units/value-card-model
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { readValueCard, valueCardPatch, readLevelRecords, levelPatch, parseLevelLine, formatLevelLine } from "@kaigilb/gilbplatformcode-value-card-model";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

// Once at start-up, before any card renders: the app's GilbVeda origin (it builds the default Endpoint's type addresses).
setTermOrigin("https://<your ontology host>");

// Read the card from the Value's facts (and its Scale record, when the host has it).
// For a Development Resource pass true as the third argument: Budget for Goal, Scale "lower", Endpoint Organization / Person.
const data = readValueCard(valueFacts, scaleRow);
data.levels = readLevelRecords(partRows, valueUri); // the level records among the Value's parts

// Edit the Endpoint sentence; the patch holds only what the Value itself stores.
data.endpoint.text = "Subject = the app, reference = the user";
const patch = valueCardPatch(data); // { endpoint: { ... } }

// A level typed as a line, and shown as a line.
const level = parseLevelLine("Goal [2027-06-30, User type = Senior 70+] 5 <- Ann estimate", data.variables);
formatLevelLine(level!, data.variables);

// An edit of one level record: only the facts that changed.
const levelRow = partRows[0];
levelPatch(levelRow, { ...readLevelRecord(levelRow)!, note: "checked" });
```

## What the host must supply

- The records as the app holds them: the `BaseRecord` shape of this unit (`id`, `entityUri?`, `typeUri`, `facts`, `opaqueFacts`, `etag`, `servedKeys?`, `served?`), with the served document's facts kept as served (a link stays `{ "@id": ... }`, a list stays a list). The unit reads `served.facts` first, then the flat `facts`.
- The reading of the part records of a Value (which rows are its parts) and all writing: creating a record from the create facts, patching it, ending it.
- If the app has its own type registry: one call to `setTypeKey` of the `type-key` unit at start-up.
- ONE call to `setTermOrigin("https://<your ontology host>")` of the `term-origin` unit at start-up, before any card renders. The value is the app's GilbVeda origin. `readValueCard` needs it whenever it has to show a default Endpoint (see Wrong readings).
- For a Development Resource card: the `resource` flag (or the card's type address) on every call that takes one. The unit does not know which card it serves; the host does (`isResourceType` of `plan-kinds`).

## Do not

- Do not install a second copy of this unit, of `type-key` or of `term-origin`: the `keyAlias` map, the type function and the type origin are module state.
- Do not call `readValueCard` before `setTermOrigin`: it throws (see Wrong readings).
- Do not pass the `resource` flag on some calls and not on others for one card: the sort, the defaults and the write then disagree about whether Budget is the Goal point.
- Do not spread a read object and expect its hidden members to come along. Write `carryRaw({ ...level, note }, level)` for an object and `carryOthers(next, prev)` for a list. A plain spread loses them, and the next write then holds only what the card holds.
- Do not store, JSON-encode or structured-clone a read object and expect `raw`, `rec`, `lkey` and `others` to survive.
- Do not hand `withScaleQualifiers(data)` to a writer: its names may have no record yet.
- Do not read a Value's `levels` from the older `valueLevels` list for a new write: it is read-only and never written again.

## Wrong readings

- "`0,001` is 0.001." It is read as 1: a comma followed by exactly three digits is a thousands mark. `-0,001` is -1, and `1,0000` is 1 (four digits make a decimal comma). Kept on purpose; the unit does not change behaviour while it is shared. `1e3` is not a number (null).
- "`parseNumberText` is finite." It can return `Infinity` for a very long digit string; callers check `Number.isFinite`, and `parseLevelLine` returns null for such a line.
- "A local date is a UTC date." `localToday` and `localDay` give the person's own calendar day, `YYYY-MM-DD`; the year is not padded (`999-01-02`).
- "The hidden members are data." `raw`, `rec`, `lkey` and `others` are not enumerable: they are not in `Object.keys`, a spread, `JSON.stringify` or `structuredClone`. Only `carryRaw` and `carryOthers` bring them across.
- "`packQualifierValues(['a', 'ALL'])` keeps ALL." ALL with other values is dropped (`a`); ALL alone stays `ALL`.
- "The type tests compare names as the app does." They use `type-key`: the default gives the lower-cased name, so an app whose registry has aliases (for example `Note` and `NoteDocument` as one type) calls `setTypeKey`. For the Value's own type names the default is the same as the app's.
- "`levelLike` reads today's date from nowhere." It takes `today` in its options; without one it reads the clock (`localToday()`).
- "`readValueCard` is pure of the app." It reads the type origin from `term-origin` when it must show a default Endpoint, so it throws `Error("term-origin: call setTermOrigin(<origin>) once at start-up")` if the app has not set it. It throws only then: with any stored Endpoint (even `{}` or a description alone, or the older `valueEndpoint`) it never asks for the origin, and the rest of the unit never does.
- "A Resource's Scale is always `lower`." Only while no Scale is stored. A stored Scale (a record, an inline `a:hasScale` or the older `valueScale`) keeps its direction; a stored Scale with no direction reads `lower` for a Value and a Resource alike (the older meaning of no direction).
- "A Resource's Goal is a `t:Goal`." On a Resource the word Goal is stored as `t:Budget`; `levelTypeName("Goal", "t:Resource")` is `Budget`. A parsed line `Goal [x] 5` still reads as kind `Goal`: the line parser does not know the card. `resourceKind(kind, true)` gives `Budget` for it, and stored with the card's type it is typed `Budget`.
- "A pasted `2 000` keeps its text." `parseLevelLine` reads `2 000`, `2\u00a0000` and `2\u202f000` as 2000 and holds no `valueText` for it (the level writes back as `2000`). The typed and stored paths (`levelOfText`, `levelOfTyped`, `readLevelRecord`) keep the author's text exactly. A thin space (`\u2009`) is no number.
- "An older stored list is carried forward." The older lists (`valueLevels`, `valueMeters`, `scaleQualifierDefinitions`, `valueScale`, `valueEndpoint`) are read, and are nulled in the patch that writes the new shape; they are never written.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/lib/base/planValueModel.ts` (whole, 136 lines) to `src/planValueModel.ts`. Code verbatim except its two imports: `from "./planCard"` is now `from "@kaigilb/gilbplatformcode-plan-card-facts"`, and `import { isResourceType } from "./planKinds"` is now `from "@kaigilb/gilbplatformcode-plan-kinds"`. Comments made generic.
- `src/lib/base/planValue.ts` (whole, 2093 lines) to `src/planValue.ts`. Comments made generic (tags of internal projects, review rounds and people removed from the comments). Code verbatim except:
  - the import of `./planCard` is from `@kaigilb/gilbplatformcode-plan-card-facts` (same names);
  - `import { isResourceType } from "./planKinds"` is from `@kaigilb/gilbplatformcode-plan-kinds`;
  - `import { TYPE_TERM_ORIGIN } from "./typePicture"` is `import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin"`, and in `defaultEndpointPart` (line 97) `` `${TYPE_TERM_ORIGIN}/base/t/${typeName}` `` is `` `${termOrigin()}/base/t/${typeName}` ``. Nothing else changed: the origin is read when the Endpoint default is built, not when the module loads;
  - the import of `isTypeName` from `./planLinks` is from `@kaigilb/gilbplatformcode-type-key`;
  - `import type { BaseRecord } from "./records"` is `from "./baseRecord"`: `src/baseRecord.ts` holds `BaseRecord` and `ServedDocument` of `src/lib/base/records.ts` (lines 45-139 and 141-154), copied field for field with their types, with no other import (comments made generic). `BaseRecord` has the field `typeSubstituted?: true` since 0.2.0;
  - the four definitions now in `qualifier-values` are deleted: `const eq` (line 1726), `ALL_VALUE` (1728-1729), `qualifierValues` (1731-1736) and `packQualifierValues` (1753-1765). Their bodies were compared with `units/qualifier-values/src/qualifierValues.ts` (comments stripped) and are identical (the unit exports `eq`; the source did not). They are replaced by `import { ALL_VALUE, eq, packQualifierValues, qualifierValues } from "@kaigilb/gilbplatformcode-qualifier-values"` and `export { ALL_VALUE, packQualifierValues, qualifierValues };`, so the export list is the source's. `listLikeDefinition` stays here and uses `eq`.
- `src/index.ts` is new. This unit's `tsconfig.json` leaves `noUncheckedIndexedAccess` off (the source was built without it; one line, `variableItem(v.name, option)`, does not compile with it on) and includes `test/`.

### Changes in 0.2.0

Synced from GilbApp `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd` to `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which adds the Development Resource card. In the code: `kindClass`, `levelKindsFor`, `RESOURCE_LEVEL_KINDS` and the `resource` field of `ValueCardData` (model); `defaultEndpointFor`, `defaultDirectionFor`, `BUDGET_LEVEL_TYPE`, `resourceKind`, `RESOURCE_DEFAULT_LEVEL_ROWS`, `RESOURCE_OFFERED_LEVEL_KINDS`, `defaultLevelRowsFor`, `offeredLevelKindsFor`; a `resource` or `cardTypeUri` parameter on `readValueCard`, `scaleFacts`, `scaleCreateFacts`, `scalePatch`, `levelTypeName`, `levelCreateFacts`, `levelPatch`, `sortLevels` and the `resource` option of `levelLike`; and a space-grouped number (`2 000`) read as 2000 in a level line. The new named changes are the `plan-kinds` import and the `term-origin` import above; the new peers are `plan-kinds` and `term-origin`. `BaseRecord` gained `typeSubstituted`. A review-round tag left in one comment of 0.1.0 (above the comma-and-three-digits rule) and a lower-case start of one sentence in `planValueModel.ts` and a stray space in one header comment were corrected; no code changed with them.

The tests are ported from `src/lib/base/planValue.vaultit.test.ts`, `planValue.shapes.v37.test.ts`, `planValue.qaFixes.vaultit.test.ts`, `planValue.text.v38.test.ts`, `planValue.qa3.v30.test.ts`, `planValue.v21.vaultit.test.ts`, `planValue.qualifierShape.v35.test.ts`, `planValue.v30.test.ts`, `planValue.v38.test.ts`, `planValue.scaleDirection.v33.test.tsx` and `planValue.v36.test.ts`: the cases that need only this unit and its peers, inputs and expectations as in the source, with person names and host names in the fixture strings made generic. In 0.2.0 one case follows the source's change: "junk is empty data, never a throw" now expects the Thing / Person Endpoint in the patch of an empty read (as `src/lib/base/planValue.vaultit.test.ts` does at the new commit), with the type origin of the tests. `src/resource.test.ts` is ported from `src/lib/base/planResource.vaultit.test.ts` (the cases of the Budget level and of the defaults) and `src/lib/base/planResource.rqa1.test.ts` (the cases that use only `planValue`, `planValueModel` and `plan-kinds` symbols: the Value is unchanged, the stored Endpoint is never overwritten, the Scale direction, Budget on a Resource, the space-grouped thousands), with the host in the type addresses made the test origin `https://ontology.example.test`. The cases of the same files that read `recordFromServed` or the line order of `plan-kinds` are not in this unit. The tests run with a type origin set (`test/setup.ts` sets it before and clears it after each test). The cases of the same files that use the graph geometry (`buildAxis`, `groupLevels`) are in `value-graph-geometry`; the cases that draw `PlanValueGraph` or read `PlanValueLines.tsx` from disk are not ported. `src/exports.test.ts` pins every export the ported cases do not reach, and `src/resourceExports.test.ts` pins the Resource exports and the type-origin behaviour.
