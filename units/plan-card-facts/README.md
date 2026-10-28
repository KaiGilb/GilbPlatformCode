# plan-card-facts

The facts a Function, Solution or Value card reads and writes on the record itself, as plain functions over the stored wire shapes.

## What this is

The facts a Function, Solution or Value card reads and writes on the record itself, as plain functions over the stored wire shapes.

The facts a Function, Solution or Value card reads and writes on the record itself: who a line came from (its source), the meters, the status lines (Status and Past), the concept, and the vault's inline lists (served lists). Plain functions and constants, no React, no network. The vocabulary loader of the source file is NOT in this unit; an app loads its own vocabulary.

- Wire keys it reads and writes, verbatim: `a:source` (the words), `a:statedBy` and `a:derivedFrom` (each `{ "@id": <uri> }`), `a:sourceOf` (which line a source member belongs to, for example `a:body`), `a:meterAgentKind` (`human`, `ai`, `instrument`), `a:method`, `a:status`, `a:statusWhen`, `a:label` and `@id` (the concept). It also reads the bare and full-IRI spellings of each (`memberValue`: `a:<name>`, else `<name>`, else a key ending `/a/<name>` or `/<name>`), and, for `planValueText`, the keys `unitTag`, `label` and `tag` of a stakeholder. The list fields it knows by their local names are `stakeholders`, `concept`, `fvParent`, `hasMeter`, `levelStatements` and `lineSources` (`PLAN_SHOWN_FIELDS`).
- Constants: `PLAN_SHOWN_FIELDS`, `PLAN_STATUS_WORDS` (`Planned`, `Developed`, `In-Production`, `Retired`).
- Served lists: `servedList(raw)` (an array, one plain object, or a JSON string of either, as a list of members), `sameServedList(a, b)`, `memberValue(member, name)`, `rowServedFact(row, name)` (a top-level fact: served facts win over the flat map), `localToday(now?)`.
- Sources: `asPlanSource`, `planSourceEmpty`, `planSourceEqual`, `sourceWithText`, `sourceWithStatedBy`, `sourceWithDerivedFrom`. A source is `{ text?, statedBy?, derivedFrom? }`.
- Line sources: `readLineSources(raw)` (the `lineSources` list as key to source) and `writeLineSource(raw, key, who)` (set, replace or remove the one member for `key`, keeping every member and field it did not mean to change).
- Meters: `readMeters(raw)` and `writeMeters(meters)` (three kinds, `human`, `ai`, `instrument`; unknown kinds and a second member of a known kind ride in `others`).
- Status lines: `readLevelLines(raw)` (the latest date is Status, the rest are Past, newest first) and `writeLevelLines(lines)` (stored oldest first).
- The hidden raw: a read draft or line carries its served member as `raw`, a property that is not enumerable, so an edit that goes through `carryMeter(next, prev)` or `carryLine(next, prev)` writes back every key the card did not edit. `lineOthers(lines)` and `withLineOthers(lines, others)` carry the members that are not status lines on the array itself.
- Concept: `readConcept(raw)` and `writeConcept(concept)`.
- `planValueText(localName, raw)`: readable text for one structured line; empty is a dash.

## What this is not

- Not the vocabulary loader. The source file also holds a loader that reads the Plan card types and field sets from a vocabulary service and stores them; it needs private packages and the app's store, and is cut. An app loads its own.
- Not the older `spec-card-facts` unit. That is a different, earlier form reader; it is not the same behaviour, and the two are not interchangeable.
- Not a validator. It never throws on junk (junk reads as empty), and it does not check that a URI exists.
- Not a writer to a vault. The write functions return the list to store; sending it is the host's.
- Not the other Plan records (parts, levels, impacts, links). Those are other code and are not in this unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-card-facts`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/plan-card-facts
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import {
  readMeters, writeMeters, carryMeter,
  readLevelLines, writeLevelLines,
  readLineSources, writeLineSource,
  sourceWithStatedBy,
} from "@kaigilb/gilbplatformcode-plan-card-facts";

// Edit one meter's method and keep every key the card did not edit.
const meters = readMeters(record.hasMeter);
meters.human = carryMeter({ ...meters.human, method: "Asks the user" }, meters.human);
const hasMeter = writeMeters(meters); // store this under a:hasMeter

// Who said the body line.
const sources = readLineSources(record.lineSources); // { "a:body": { statedBy: "https://..." } }
const lineSources = writeLineSource(record.lineSources, "a:body", sourceWithStatedBy(sources["a:body"], uri));

// Status (latest) and Past (the rest), newest first.
const { status, past } = readLevelLines(record.levelStatements);
```

## What the host must supply

- The record, as the vault serves it: the `served` list value for each field (an array, one bare object, or a JSON string of either).
- The place that stores what the write functions return (`a:hasMeter`, `a:levelStatements`, `a:lineSources`, `a:concept`), and the loading of the field vocabulary.
- Nothing else: no React, no CSS, no environment.

## Do not

- Do not spread a draft and expect `raw` to come along: write `carryMeter({ ...draft, method }, draft)` or `carryLine({ ...line, status }, line)`. A plain spread loses `raw`, and the write then holds only what the draft holds.
- Do not store `raw`: it is hidden on purpose. Do not rely on it in JSON, in a spread, or in a structured clone.
- Do not drop `others` (`readMeters(...).others`, `readLevelLines(...).others`, `lineOthers`): they are the members the card does not own, and the write puts them back.
- Do not pass a URI to `writeLineSource` as a plain string: a string is the words. Give an object `{ statedBy }` or `{ derivedFrom }` for a link.
- Do not use `localToday` where a UTC date is wanted.

## Wrong readings

- "`localToday` is today in UTC." It is the LOCAL calendar date of the instant it is given, `YYYY-MM-DD`; the year is not padded.
- "A read line is a plain object." It also carries a hidden `raw`: a property that is not enumerable, so it does not appear in `Object.keys`, in `JSON.stringify`, in a spread or in a structured clone.
- "Writing a link keeps the words." Writing a `statedBy` or a `derivedFrom` through `writeLineSource` with an object that has no `text` key drops the words; writing words alone keeps a link already stored.
- "`a:source` can hold a link." It is only ever a string; an `{ "@id" }` under it is ignored.
- "The latest date is kept as typed." A line's date is cut to ten characters on read, but an untouched line is written back byte for byte, a time of day included.
- "`sameServedList` compares text." It compares members in order, with `a:`, bare and full-IRI spellings of a key as the same and `null` values ignored.
- "A lone `{ "@id" }` link is a list of one." It is an empty list.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/lib/base/planCard.ts` lines 20-71 and 130-973 (the file is 973 lines) to `src/planCardFacts.ts`. The kept lines are byte for byte as in the source, comments included (they name no person, project or host). Cut:

- lines 1-19 (the header comment and the imports from `gilb-stakeholders`, `./stakeholderKinds`, `./planKinds` and `./stakeholderCard`) are replaced by a new short header comment;
- lines 72-128 (`PLAN_CARD_VOCABULARY_STORE_KEY`, `PLAN_CARD_VOCABULARY_QUERY_KEY`, `planKinds`, `readPlanCardVocabulary` and `planCardVocabularyQuery`, the vocabulary loader) are deleted. Nothing in the kept lines uses a name from the deleted lines or the removed imports.

`src/index.ts` is new (`export * from "./planCardFacts"`). The tests are ported from `src/lib/base/planCard.vaultit.test.ts` (the cases that need only this file), `planCard.keepMembers.vaultit.test.ts`, `planServedShapes.vaultit.test.ts`, `planQaTester.vaultit.test.ts` and `planQaTester2.vaultit.test.ts` (the cases that use only symbols of `planCard.ts`), with person names and host names in the fixture strings made generic; `src/exports.test.ts` is new and pins every export.
