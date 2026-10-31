# place-vocab

Asks the ontology master how an address is spelled: the claim types, the attributes and the labels of the free-text lines.

## What this is

Asks the ontology master how an address is spelled: the claim types, the attributes and the labels of the free-text lines.

`resolvePlaceVocab()` answers `{ placeClaimLabel, streetLine, memberOf, claimSubject, claimPlace, detailOf, addressLine1, addressLine2, postalCode, termLabels, placeClaimType, placeClaimTypeQuery, fieldClaimType, fieldClaimTypeQuery }`: each attribute as `a:<spelling>` and each type as `t:<spelling>`, as the master spells them for the term's NAME (`term-slots`). Nothing is typed here: a term the master does not answer makes the whole vocabulary unavailable (`PlaceVocabUnavailableError`, whose `missing` lists the terms), and an address is never read or written under a guessed key. A label the master cannot give is only a missing label. The answer is kept for the page and asked again after a failure. Loading the module registers `PlaceClaim` and `SelfAssertedFieldClaim` as PARTS of a person card (kept out of the register's rows), by name and, once resolved, by the master's spelling.

## What this is not

- Not a writer: no function here creates, changes or removes anything.
- Not the origin settings (`geo-origin`, `term-origin`) and not a place list: no place or address is kept here.
- Not a view: what a surface says when something was not read is the view's (the answers here carry what it needs).

## How to take it

Package: `@kaigilb/gilbplatformcode-place-vocab`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-vocab` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-types <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. Every request is a `GET`, and a test reads the source and fails on a write verb, a write function or a network call of its own.

## Requests and their servers

Through `term-slots`: `GET <ontology origin>/base/a/<name>` for nine attributes and `GET <ontology origin>/base/t/<name>` for two types, once per page (the labels come from the attribute documents already read). Nothing else; this unit calls no network function itself.

## What the host must supply

The platform's settings that the peers read (`base-origin`, the sign-in seam) and, where it reads the catalogue or the ontology, the two origins (`geo-origin`, `term-origin`), set once at start-up. `fetch`.

## Module state

The vocabulary promise (kept on success, cleared on failure; `__resetPlaceVocab()` clears it) and the part-type registry of `lws-vault-sets`.

## Do not

- Do not read or write an address under a guessed spelling when the vocabulary is unavailable.
- Do not render "no addresses" or "no places" while a read has not answered, or after it failed.
- Do not write the names it reads back into the vault: they are pointers' names, read each time.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the master is `term-slots`, the part-type registry is `lws-vault-sets`.
2. `PlaceVocabUnavailableError` carries `missing`, the terms that were not answered (new). Its message names term paths, which are technical ids: a view says a fixed sentence and keeps this for the log (F3).
3. The module header is reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/place/placeVocab.ts` lines 1-132 to `src/placeVocab.ts`.

## Tests

`npx vitest run`, 26 tests in 4 files:

- `placeVocab.test.ts` 9: the master's spellings and labels, and a label that cannot be given is only a missing label (both ported from GilbApp's `placeAddressLines.c214` and `placePostalCode.c214`, the master doubled at `term-slots` as the source doubled it at its own module); every spelling comes from the master's answer; one missing term makes it unavailable and `missing` lists them; a failure is not kept, a success is; the part types are registered; the number of questions asked (new).
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
