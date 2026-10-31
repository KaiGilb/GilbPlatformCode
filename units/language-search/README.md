# language-search

Searches the catalogue's human languages by name, and finds the one entry for a stored language tag.

## What this is

Searches the catalogue's human languages by name, and finds the one entry for a stored language tag.

- `searchLanguagesRemote(q, { signal?, cursor? })`: one anonymous GET of the ontology catalogue's search, `type=HumanLanguage`, `match=prefix`, `vault=<origin>/base`. It answers `{ hits: [{ entity, label }], next }`. A hit whose address is not a language entry on the catalogue origin, a term address (`/base/t/`) and a hit with no name are dropped. A refusing catalogue throws `LanguageSearchError` with its status.
- `languageEntityPattern()`: the shape of a language entry's address on the ontology origin, built from `termOrigin()` at the moment it is called (not when the file loads). A held language claim uses it to refuse an address from any other origin.
- `findEntryForLegacyTag(tag, { signal? })`: the catalogue entry for a stored contact-language tag: search by the browser's name for the tag's language, read up to 12 hits, keep those whose tag has the same primary subtag. Exactly one is the answer; none or several is `null` (it does not guess).
- `LANGUAGE_SEARCH_DEBOUNCE_MS` 140, `LANGUAGE_SEARCH_MIN_CHARS` 1, `LANGUAGE_SEARCH_LIST_CHARS` 2.

## What this is not

- Not the skill search: that drops every hit whose type is not a `/base/t/` name, which would drop every language.
- Not a reader of one entry: `language-entry` reads it.
- Not a picker: `language-section` draws the picker on top of this.

## How to take it

Package: `@kaigilb/gilbplatformcode-language-search`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/language-search` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/language-entry <path-to-the-library>/units/term-origin <path-to-the-library>/units/language-search
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `GET <origin>/base/search?q&match=prefix&vault=<origin>/base&type=HumanLanguage[&cursor]` (`Accept: application/json`, no credentials) | `searchLanguagesRemote`, and `findEntryForLegacyTag` through it | the ontology origin the host set (`setTermOrigin`), anonymous |

`findEntryForLegacyTag` also reads up to 12 entries through `language-entry`. Nothing is cached here.

## Examples

```ts
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { searchLanguagesRemote, languageEntityPattern } from "@kaigilb/gilbplatformcode-language-search";

setTermOrigin(ontologyOrigin); // once, at start-up
const page = await searchLanguagesRemote("norw"); // { hits: [{ entity, label }], next }
languageEntityPattern().test(page.hits[0].entity); // true
```

## What the host must supply

`setTermOrigin(<ontology origin>)` once at start-up (unit `term-origin`); a `fetch`. Without an origin every call throws before any request.

## Module state

None of its own (`term-origin` holds the origin; `language-entry` keeps the entries it read).

## Do not

- Do not keep `languageEntityPattern()` in a constant: it follows the origin the host set, and a constant made early would accept the wrong host.
- Do not store a `/base/t/` address or a name as a language: the entry address is what is stored.
- Do not make the search with credentials.

## Wrong readings

- "The pattern accepts any `/base/e/` address." It accepts an entry on the term origin only; the same path on another origin is refused.
- "`findEntryForLegacyTag` picks the best match." It answers only when exactly one entry fits.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/lib/mynet/languages/searchLanguagesRemote.ts` and `findEntryForLegacyTag` with `LEGACY_LOOKUP_MAX` of `languageEntries.ts` lines 222-244. Compared with the comments stripped: every symbol equal except `searchLanguagesRemote`, which differs in 7 lines (the three named changes below).

## Tests

34 tests in 3 files (`npx vitest run`): `languageSearch.test.ts` 20 (7 ported: `searchLanguagesRemote` 3 and the legacy lookup 4; 13 new: the pattern read at call time and its refusals 6, the request 6, the lookup's 12-hit bound 1), `exports.test.ts` 1, `hostAgnostic.test.ts` 13. They run against fakes; no network.

Mutation checks: 12 mutants of `src/languageSearch.ts` (the origin check dropped, the origin fixed at the first call, either end of the address not anchored, hits not filtered, the type not sent, a wrong vault, an empty text searching, the lookup guessing, reading every hit, a term address offered, a failed search not an error), 12 killed.
