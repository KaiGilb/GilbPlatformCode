# language-entry

Reads one language entry from the catalogue: its name, its code and the countries it names.

## What this is

Reads one language entry from the catalogue: its name, its code and the countries it names.

The read of a language catalogue entry (`t:HumanLanguage`) and the pure rules around it.

- `readLanguageEntry(uri, { signal?, timeoutMs? })` reads one entry at its own address (one GET, through `language-fetch-pool`, eight seconds), keeps the answer for the session and does not keep a failure. It answers `LanguageEntryInfo`: `{ uri, label, tag, code, countries }`, the entry's own name, the BCP-47 tag the browser makes from its ISO 639-3 code, the code, and the countries it names (`languageCountry`, de-duplicated, only addresses). A failed read throws `LanguageEntryError` with a plain message (not reached, answered 503, no answer in time).
- `languageEntryInfoOf(uri, doc)` is the pure half. A missing label falls back to the last part of the address.
- `useLanguageInfos(uris)` reads a list as the entries land: `infos`, `ready`, `failed` (the entries whose read failed) and `retry`.
- `iso6393CodeOf`, `contactLanguageTagFor`, `contactLanguageName`, `languageEntryReadUrl`, `primaryLanguageSubtag`, `sameLanguageTag`: the code, the tag, the name of a tag in the reader's language, the entry's address, and the primary-subtag comparison.

The name a card shows is the entry's own `label`. The screen language is not used (a library source for it does not exist yet).

## What this is not

- Not a search of the catalogue and not an ordering of a list: those are `language-search` and `language-order`, which are not in this unit.
- Not a flag: `flag-choice`, `flag-source` and `flag-image` do the flag.
- Not a writer: it reads.

## How to take it

Package: `@kaigilb/gilbplatformcode-language-entry`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/language-entry` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/language-entry
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `GET <the entry's own address>` (`Accept: application/ld+json, application/json`, 8 s) | `readLanguageEntry`, through `language-fetch-pool` | the host of the entry's address (the ontology catalogue), anonymous |

One GET per distinct entry per session; a failed read is asked again on the next ask. The answer is a small document (label, ISO code, country references).

## Examples

```ts
import { readLanguageEntry } from "@kaigilb/gilbplatformcode-language-entry";

const info = await readLanguageEntry(entryAddress); // { uri, label: "Norwegian", tag: "no", code: "nor", countries: [...] }
```

## What the host must supply

React 19 (for `useLanguageInfos`) and a `fetch`.

## Module state

`entries` (the reads of this session, by entry address). Install the unit once. `__resetLanguageEntries()` clears it, for tests.

## Do not

- Do not show `uri` as a name. `label` is the name; when the entry has no label it is the last part of the address, which is not a name either: a view that must never show it checks for that.
- Do not read a country in this unit: `countries` are addresses for `flag-choice` to use, not documents to fetch.

## Wrong readings

- "A failed read is shown as another language." It throws, and `useLanguageInfos` names it in `failed`.
- "`tag` is stored on the entry." It is made in the browser from `code`.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`:

- `src/lib/mynet/languages/contactLanguageTag.ts` lines 29-80 (`iso6393CodeOf`, `contactLanguageTagFor`, `contactLanguageName`) and 91-101 (`languageEntryReadUrl`) to `src/contactLanguageTag.ts`.
- `src/lib/mynet/languages/languageEntries.ts` lines 31-136 (`primaryLanguageSubtag`, `sameLanguageTag`, `LanguageEntryInfo`, `LanguageEntryError`, `textOf`, `refsOf`, `languageEntryInfoOf`, `__resetLanguageEntries`, `LANGUAGE_ENTRY_TIMEOUT_MS`, `readLanguageEntry`) to `src/languageEntries.ts`.
- `src/lib/mynet/languages/useLanguageInfos.ts` lines 16-61 to `src/useLanguageInfos.ts`.

Named changes, and only these: `FetchTimeoutError` and `pooledGet` come from `language-fetch-pool`; the import of `contactLanguageName` is dropped from `languageEntries.ts` (only the legacy search used it); the file headers are new and the comments that name a cycle, an agent, an app or a ruling are reworded; no code changed. Every declaration compares 0 against the source (comment-stripped, 15 declarations; `readLanguageEntry` 124 words, `iso6393CodeOf` 79) and `useLanguageInfos.ts` as a whole file compares 0 (161 words). Not taken: `ContactLanguageTagError`, `contactLanguageDisplay`, `contactLanguageTagOf` (a picker's read), and from `languageEntries.ts` the ordering and the legacy search (lines 138-244).

## Tests

41 tests in 6 files (`npx vitest run`):

- `languageEntries.s8lang.test.ts` 7 and `languageEntries.s8fix.test.ts` 6: 13 ported (of the source's 23 and 14: the rest are the list's ordering, the mark and the legacy cases, for `language-order` and `language-search`).
- `useLanguageInfos.test.tsx` 7: 5 ported (the `useLanguageInfos` block of the source's `useLanguageInfos.s8fix.test.tsx`; its 3 `useMarkIntent` cases belong to the held languages state) and 2 new (Try again clears the failed list at once; an answer for an entry that left the list is dropped).
- `contactLanguageTag.test.ts` 7: 5 ported (`contactLanguageTagFor` 3, `iso6393CodeOf` 2) and 2 new (`contactLanguageName`, `languageEntryReadUrl`). The `contactLanguageDisplay` cases (2) are for `language-order`; the `contactLanguageTagOf` cases (3) are not taken.
- `exports.test.ts` 1 (new).
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.

All run against fakes; no network. Mutation checks: 14 mutants of `src/languageEntries.ts`, `src/contactLanguageTag.ts` and `src/useLanguageInfos.ts`, 13 killed, 1 equivalent (the tag made from an upper-case code: `Intl.getCanonicalLocales` lower-cases it anyway).
