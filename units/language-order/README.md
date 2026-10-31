# language-order

The rules of a person's language list: which language the contact-language tag marks, the list with the marked one first, what moving the mark writes.

## What this is

The rules of a person's language list: which language the contact-language tag marks, the list with the marked one first, what moving the mark writes.

Pure functions, no store, no screen, no request.

- `markedIndex(infos, contactTag)`: which listed entry the stored contact language marks, or -1. The first entry whose tag or whose own three-letter code EQUALS the stored value (case aside); else the first with the same primary subtag (`pt-BR` marks Portuguese).
- `orderLanguages(list, infos, contactTag)`: the list with the marked entry first, the others in the order given, at most one mark, and `legacyTag`: the stored value when no listed entry matches it (shown as the marked row, never dropped). An entry whose read failed is listed unmarked.
- `contactTagForMark(info, access, others)`: what moving the mark writes: the entry's tag, or its own three-letter code when ANOTHER listed entry shares the tag's primary subtag (so the mark names this entry and no other); `null` for an entry with no tag.
- `legacyListingAccess(access)`: the rung a legacy value takes when listed: the one it had, `private` when it cannot be told.
- `contactLanguageDisplay(value, locales?)`: a stored tag as "Norwegian (no)", or the value as stored when the browser cannot name it.

## What this is not

- Not a reader of entries: `language-entry` reads them and this unit takes what it read.
- Not a search of the catalogue: that is `language-search`.
- Not a writer: it computes the tag to write; the caller writes it.

## How to take it

Package: `@kaigilb/gilbplatformcode-language-order`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/language-order` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-order
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing.

## Requests and their servers

None.

## Examples

```ts
import { orderLanguages, contactTagForMark } from "@kaigilb/gilbplatformcode-language-order";

const { views, legacyTag } = orderLanguages(list, infos, contactTag);
const mark = contactTagForMark(views[1].info, null, views.map((v) => v.info));
```

## What the host must supply

Nothing.

## Module state

None.

## Do not

- Do not drop, hide or rewrite a stored contact language that matches no entry: `legacyTag` is how it stays visible.
- Do not widen a legacy value's rung when listing it.

## Wrong readings

- "`contactTagForMark` always returns the entry's tag." It returns the entry's three-letter code when another listed entry shares the primary subtag.
- "Two entries can both be marked." The contact language is one tag; there is one mark.

## Where it came from

Ported without change from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): the types and rules in `src/lib/mynet/languages/languageEntries.ts` lines 138-220 and `contactLanguageDisplay` in `contactLanguageTag.ts` lines 82-90. Compared with the comments stripped: 0 differing lines. Only the imports and a new header comment differ.

## Tests

36 tests in 3 files (`npx vitest run`): `languageOrder.test.ts` 22 ported (the marked entry first 7, moving the mark 3, the legacy rung 2, the rules of the mark 8, `contactLanguageDisplay` 2), `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 11 mutants of `src/languageOrder.ts` (the code match dropped, the primary-subtag rule dropped, a blank tag marking, the mark not moved first, the legacy tag dropped, the code never written, the code always written, an untagged entry markable, an unknown rung public, an unnameable value hidden, the entry itself counted as sharing), 11 killed.
