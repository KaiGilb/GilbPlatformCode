# flag-choice

Chooses which country's flag a language shows, and where the flag file is.

## What this is

Chooses which country's flag a language shows, and where the flag file is.

A pure leaf for the flag of a language. It holds the rule that finds a country's flag file by the country's address (`flagFileId`, `ENTITY_ADDRESS`), the list of flags a language offers (`flagChoices`, `FLAG_SHORT_LIST_MAX`), the country's name from its ISO code (`countryNameFromCode`), the flag as an image address (`flagDataUrl`), and the rule the viewer's language row uses to pick the flag (`viewerFlagCountry`).

`viewerFlagCountry({ flagCountry, languageCountries })` answers: the claim's own `flagCountry` when it has one; else the one country when the language entry names exactly one; else `null`, which a view draws as the neutral globe (no country, or several). It never reads anything.

## What this is not

- Not a reader: it makes no request. `flag-source` reads the flag.
- Not a view: `flag-image` draws it.
- Not a country table: the unit holds no country, only the rule on an address.

## How to take it

Package: `@kaigilb/gilbplatformcode-flag-choice`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/flag-choice` prints:

```sh
npm install <path-to-the-library>/units/flag-choice
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. It is pure.

## Requests and their servers

None. It makes no request.

## Examples

```ts
import { flagChoices, flagFileId, viewerFlagCountry } from "@kaigilb/gilbplatformcode-flag-choice";

flagFileId("https://<host>/base/e/osm-r-2978650"); // "flag-osm-r-2978650"
flagChoices(entry.countries).defaultCountry; // the one country, else null
viewerFlagCountry({ flagCountry: claim.flagCountry, languageCountries: entry.countries }); // a country address, or null (the globe)
```

## What the host must supply

Nothing.

## Module state

None.

## Do not

- Do not read a country entity to name a country or to find its flag: it holds its polygon and is 0.5 to 3.1 MB. The flag file is found by the address rule and named by its ISO code.
- Do not draw a flag when `viewerFlagCountry` answers `null`: draw the globe.

## Wrong readings

- "Two countries show the first." They show the globe; the person's own choice (`flagCountry`) is what shows a flag for such a language.
- "A blank `flagCountry` is a choice." It is trimmed; blank means none.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`:

- `src/lib/mynet/languages/countryFlags.ts` lines 57-64 (`ENTITY_ADDRESS`, `flagFileId`) and 292-326 (`flagDataUrl`, `countryNameFromCode`, `FLAG_SHORT_LIST_MAX`, `FlagChoices`, `flagChoices`) to `src/flagChoice.ts`.

Named changes, and only these: `ENTITY_ADDRESS` is exported (the reader `flag-source` cuts the host from the same expression); the comments that name a cycle, a ticket or a ruling are reworded; the file header is new. New code: `viewerFlagCountry`. The comment-stripped declarations equal the source (0 diff each: `ENTITY_ADDRESS` 4 words, `flagFileId` 20, `flagDataUrl` 8, `countryNameFromCode` 58, `FLAG_SHORT_LIST_MAX` 4, `FlagChoices` 13, `flagChoices` 46).

## Tests

29 tests in 3 files (`npx vitest run`):

- `flagChoice.test.ts` 14: 8 ported from the source's `countryFlags.s8lang.test.ts` (the file id 2, how a flag is drawn and named 2, which flags a language offers 4), 6 new: the address rule, `viewerFlagCountry` (the claim's flag wins; exactly one country; none and two or more give `null`; agreement with `flagChoices`) and the cut of twelve.
- `exports.test.ts` 2: the seven exports and their arities.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.

Mutation checks: 8 mutants of `src/flagChoice.ts`, 8 killed.
