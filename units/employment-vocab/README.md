# employment-vocab

The ontology spellings an employment is read and written under, asked by term name.

## What this is

The ontology spellings an employment is read and written under, asked by term name.

One async function, `resolveEmploymentVocab(edgeKey)`, and the error it throws.

It asks the ontology master (through `term-slots`) for the spelling of eight attributes (`org`, `jobTitle`, `claimSlotKey`, `name`, `startDate`, `endDate`, `ongoing`, `workLocation`) and of the type `Employment`, and answers `{ employment, org, jobTitle, claimSlotKey, name, employmentType, employmentTypeQuery, startDate, endDate, ongoing, workLocation }`, each `a:`-prefixed as the master serves it (`employmentType` is the create form `t:Employment`, `employmentTypeQuery` the query form `Employment`). `employment`, the edge on the person's record, is not asked: it is the field key the caller found by term, given the `a:` prefix.

If the master does not answer any one term, the whole vocabulary is unavailable (`EmploymentVocabUnavailableError`, naming the missing terms): an employment is never written under a guessed key. The answer is cached for the session on success only; a failure is asked again next time. Callers that overlap share one ask.

Importing the unit registers `Employment` as a card-part type (`registerCardPartTypes` of `lws-vault-sets`), so an employment never shows as a row of a register grid; it registers the master's spelling too once that is known.

## What this is not

- Not the employer link spellings (`a:employer`, `a:employee`): those are `org-terms`, deliberately a separate gate, so a master that stops serving them stops the link only and never an employment save.
- Not a read or a write of an employment: that is `employment-store`.
- Not an enumeration of terms: no spelling is typed here.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-vocab`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-vocab` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-types <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/employment-vocab
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. (Importing it changes in-memory state of `lws-vault-sets`: the type is registered as a card part.)

## Requests and their servers

`GET <ontology origin>/base/a/<term>` for each of the eight attributes and `GET <ontology origin>/base/t/Employment`, nine small documents in parallel, through `term-slots`. Once per session on success; asked again after a failure.

## Examples

```ts
import { resolveEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";

const vocab = await resolveEmploymentVocab("employment"); // vocab.org === "a:org" on a master that names it so
```

## What the host must supply

The ontology origin, set once at start-up with `setTermOrigin` of `term-origin` (read by `term-slots`).

## Module state

One cached promise, cleared on failure; `__resetEmploymentVocab()` clears it (tests only). The set of card-part types in `lws-vault-sets` gains `Employment` at import.

## Do not

- Do not write an employment under a spelling this did not give.
- Do not catch the unavailable error and write with the term names.
- Do not call `__resetEmploymentVocab` in product code.

## Wrong readings

- "The vocabulary can be partial." It is all of it or an error.
- "`employment` is asked of the master." It is the key the card found by term.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/lib/mynet/employment/employmentVocab.ts` lines 25-99.

## Tests

24 tests in 5 files (`npx vitest run`): `employmentVocab.test.ts` 3 (ported from `employmentStore.c214e7.test.ts`, re-based), `employmentVocab.cache.test.ts` 7, `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 9 mutants of `src/employmentVocab.ts` (a failure cached, a success not cached, a missing term not refused, the edge key not prefixed, the type not registered at import or by the master's spelling, the query form, a guessed key, the wrong terms named), 9 killed.
