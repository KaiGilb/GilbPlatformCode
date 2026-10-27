# value-card-model

The Value card's data, read from the Value record and its child records and built back into the facts to store, as plain functions with no React and no network.

## What this is

The Value card's data model: it reads a Value's facts and the records that are parts of it (the Scale, the Scale qualifiers and their option definitions, the level records, the Meters and Meter lines) into one `ValueCardData`, and builds the create facts and the patches that write an edit back. It also holds the level-line text (a level typed or pasted as one line, and shown as one line), the numbers a level is typed with and the dates it takes. Pure: no React, no I/O.

- Reading: `readValueCard(facts, scaleRow?)`, `readLevelRecord(s)`, `readQualifierRecord(s)`, `readMeterRecords`, `readMeterLineRecord`, `readScaleRecord`, `readLegacyLevels` / `readLegacyMeters` / `readLegacyVariables` (the older stored lists, read-only), `scaleRowOf`, `scaleRefOf`, `valueLinesEmpty`, `latestChange`.
- Building: `valueCardPatch` (the Value's own patch: the Endpoint only), `scaleFacts`, `scaleCreateFacts` / `scalePatch` / `scaleLinkPatch`, `qualifierCreateFacts` / `qualifierPatch`, `optionDefCreateFacts` / `optionDefPatch`, `meterCreateFacts` / `meterPatch`, `meterLineCreateFacts` / `meterLinePatch`, `levelCreateFacts` / `levelPatch`, and the tags (`scaleTag`, `qualifierTag`, `optionDefTag`, `meterTag`, `meterLineTag`, `levelTag`, `levelTagTry`). A patch holds only the facts that changed, `null` removes a fact, and an older name a record still holds is nulled in the same patch that writes the new one.
- Level lines: `parseLevelLine`, `parseLevelLineWarn`, `formatLevelLine`, `levelLineSegments`, `sortLevels`, `levelGroupKey`, `quoteValue`, `splitOutsideBraces`, `listLikeDefinition`, `movableConditions`, `moveConditionIntoVariable`, `renameLevelQualifier`, `removeLevelQualifier`, `levelsSettingBoth`, `levelsUsingQualifier`, `levelHasQualifierValue`.
- Numbers and dates: `parseNumberText`, `plainNumberText`, `levelDrawNumber`, `levelRangeEnds`, `levelOfText`, `levelOfTyped`, `levelNumberDisplay`, `levelNumberText`, `levelNumberTyped`, `parseLevelDate`, `localToday`, `localDay`.
- New levels: `blankLevel`, `levelLike` (a new level in the set an Arrow row or Timeline series already holds), `newLevelFromClick`, `OFFERED_LEVEL_KINDS`, `DEFAULT_LEVEL_ROWS`, `PRESET_QUALIFIERS`.
- Scale names: `scaleVariableNames`, `scaleQualifierNames`, `qualifierRows`, `withScaleQualifiers`, `renameCandidate`, `scaleDirectionOf`.
- The hidden carry: `carryRaw`, `carryOthers`, `withOthers`, `othersOf`, `recOf`, `levelKey`, `setLevelKey`, `aliasLevelKey`, `resolveLevelKey`.
- Type tests: `isLevelType`, `isScaleType`, `isQualifierType`, `isOptionDefType`, `isQualifierRowType`, `isLegacyQualifierRow`, `isMeterType`, `isMeterLineType`, all through `isTypeName` of the `type-key` peer.
- Re-exported from `qualifier-values` so the export list is the source's: `ALL_VALUE`, `qualifierValues`, `packQualifierValues`.
- The types: `ValueCardData`, `ValueScale`, `ScaleVariable`, `ValueLevel`, `LevelQualifier`, `ValueMeter`, `ValueMeterLine`, `EndpointPart`, `ScaleDirection`, `MeterKind`, `BaseRecord` and others.

Wire vocabulary it reads and writes (`a:` is the attribute prefix; a stored bare name is the same name without `a:`):

- The Value: `VALUE_TERMS` = `a:hasScale` (a reference `{ "@id": <Scale record> }`) and `a:endpoint` (`a:endpointSubject` and `a:endpointReference`, each `{ "@id": <type IRI>, "a:label", "a:description" }`, and `a:description`). The older names are read, never written (`LEGACY_VALUE_SLUGS`): `valueScale`, `valueEndpoint`, `scaleQualifierDefinitions`, `valueMeters`, `valueLevels`, and the older sentence keys `a:scale`, `scaleText`, `endpointText`, `a:definition`.
- The Scale record (`t:Scale`, `a:partOf` the Value): `a:description`, `a:unit`, `a:rate`, `a:scaleContext`, `a:scaleDirection` (`lower`, `higher`, `target`; always written), and the source keys `a:source`, `a:statedBy`, `a:derivedFrom`.
- Level records (`LEVEL_TERMS`): `a:scaleNumber` (the author's text), `a:levelWhen`, `a:levelCondition`, `a:levelQualifierChoice` (a list of `{ "a:name", "a:qualifierOptions" }`; ALL has no `a:qualifierOptions`), `a:levelSide`, `a:note`, `a:unitTag`, `a:label` (a custom word), `a:lineSources`, `a:partOf`, `a:elementOrder`. A level is typed `t:Fail`, `t:Survival`, `t:Past`, `t:Status`, `t:Tolerable`, `t:Goal` or `t:Wish` (`STANDARD_LEVEL_KINDS`), or `t:Level` for any other word. The older names `measurementValue`, `levelValue`, `qualifierCondition`, `levelConditions`, `levelVariables` and the older type `PlanguageLevel` are read.
- Child records (`VALUE_CHILD_TERMS`): `t:ScaleQualifier` and `t:ScaleQualifierDefinition` (`a:name`, `a:definition`, `a:defaultOption`, `a:qualifierOptions`), `t:Meter` (`a:meterQualifier`) and `t:MeterLine` (`a:meterAgentKind` of `human`, `ai` or `instrument`, `a:meterMethod`), each with `a:unitTag`, `a:lineSources`, `a:partOf`, `a:elementOrder`. The older `options`, `qualifier`, `method` and `measurementMethod` are read.

The unit holds module state (the `keyAlias` map behind `aliasLevelKey` and `resolveLevelKey`), so an app must install ONE copy of it (it is a peer of every unit that uses the level keys).

## What this is not

- Not React. Nothing here draws.
- Not a writer. The create facts and the patches are returned; sending them to the vault, and creating or ending the records, is the host's (a later unit, `value-card-write`).
- Not the older `spec-card-facts` or `scale-facts` units. They read other, earlier shapes and are not interchangeable with this one.
- Not the graph's geometry (`value-graph-geometry`) or its drawing.
- Not a type registry. Whether a record is a Goal or a Scale is asked of `type-key`.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-card-model`

Take it together with its three peers: `plan-card-facts`, `qualifier-values` and `type-key`. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one `keyAlias` map and one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/type-key <path-to-the-library>/units/value-card-model
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { readValueCard, valueCardPatch, readLevelRecords, levelPatch, parseLevelLine, formatLevelLine } from "@kaigilb/gilbplatformcode-value-card-model";

// Read the card from the Value's facts (and its Scale record, when the host has it).
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

## Do not

- Do not install a second copy of this unit, or of `type-key`: the `keyAlias` map and the type function are module state.
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
- "An older stored list is carried forward." The older lists (`valueLevels`, `valueMeters`, `scaleQualifierDefinitions`, `valueScale`, `valueEndpoint`) are read, and are nulled in the patch that writes the new shape; they are never written.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`:

- `src/lib/base/planValueModel.ts` (whole, 119 lines) to `src/planValueModel.ts`. Code verbatim except its one import: `from "./planCard"` is now `from "@kaigilb/gilbplatformcode-plan-card-facts"`. Comments made generic.
- `src/lib/base/planValue.ts` (whole, 2042 lines) to `src/planValue.ts`. Comments made generic (tags of internal projects, review rounds and people removed from the comments; a trailing comment on one code line, `// no Scale yet: "higher"`, lost its tag). Code verbatim except:
  - the import of `./planCard` is from `@kaigilb/gilbplatformcode-plan-card-facts` (same names);
  - the import of `isTypeName` from `./planLinks` is from `@kaigilb/gilbplatformcode-type-key`;
  - `import type { BaseRecord } from "./records"` is `from "./baseRecord"`: `src/baseRecord.ts` holds `BaseRecord` and `ServedDocument` of `src/lib/base/records.ts` (lines 46-134 and 136-149), copied field for field with their types, with no other import (comments made generic);
  - the four definitions now in `qualifier-values` are deleted: `const eq` (line 1676), `ALL_VALUE` (1678-1679), `qualifierValues` (1681-1686) and `packQualifierValues` (1703-1715). Their bodies were compared with `units/qualifier-values/src/qualifierValues.ts` (comments stripped) and are identical (the unit exports `eq`; the source did not). They are replaced by `import { ALL_VALUE, eq, packQualifierValues, qualifierValues } from "@kaigilb/gilbplatformcode-qualifier-values"` and `export { ALL_VALUE, packQualifierValues, qualifierValues };`, so the export list is the source's. `listLikeDefinition` stays here and uses `eq`.
- `src/index.ts` is new. This unit's `tsconfig.json` leaves `noUncheckedIndexedAccess` off (the source was built without it; one line, `variableItem(v.name, option)`, does not compile with it on).

The tests are ported from `src/lib/base/planValue.vaultit.test.ts`, `planValue.shapes.v37.test.ts`, `planValue.qaFixes.vaultit.test.ts`, `planValue.text.v38.test.ts`, `planValue.qa3.v30.test.ts`, `planValue.v21.vaultit.test.ts`, `planValue.qualifierShape.v35.test.ts`, `planValue.v30.test.ts`, `planValue.v38.test.ts`, `planValue.scaleDirection.v33.test.tsx` and `planValue.v36.test.ts`: the cases that need only this unit and its peers, inputs and expectations as in the source, with person names and host names in the fixture strings made generic. The cases of the same files that use the graph geometry (`buildAxis`, `groupLevels`) are in `value-graph-geometry`; the cases that draw `PlanValueGraph` or read `PlanValueLines.tsx` from disk are not ported. `src/exports.test.ts` is new and pins every export the ported cases do not reach.
