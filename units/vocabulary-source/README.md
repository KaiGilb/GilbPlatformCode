# vocabulary-source

Reading the GilbVeda master's term documents, each request and each whole reading bounded in time, so a master that does not answer is "not known yet" and never "nothing".

## What this is

Reading the GilbVeda master's term documents, each request and each whole reading bounded in time, so a master that does not answer is "not known yet" and never "nothing".

Plain functions and types, no React, no credential. The master's documents are public: this unit only reads them. Nothing about what a stakeholder is, or what a type or an attribute holds, is typed into it; it all comes out of the documents at run time.

- `masterSource({ vedaOrigin, fetchImpl?, carriers?, carrierPageSize?, pageSize?, maxPages?, timeoutMs? })`: the live master, as a `VocabularySource` with `termIri(path)`, `term(iri, signal?)`, `terms(iris, signal?)` (several type terms in one named read, at most `NAMED_READ_MAX` (100) names a request), `children(typeIri, signal?)` (the direct is-a children of a type) and `carriersOf(readKeys, signal?)` (every term document that carries a fact under a key). Every request is sent with `cache: "no-cache"` and ends within `timeoutMs`.
- `MASTER_REQUEST_TIMEOUT_MS` (10 s) and `MASTER_READ_CAP_MS` (20 s): the bound on one request and on one whole reading. `NAMED_READ_MAX`.
- `VocabularyUnavailableError`, `MasterTimeoutError` (its `ms` is the bound that ran out), `CarrierSelectorMissingError` (its `url`): the three ways a read is "not known yet".
- `withDeadline(work, { ms?, parents?, timeoutError, abortError })`, `boundSource(source, signal, stopped)`, `checkedBound(name, ms, fallback)`, `MAX_BOUND_MS` (2,147,483,647): ending a piece of work, or every read of a source, by a deadline or a parent signal; a bound is checked and never switched off.
- `spellingOfTermDoc(doc, fallbackTerm)`, `spellingFromBinding(term, token, deprecated)`, `bareForm(segment)`: a predicate's read keys and its one write key, from its own term document.
- `valuesUnder(doc, readKeys)`, `refsUnder(doc, readKeys)`, `textUnder(facts, readKeys)`, `nameOfIri(iri)`: the values, references (CURIEs expanded by the document's own `@context`), first text and bare name read out of a document.
- Types: `TermDoc`, `TermFetch`, `PredicateSpelling`, `VocabularySource`, `ChildEntry`, `ChildrenPage`, `CarrierList`, `MasterSourceOptions`, `DeadlineOptions`.

## What this is not

- Not the stakeholder kinds or their cache: the kind set, its words and the shared reader are `stakeholder-kinds`, which takes this unit as a peer.
- Not the whole of `gilb-stakeholders`' `terms.ts`, `deadline.ts` and `source.ts`: only the symbols the Plan-card readers reach. Not here: `encodingOf`, `typeAttributeOf`, `cardinalityOf` (terms.ts), the field-set and tag readers that use them, and the write side of the package.
- Not a writer: nothing here sends anything but a `GET`.
- Not a place for a host: the master's origin is an argument (`vedaOrigin`), never a default. The Plan card passes the term origin it already keeps (`termOrigin()` of `term-origin`); this unit does not import it, because the origin is an argument and not a setting.

## How to take it

Package: `@kaigilb/gilbplatformcode-vocabulary-source`

From a clone of this repository, install the unit's folder; no peer comes first:

```sh
npm install <path-to-the-library>/units/vocabulary-source
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { masterSource, MasterTimeoutError } from "@kaigilb/gilbplatformcode-vocabulary-source";

const master = masterSource({ vedaOrigin: "https://ontology.platform.example.test" });
try {
  const person = await master.term(master.termIri("t/Person"));
  const below = await master.children(master.termIri("t/Person"));
  if (!below.complete) console.warn("the master did not list every child: this is a floor");
} catch (e) {
  // MasterTimeoutError and VocabularyUnavailableError both mean "not known yet". Never show them as "nothing".
  if (e instanceof MasterTimeoutError) console.warn(`gave no answer in ${e.ms} ms`);
}
```

## What the host must supply

- The master's origin: `vedaOrigin`, a bare origin, to `masterSource`. In the Plan card this is `termOrigin()` from `term-origin`.
- Optionally `fetchImpl` (a `TermFetch`), when the app has its own HTTP stack or wants to test; the default is the global `fetch`. It is called with `{ cache: "no-cache", signal }` and must pass both on.
- Nothing else. No setting, no credential, no start-up call.

## Module state

None. The unit holds only constants.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not read a failure as "there is nothing". `VocabularyUnavailableError` (and its subclasses) says "I could not read the definition". An empty list built from one looks exactly like a person who has recorded no one.
- Do not walk the whole listing on a page load. `carriers: "walk"` is for an agent, a command-line run or a measurement: on 2026-09-30 the whole listing was about 237 MB.
- Do not give a bound of 0, a negative number, `NaN`, `Infinity` or more than `MAX_BOUND_MS`: each is refused with a `RangeError`. A bound is never read as "no bound".
- Do not leave `cache: "no-cache"` out of a custom `fetchImpl`: the master answers `cache-control: public, max-age=3600`, and a browser would answer a reload inside the hour from its own cache.

## Wrong readings

- "A master without the carrier selector gives the full list, slowly." It is refused: an answer that does not repeat `carries` as asked and carry a `carriesSpellings` list is a `CarrierSelectorMissingError` ("not known yet"). Only `carriers: "walk"` walks.
- "`complete` is true unless the master says false." Only an explicit `true` is complete. An absent flag is not evidence the list is whole.
- "A named read that fails is retried term by term." A refused or failed named read is read term by term; a named read that ran out of time is not: every term in it is the same `MasterTimeoutError`, so one silent request does not become one per term on a master that is not answering.
- "`boundSource` replaces the source's methods with its own." It calls the source's own methods, so a caller who replaced one (`{ ...masterSource(o), term: ... }`) keeps the replacement.
- "`textUnder` returns an empty string for a blank value." It skips blank and non-string values and returns `null` when none is left.
- "`refsUnder` expands every CURIE." A CURIE is expanded only by a prefix the document's own `@context` defines as an `http(s)` address; any other value is dropped.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `27fe0cef35857c070354c0439c6e4e4ebcc62815`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from the Plan card's host code in GilbApp at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which pins this package at that commit):

- `src/terms.ts` to `src/terms.ts`: lines 11-44, 58-142, 162-232 (`TermDoc`, `VocabularyUnavailableError`, `MasterTimeoutError`, `TermFetch`, `splitBinding`, `bareForm`, `PredicateSpelling`, `SELF_DESCRIPTION`, `firstString`, `spellingFromBinding`, `spellingOfTermDoc`, `valuesUnder`, `prefixesOf`, `refOf`, `refsUnder`, `textUnder`, `nameOfIri`);
- `src/deadline.ts` to `src/deadline.ts`: lines 15-148 (`MAX_BOUND_MS`, `checkedBound`, `DeadlineOptions`, `withDeadline`, `boundSource`);
- `src/source.ts` to `src/source.ts`: lines 6-360 (`ChildEntry`, `ChildrenPage`, `CarrierList`, `CarrierSelectorMissingError`, `VocabularySource`, `MASTER_REQUEST_TIMEOUT_MS`, `MASTER_READ_CAP_MS`, `MasterSourceOptions`, `NAMED_READ_MAX`, `NAMED_TYPE`, `checkBack`, `masterSource`).

Not taken: `encodingOf`, `typeAttributeOf` and `cardinalityOf` (`terms.ts` 144-158, not reached), and the file header comments (replaced by the short header comments of this unit).

**Merged units compared and taken or not (each reached symbol, comments stripped, whitespace collapsed; measured with a diff script, not by eye).**

- `units/photo-term` holds `splitBinding` and `bareForm` with bodies equal to these, but does not export them, so they cannot be imported: copied. Its `TermFetch` is `(url) => Promise<Response>`, where this unit's is `(url, init?) => Promise<Response>`: a false friend (the master read needs the `init`, for `cache` and `signal`); not taken.
- `units/project-levels` `refOf` is a different function (it takes one argument and parses JSON text); not taken.
- No other unit holds a reached symbol of these files.

Named changes, and only these:

1. the imports of the source's own files (`./terms.ts`, `./deadline.ts`, `./source.ts`) are the unit's own files without `.ts` (the host-agnostic check allows `./name` only); no import of another package is needed;
2. the header comment of each file is a new, shorter one, and comments that name a host, a person, an agent or a ticket are reworded; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, not shipped; the hosts are `example.test` hosts, and no test reaches a real host): ported from `gilb-stakeholders` `test/` at the same commit, by test block (a block that calls a symbol not in this unit is left out): `masterTimeout-m3kt.test.ts` 12 of 34, `fieldSetReadSpeed-22d.test.ts` 4 of 18, `qa-c214-m3kt-s92.test.ts` 3 of 31 (its wire block talks to a server on the loopback address of the test machine), `qa-c214-22c-r2.test.ts` 1 of 3. New: `terms.test.ts` (22), `deadline.test.ts` (24), `source.test.ts` (28), `vocabularySource.test.ts` (1: the export list). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: `carrierSelector-22c`, `qa-c214-22c`, `qa-c214-22d`, `qa-c214-22d-r2`, `lists` (they run `resolveFieldSets`, `createStakeholderVocabulary` or `readList`, which are not taken); `qa-c214-m3kt-s93` (it needs the 987 KB recorded live answer of the master, `fixtures/m3kt-s92/live-memo.json.gz`, and its blocks run the type-tree reader and the reference check, which are not taken); the other blocks of the four ported files (they run the kind reader, `resolveFieldSets`, `createRecord` or the reference writer; the kind-reader blocks are in `stakeholder-kinds`).
