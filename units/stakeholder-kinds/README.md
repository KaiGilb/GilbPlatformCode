# stakeholder-kinds

Which stakeholder kinds exist and their words, read from the GilbVeda master in as few requests as it allows, kept across sessions, and shared by every reader in a page.

## What this is

Which stakeholder kinds exist and their words, read from the GilbVeda master in as few requests as it allows, kept across sessions, and shared by every reader in a page.

Plain functions and types, no React. The role concept `t/Stakeholder` names, in its `a:playableBy`, the types whose instances may play it; every type under those, by is-a, may too. This unit reads that set and each type's word (`a:label`) from the master, and keeps it. No kind, type or word is named in the code: every name and word is the master's answer.

- `stakeholderKindReader({ vedaOrigin, roleTerm?, fetchImpl?, store?, timeoutMs?, readCapMs? })`: THE reader of a master origin and role in this page. Every call with the same origin and role gets the same reader, so the set is read once per page and kept once per origin and role. The first call keeps the fetch it was made with.
- `createStakeholderKindReader({ source, origin, roleTerm?, store?, maxAgeMs?, checkDelayMs?, now?, defer?, readCapMs?, onSubscriberError? })`: one reader over a source you give (a test, an agent).
- The reader is a `CachedReader<StakeholderKindSet>`: `get()` (the value in hand or kept, else read now; rejects only when no value is in hand and the master cannot be read), `peek()` (the value in hand, or `null`, which means "not known yet" and NEVER "none"), `check()` (read the master now) and `subscribe(fn)` (called with each changed answer; returns the unsubscribe).
- `StakeholderKindSet`: `role`, `members`, `roleLabel`, `types` (each `StakeholderKindType`: `term`, `name`, `label`, `isMember`, `parents`, `members`), `names`, `labels`, `labelKeys`, `spellings`, `complete`, `incompleteAt`, `createShortcuts`, `shortcuts`.
- `kindLabelOf(set, type)`: the master's word for a row's type, whichever spelling the vault served (`t:X`, `https://<any host>/base/t/X`, a bare `X`); never throws; `null` when the set does not know it.
- `KIND_SET_MAX_AGE_MS` (10 minutes), `KIND_SET_CHECK_DELAY_MS` (3 s), `KIND_TYPE_MAX_LENGTH` (2048).
- `kindDescendants(kinds, term)`: every type of the set below `term` by is-a, with its depth. `expandDownIsA(source, members)`, `readShortcutSpelling(source)`, `settleShortcuts(read, players)`, `STAKEHOLDER_ROLE_TERM`, `CREATE_SHORTCUT_TERM`: the walk and the create shortcuts the reader is built from.
- `resolvePredicate(source, key)`, `PREDICATE_TERMS`: one predicate term's spellings from its own document.
- `forgetStakeholderKindReaders()`: empties the register of shared readers (tests; a page never needs it).
- Types: `StakeholderKinds`, `KindDescendant`, `CreateShortcut`, `ShortcutState`, `StakeholderPredicates`, `VocabularyStore`, `CacheOptions`, `KindReaderOptions`, `SharedKindReaderOptions`, `ReadKindSetOptions`, `StakeholderKindReader`.

## What this is not

- Not the whole of `gilb-stakeholders`' `kindReader.ts`, `kinds.ts`, `predicates.ts` and `vocabulary.ts`: only the symbols the Plan-card readers reach. Not here: the type-tree reader (`typeTreeReader`, `createTypeTreeReader`, `readTypeTree`), `readStakeholderKindSet`, `stakeholderKindsOf`, `resolveStakeholderKinds`, `kindTypeNames`, `resolvePredicates`, `createStakeholderVocabulary`, and the field sets they feed.
- Not a place that names a kind: nothing in the code says which types are stakeholders.
- Not the master reader: reading term documents, and bounding every request, is `vocabulary-source`, a peer.
- Not a writer.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-kinds`

From a clone of this repository, install the unit's folder; `npm install` takes its peer first, in the order `node scripts/peers.mjs units/stakeholder-kinds` prints:

```sh
npm install <path-to-the-library>/units/stakeholder-kinds
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { stakeholderKindReader, kindLabelOf } from "@kaigilb/gilbplatformcode-stakeholder-kinds";

const reader = stakeholderKindReader({ vedaOrigin: "https://ontology.platform.example.test" });
const set = await reader.get(); // a warm device answers from its store: 0 requests
const word = kindLabelOf(set, "t:Person"); // the master's word, or null
const stop = reader.subscribe((next) => console.log("the master gained a kind", next.names));
```

## What the host must supply

- The master's origin, `vedaOrigin`: a bare origin; a path or a relative address is refused with a `VocabularyUnavailableError`. In the Plan card it is `termOrigin()` of `term-origin`.
- Optionally: `fetchImpl` (see `vocabulary-source`), `store` (a `VocabularyStore`: `getItem`/`setItem`; default `globalThis.localStorage` when it can be used, `null` for memory only), `timeoutMs`, `readCapMs`.
- Nothing else. No setting and no start-up call.

## Module state

The unit holds one piece of module state. An app must have ONE copy of this unit, or each copy keeps its own register and the set is read once per copy.

- `readersByOrigin` (`kindReader.ts`): a `Map` from `<master origin>|<role>` to the shared reader. `stakeholderKindReader` fills it and never empties it; `forgetStakeholderKindReaders()` does. Nothing runs at import: the first read happens on the first `get()`.

Each reader also holds its own state in closures (the value in hand, the time it was last checked, the subscribers), and writes to `localStorage` under `gilb-stakeholders.kind-set.v1:<origin>` (`|<role>` for another role). The store key is the package's own and is kept, so a set kept by the app before it took this unit is still read.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not read `peek() === null` as "no kinds". It is "not known yet". A role with no players is an error (`VocabularyUnavailableError`), never an empty set: an empty set would look like a person who has recorded no one.
- Do not name a kind, a type or a word in the app. If one is missing, it is missing from the master.
- Do not install a second copy of this unit.
- Do not read the set a second time on another door of the same page: ask `stakeholderKindReader` again; it gives the same reader.
- Do not give `timeoutMs` or `readCapMs` as 0, negative, `NaN`, `Infinity` or above 2,147,483,647: each is refused with a `RangeError`, even when the page already has the reader.

## Wrong readings

- "A kept set older than the max age is read again before it is answered." It is answered at once, and checked again in the BACKGROUND, `KIND_SET_CHECK_DELAY_MS` later. A changed answer is kept and handed to every subscriber.
- "A failed check wipes the set." A failed check keeps the set in hand and waits another max age; a failed word read keeps the word already in hand; a check that still misses a word it needed is a failed check, so nothing is kept or told.
- "A cold read that missed a word is kept." It is answered (the word is drawn without) but not kept in the store and not dated; that read itself schedules ONE background check for what it missed.
- "A store that throws is an error." No store, or a store that throws (private mode, quota), is memory only, never an error to the caller. A kept entry that is not shaped like a set is ignored, as if nothing were kept.
- "`kindLabelOf` guesses a word." It never does: `null` when the set does not know the type. It never throws, whatever it is handed (a parsed JSON value, an object whose getters throw), and a type longer than `KIND_TYPE_MAX_LENGTH` is not read.
- "Every origin spelling gives its own reader." `HTTPS://HOST`, `https://host/`, `https://host:443` give one; `file:` and `data:` (origin "null") are refused.
- "The master answers the kinds in one request." It does not: a cold read is 4 requests (the role's term, `a/playableBy`, `a/label`, `a/createShortcut`), then one named read of every player and shortcut, then one children listing per type; the master has no door that answers the is-a closure in one request.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `27fe0cef35857c070354c0439c6e4e4ebcc62815`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from the Plan card's host code in GilbApp at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which pins this package at that commit):

- `src/predicates.ts` to `src/predicates.ts`: lines 19-42 (`StakeholderPredicates`, `PREDICATE_TERMS`, `resolvePredicate`);
- `src/kinds.ts` to `src/kinds.ts`: lines 21-78, 140-226, 255-289 (`STAKEHOLDER_ROLE_TERM`, `StakeholderKindType`, `CREATE_SHORTCUT_TERM`, `CreateShortcut`, `ShortcutState`, `StakeholderKinds`, `expandDownIsA`, `readShortcutSpelling`, `ShortcutsRead`, `settleShortcuts`, `KindDescendant`, `kindDescendants`);
- `src/vocabulary.ts` to `src/vocabularyStore.ts`: lines 23-27 (`VocabularyStore`);
- `src/kindReader.ts` to `src/kindReader.ts`: lines 57-88, 102-194, 218-283, 287-295, 299-586, 638, 641-711, 737-741 (`StakeholderKindSet`, `ReadKindSetOptions`, `KindSetRead`, `readKindSet`, `readWords`, `wordsOf`, `KIND_TYPE_MAX_LENGTH`, `withoutTrailingSlashes`, `TYPE_PATH`, `kindLabelOf`, `labelOfType`, `KIND_SET_MAX_AGE_MS`, `KIND_SET_CHECK_DELAY_MS`, `STORE_KEY_HEAD`, `Stored`, `CacheOptions`, `KindReaderOptions`, `reportToHost`, `CachedReader`, `StakeholderKindReader`, `defaultStore`, `isText`, `isTextList`, `isWord`, `isRecord`, `isSpelling`, `usableSet`, `CacheRead`, `createCachedReader`, `termPath`, `rolePath`, `createStakeholderKindReader`, `readersByOrigin`, `SharedKindReaderOptions`, `sharedParts`, `checkSharedBounds`, `masterOrigin`, `stakeholderKindReader`, `forgetStakeholderKindReaders`).

Not taken: in `kindReader.ts` `readStakeholderKindSet` (90-100), `stakeholderKindsOf` (196-216), the type-tree reader (588-636, 713-735); in `kinds.ts` `ResolveKindsOptions`, `resolveStakeholderKinds`, `readShortcuts`, `kindTypeNames`; in `predicates.ts` `resolvePredicates`; in `vocabulary.ts` everything but the interface `VocabularyStore` (it is in `vocabularyStore.ts`). Taken though the tracer did not reach it: `forgetStakeholderKindReaders` (737-741), the only way to empty `readersByOrigin`.

**Merged units compared and taken or not (each reached symbol, comments stripped, whitespace collapsed; measured with a diff script).**

- `units/plan-stakeholders-model` (`src/kinds.ts`) holds `StakeholderKindType` and `KindDescendant`, EQUAL to these, and `kindDescendants`, which is NOT equal: its parameter is `{ types: StakeholderKindType[] }` where the source's is `Pick<StakeholderKinds, "types">` (the same type, written out). So `kindDescendants` is a false friend and is taken here. The two equal types are taken here too and are NOT imported from it, on purpose: `plan-stakeholders-model` is a consumer of the kind set (its peers are `entity-ref`, `plan-card-facts`, `relation-role`, `type-curie` and `type-key`); making the unit that reads the kinds depend on it would turn the dependency upside down. The types are structural, so a value typed by either unit is accepted by the other. An app that takes both has two names for one type.
- `units/vocabulary-source` is a peer: the reached symbols of `terms.ts`, `deadline.ts` and `source.ts` are there.
- No other unit holds a reached symbol of these files.

Named changes, and only these:

1. the imports of the source's own files lose `.ts` (`./kinds`, `./predicates`, `./vocabularyStore`; `./vocabulary.ts` is `./vocabularyStore`), and the imports of `./terms.ts`, `./source.ts` and `./deadline.ts` are one import of the peer `vocabulary-source`; the imports of symbols that are not taken (`resolvePredicates`, `VocabularyUnavailableError` and `textUnder` in `kinds.ts`; `StakeholderKinds` in `kindReader.ts`) are dropped;
2. `forgetStakeholderKindReaders` (`kindReader.ts` line 740) loses the line `treesByOrigin.clear();`, because the type-tree readers are not taken;
3. the header comment of each file is a new, shorter one, and comments that name a host, a person, an agent or a ticket are reworded; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, not shipped; the hosts are `example.test` hosts): ported from `gilb-stakeholders` `test/` at the same commit, by test block: `kindReader-m3k.test.ts` 16 of 23, `kindReader-m3k-r2.test.ts` 10 of 10, `kindReader-m3k-r2-scaling.test.ts` 3 of 8, `kindReader-m3k-r3.test.ts` 10 of 28, `qa-c214-m3k-s85.test.ts` 20 of 20 (here `qa-m3k-s85.test.ts`), `qa-c214-m3k-s86.test.ts` 20 of 23 (`qa-m3k-s86.test.ts`), `masterTimeout-m3kt.test.ts` 10 of 34. New: `kinds.test.ts` (16: `predicates.ts` and `kinds.ts` over a hand-made source), `stakeholderKinds.test.ts` (3: the export list, the cache constants, the register and its reset), `sharedReader.test.ts` (9: what the ported blocks left unpinned, found by mutation checks). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: `kinds.test.ts` (16) and `createShortcut-s8labels.test.ts` (8) of the package (they run `resolveStakeholderKinds` and `kindTypeNames`); `qa-c214-m3k-s87`, `qa-c214-m3k-s89`, `holderReference-m3k-r4/r5/r6` (the reference check, `createRecord`, the picker), `qa-c214-m3kt-s92`, `qa-c214-m3kt-s93` (their blocks for the kind reader need the recorded live answer, or the type-tree reader and the reference check); in the ported files the blocks that run the type-tree reader, `readStakeholderKindSet`, `stakeholderKindsOf`, `resolveFieldSets`, `resolvePredicates`, `createStakeholderVocabulary` or the tag fixture, and the one block of `kindReader-m3k-r3` that reads a second role through the tag fixture (`withTagStandard`); blocks that need only `vocabulary-source` are in that unit's copy of `masterTimeout-m3kt.test.ts`.
