# language-row

Draws one language by its name with its country flag, never by its address.

## What this is

Draws one language by its name with its country flag, never by its address.

One React component, `LanguageRow({ language, flagCountry?, className? })`. `language` is a language catalogue entry's address, as a card holds it (`a:languageUsed`). The row draws the country's flag (`flag-image`) and the entry's own name (`label`, read once through `language-entry`).

- The flag is `viewerFlagCountry`: the `flagCountry` the caller gives, else the entry's one country, else the neutral globe (no country, or several).
- While the entry is read: the globe and a quiet "…" (`LANGUAGE_READING_TEXT`). `data-language-state="reading"`.
- Read: the flag and the name. `"read"`.
- The read failed, or the entry has no name of its own: the globe and the words "A language" (`LANGUAGE_UNNAMED_TEXT`). `"failed"`. The row never shows the address, and never the last part of it.
- A value that is not an `http(s)` address (a language held as plain text) is shown as that text, with the globe, and nothing is read. `"text"`.

The online card has no `a:flagCountry`: a row of their card carries only the language's address. It uses the entry's one country, then the globe. A host that does hold the person's own flag for the language passes it as `flagCountry`.

## What this is not

- Not the languages section of a held card (add, remove, mark the contact language, choose a flag): that is a later unit.
- Not a link and not a button.
- Not a reader of countries: it asks for the two small flag files of a country it shows (see `flag-source`), never the country entity.
- Not the screen language: the name is the entry's own `label`.

## How to take it

Package: `@kaigilb/gilbplatformcode-language-row`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/language-row` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/flag-choice <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/language-row
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing. It makes only GET requests.

## Requests and their servers

None of its own. `language-entry` makes one GET of the entry (once per session per entry) and `flag-source` makes the two flag GETs of a country whose flag it shows and has not kept. With no country, or with several, no flag request is made.

## Examples

```tsx
import { LanguageRow } from "@kaigilb/gilbplatformcode-language-row";

<LanguageRow language={row.value} />
<LanguageRow language={claim.language} flagCountry={claim.flagCountry} />
```

## What the host must supply

React 19; Tailwind scanning this unit's `src` (`inline-flex`, `items-center`, `gap-2`) and the flag unit's. A `fetch`.

## Module state

None of its own. The entry reads and the flags are kept by `language-entry` and `flag-source`.

## Do not

- Do not draw `language` yourself as text: it is an address, and a row that shows an address is the defect this unit is for.
- Do not catch the failed state and show the address in its place.

## Wrong readings

- "The globe means the language has no flag." It also shows while the entry is read, when the read failed, and for a language in several countries.
- "`flagCountry` shows at once." It is used once the entry is read; before that the row is the globe.

## Where it came from

New code. The source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) draws a language only inside the languages section of a held card (`src/components/mynet/LanguagesCard.tsx`, which chooses the flag as `entry.flagCountry ?? flagChoices(info.countries).defaultCountry`, line 156), and draws the language of an online card's row as the raw address (`src/components/records/OneCardBody.tsx` lines 114 and 176). This unit copies no line of it. It is made of `flag-image`, `flag-choice` and `language-entry`.

## Tests

30 tests in 3 files (`npx vitest run`), all new:

- `LanguageRow.test.tsx` 15: the name once read; no state shows an address (reading, read, failed, an entry with no name); a text value; `languageNameOf`; the flag of an entry with one country; none and two countries give the globe and ask for no flag; the given country wins over two countries and over one; a country with no flag file; the globe while reading and on failure; only the entry and the two small flag files are ever asked for, never a country entity; only GET; two rows read the entry once.
- `exports.test.ts` 2.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.

They run against one fake that answers as the catalogue does; no network. Mutation checks: 12 mutants of `src/LanguageRow.tsx` (an address shown while reading, on failure and for an unnamed entry; the address tail as a name; the given country ignored; the entry's first country always; a flag beside "A language"; any text read as an entry; a country entity asked for; a write; a text value dropped; a blank label), 12 killed.
