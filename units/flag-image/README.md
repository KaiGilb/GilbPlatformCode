# flag-image

Draws a country's flag, or a neutral globe when there is none.

## What this is

Draws a country's flag, or a neutral globe when there is none.

Three exports. `FlagImage({ country, className? })` draws the flag of a country address as an `<img>` of the SVG's data address (so a picture can run no script), named "Flag of <country>" from the file's ISO code ("Flag" when it has none), and marked `data-testid="flag-image"`, `data-flag-state="flag"` and `data-flag-country`. With no country, while the flag is being read, when the country holds no flag, or when the read fails, it draws the neutral globe (`Globe`, `data-flag-state="globe"`), which is decoration and hidden from a screen reader. `useFlag(country)` is the hook under it: `undefined` while read, `null` when there is none, else the flag.

The read is `flag-source`'s (kept for the session and on the device); the name is `flag-choice`'s.

## What this is not

- Not a chooser of which country: pass the country (`viewerFlagCountry` of `flag-choice` decides it for a language).
- Not a reader of its own: it asks `flag-source`.
- Not a button: wrap it if it is to be pressed.

## How to take it

Package: `@kaigilb/gilbplatformcode-flag-image`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/flag-image` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/flag-choice <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing.

## Requests and their servers

None of its own. `flag-source` makes the two flag reads for a country it has not kept (see its README).

## Examples

```tsx
import { FlagImage } from "@kaigilb/gilbplatformcode-flag-image";

<FlagImage country={countryAddress} className="mt-1" />
```

## What the host must supply

React 19. Tailwind scanning this unit's `src` (the classes `size-5`, `h-4`, `w-[22px]`, `rounded-[2px]`, `border`). The CSS variable `--line` (the flag's border), which is optional.

## Module state

None of its own. The flag unit's caches are shared.

## Do not

- Do not set a flag's SVG as markup with `dangerouslySetInnerHTML`: the unit draws an `<img>` for that reason.
- Do not hide the flag when the globe shows: a language with no flag still has the globe.

## Wrong readings

- "The globe means an error." It means no flag is held, or none could be read; nothing else is said.
- "A flag appears at once." The globe shows until the read answers; a flag already kept is drawn at the next render.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/FlagImage.tsx` lines 14-67 (`useFlag`, `Globe`, `FlagImage`) to `src/FlagImage.tsx`.

Named changes, and only these: the imports are `countryNameFromCode` and `flagDataUrl` from `flag-choice` and `readFlag` and `CountryFlag` from `flag-source`; the file header is new and the comments that name a cycle, an agent or a ruling are reworded; no code changed. The three declarations compare 0 against the source (comment-stripped: `useFlag` 76 words, `Globe` 44, `FlagImage` 54).

## Tests

22 tests in 3 files (`npx vitest run`):

- `FlagImage.test.tsx` 8, all new (the source has no test of this component of its own): no country, a flag and its name, a flag with no code, the globe while read and when none, a failed read, the globe as decoration, a changed country, a late answer dropped.
- `exports.test.ts` 1 (new).
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.

Mutation checks: 8 mutants of `src/FlagImage.tsx`, 8 killed.
