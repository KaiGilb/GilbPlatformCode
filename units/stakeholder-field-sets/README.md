# stakeholder-field-sets

Says which fields each kind of stakeholder offers, read from the ontology master, and which slot holds a party's name.

## What this is

Says which fields each kind of stakeholder offers, read from the ontology master, and which slot holds a party's name.

Plain functions and types, no React, no credential. An attribute term on the master declares `a:fieldOf <Type>`: instances of that type, and of every type under it, may carry the attribute as a field. For a kind K, the unit finds every type above K by is-a (`ancestors`), and the fields of K are the attributes whose `a:fieldOf` names one of them. Each field is labelled from the attribute's own `a:label`, and its spellings, encoding and cardinality come from its own term. Nothing about what a kind or a field is, is typed into the unit: it all comes out of the master's documents at run time.

- `resolveFieldSets(source, { kinds?, kindSet?, maxDepth? })`: reads the `a:fieldOf` declarations, then the kinds, walks each kind up is-a, and derives the field sets. Gives `StakeholderFieldSets`: `kinds`, `byKind` (a plain record keyed by the kind's IRI, so a reading can be stored and reloaded), `complete`, `incompleteAt` (where the reading was not whole), `unreadable` (declarations that name a kind but could not be read as a field, stated and not dropped). The reads are made in as few rounds as the master allows: the `a/fieldOf` term, the carrier selector (before any kind or type read, so a master without it refuses after two requests), the other predicates with the role's term, the children listings one round per level, then every walk up at the same time, one round per level, each term read once. `kinds` (already resolved) or `kindSet` (the cached set from `stakeholder-kinds`) spare the kind walk; `kinds` wins when both are given. `maxDepth` (default 64) bounds the upward walk; reaching it is reported.
- `deriveFieldSets({ kinds, declarations, predicates, recordTypes? })`: the pure step. Given each kind's ancestors and the declaring term documents, builds `byKind` and `unreadable`. Fields are sorted by term IRI, so two readings compare equal.
- `readPartyName(facts, { name, label })`: a party record's display name. Reads `a:name`; falls back to the label only where no name is present (legacy person records hold the name there). Both spellings come from the terms. A writer writes the name under `name.writeKey` only.
- Types: `StakeholderField`, `RecordField`, `FieldRecord`, `KindFieldSet`, `FieldDeclarationProblem`, `StakeholderFieldSets`, `DeriveInput`, `ResolveFieldSetsOptions`.

A field set decides what a card OFFERS, not what exists. A fact already on a record is shown because the authorized read returned it, whether or not it is in this set. Do not use the set to hide a fact the read returned.

## What this is not

- Not the master reader, nor the kinds: reading term documents is `vocabulary-source`, and the kind set, its words and the shared reader are `stakeholder-kinds`. Both are peers.
- Not a cache. Every `resolveFieldSets` call reads the master again (every request is `no-cache`). The app's cached vocabulary (`createStakeholderVocabulary` in the source repository) is not taken.
- Not a writer, and not the form a card draws: it says which fields, with their keys; a writer or a view uses them.
- Not a place that names a kind or a field.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-field-sets`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-field-sets` prints:

```sh
npm install <path-to-the-library>/units/stakeholder-field-sets
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets, readPartyName } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";

const sets = await resolveFieldSets(masterSource({ vedaOrigin: "https://ontology.platform.example.test" }));
if (!sets.complete) console.warn("a floor, not the full answer:", sets.incompleteAt, sets.unreadable);
const person = Object.values(sets.byKind).find((k) => k.name === "Person");
for (const f of person?.fields ?? []) console.log(f.label, f.writeKey, f.many ? "several" : "one");
const name = readPartyName({ "a:name": "Ann" }, sets.kinds.predicates); // "Ann"
```

## What the host must supply

- A `VocabularySource` (`masterSource({ vedaOrigin })` of `vocabulary-source`, or your own). In the Plan card the origin is `termOrigin()` of `term-origin`.
- A timer: the reads asked for in one turn of the event loop are sent as one named read, batched with `setTimeout(..., 0)`.
- Nothing else. No setting, no credential, no start-up call.

## Module state

None. Every `resolveFieldSets` call keeps its own caches (a term-document cache, a parents cache, the batch queue) in its closure and drops them when it returns. The unit holds only types and functions.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not read `byKind` as "what exists". It is what a card offers.
- Do not read an empty field set, or `complete: false`, as "no fields". A master that could not be read is an error (`VocabularyUnavailableError`, or `CarrierSelectorMissingError` for a master without the carrier selector), never an empty set. Zero declarations over a complete listing is reported in `incompleteAt`.
- Do not compare a field's `term` across sources: it is the IRI as the declarations source served it (the listing serves the `.../base/t/<Name>` form, the per-term route `.../base/a/<slug>`). To read or write a value use `readKeys` and `writeKey`.
- Do not write a party's name under the label spelling.
- Do not install a second copy of `stakeholder-kinds` or `vocabulary-source` beside this unit.

## Wrong readings

- "A field declared on a type outside every kind's ancestry is offered to nobody and reported." It is silently ignored: a declaration that names none of the kinds' types is not ours to judge, even when its term cannot be read.
- "The listing's order is the field order." Fields are sorted by term IRI; the order carries no meaning. An app that wants a display order decorates.
- "`kindSet` and `kinds` are merged." `kinds` wins; `kindSet` is ignored when `kinds` is given.
- "A field is `many` unless it says single." It is `many` only when its own term declares cardinality `multi`; a term that declares none, or any other word, is one value.
- "A declaration listed twice is two fields." The first listing wins; the rest are skipped.
- "A field that names two record types gets the first." It gets no record and is reported in `unreadable`.
- "A record's fields include the person's." A record's fields are those whose `a:fieldOf` names the record type or a type above it; they reach no stakeholder kind.
- "`readPartyName` returns the label when the name is blank." It does: a blank or non-text name counts as absent, and the label is read; `null` only when neither is present.
- "The upward walk has no end." It stops at `maxDepth` (64) and says so, once per kind.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script:

- `src/fieldSets.ts` to `src/fieldSets.ts`: lines 33-390, the whole file after its header comment (lines 1-17) and its imports (lines 18-31): `StakeholderField`, `RecordField`, `FieldRecord`, `KindFieldSet`, `FieldDeclarationProblem`, `StakeholderFieldSets`, `DeriveInput`, `deriveFieldSets`, `ResolveFieldSetsOptions`, `resolveFieldSets`, `readPartyName`.

**Merged units compared and taken or not.** `units/vocabulary-source` (0.2.0) holds `cardinalityOf`, `encodingOf`, `refsUnder`, `spellingOfTermDoc`, `textUnder`, `typeAttributeOf`, `PredicateSpelling`, `TermDoc` and `VocabularySource`, and `units/stakeholder-kinds` (0.2.0) holds `resolvePredicate`, `resolvePredicates`, `resolveStakeholderKinds`, `stakeholderKindsOf`, `StakeholderKindSet`, `StakeholderKinds` and `StakeholderPredicates`, each equal to the source (token for token, comments and imports excluded); both are peers. No other unit holds a symbol of this file.

Named changes, and only these:

1. the imports (source lines 18-31) are one import of the peer `vocabulary-source` and one of the peer `stakeholder-kinds`; the code after them is the source's, unchanged;
2. the header comment is a new, shorter one, and comments that name a cycle, a ticket, an agent or a ruling are reworded; no code changed. No string literal carries a tag.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts` and `test/fixtureTag.ts`, not shipped; the hosts are `example.test` hosts): `test/support.ts` is `gilb-stakeholders` `test/fixtureMaster.ts` at the same commit, with the hosts renamed; `test/fixtureTag.ts` is its `test/fixtureTag.ts` (the tag-standard record and the field declarations with the encodings a create needs). Ported from `gilb-stakeholders` `test/` at the same commit, by test block: `fieldSets.test.ts` 20 of 20, `fieldRecord.test.ts` 8 of 8, `carrierSelector-22c.test.ts` 16 of 17 (here `carrierSelector.test.ts`), `fieldSetReadSpeed-22d.test.ts` 16 of 18 (`fieldSetReadSpeed.test.ts`; the source counted real milliseconds in its longest-chain test, here a logical clock does), `qa-c214.test.ts` 7 of 12 (`qa-fieldSets.test.ts`, with `kindTypeNames` written out as a one-line helper), `qa-c214-22c.test.ts` 3 of 4 (`qa-22c.test.ts`), `qa-c214-22c-r2.test.ts` 3 of 3 (`qa-22c-r2.test.ts`), `qa-c214-22d.test.ts` 4 of 5 (`qa-22d.test.ts`), `qa-c214-22d-r2.test.ts` 3 of 3 (`qa-22d-r2.test.ts`), and four of the `kindSet` tests of `kindReader-m3k-r2-scaling.test.ts` and `qa-c214-m3k-s86.test.ts` (`fieldSetsFromKindSet.test.ts`). That is 84 ported tests. New: `deriveFieldSets.test.ts` (22: the pure step, `readPartyName`, the ceiling, the notes and the walk up of `resolveFieldSets`), 3 in `fieldSetsFromKindSet.test.ts` (the `kinds` option, `kinds` over `kindSet`, an incomplete set), `fieldSetsUnit.test.ts` (1: the export list). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: from `qa-c214.test.ts` the tests that read the app's cached vocabulary (`createStakeholderVocabulary`, 4) or call `resolveStakeholderKinds` alone (1, in `stakeholder-kinds`), and the one skipped test (a second parent outside the kind set: a shape the master does not serve); from `qa-c214-22c.test.ts` Q4, and from `carrierSelector-22c.test.ts` the "app's reading stays not known yet" test (both read the cached vocabulary); from `qa-c214-22d.test.ts` Q8 and from `fieldSetReadSpeed-22d.test.ts` two tests (they call `resolveStakeholderKinds` alone; they are in `stakeholder-kinds`); `createShortcut-s8labels.test.ts` (it runs `resolveStakeholderKinds` and `kindDescendants` and never a field set: it is in `stakeholder-kinds` as `createShortcutLabels.test.ts`); the rest of the files that reach `fieldSets.ts` (`holderReference*`, `pickOrCreate`, `ifMatchRetry-25f`, `rowVault-25e`, `qa-c214-25b*`, `qa-c214-25e`, `qa-c214-25f-qa1b`, `qa-c214-r3` to `r6`, `qa-c214-m3k-s87`, `qa-c214-m3k-s89`, `qa-c214-m3kt-s92`, `qa-c214-m3kt-s93`, `tagWriteRule*`, `lists`): they run the reference check, the picker, the record writers, the tag write rule or the list reader, which are other units.
