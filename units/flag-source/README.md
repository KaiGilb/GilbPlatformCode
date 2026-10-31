# flag-source

Reads a country's flag from the geo catalogue once and keeps it on the device.

## What this is

Reads a country's flag from the geo catalogue once and keeps it on the device.

The reader of a country's flag, with no React. `readFlag(country)` answers the flag as `{ svg, code }` (the SVG text and the country's ISO code when the file entity names it), `null` when the country holds no flag (or the file is not a plain, whole, safe SVG), and keeps the answer: in memory for the session and, for a real flag, on the device (Cache Storage `gilb-flags-v1`, fresh for `FLAG_TTL_MS`, a week). A failed read is not an answer: it backs off (`FLAG_BACKOFF_MS` 60 s, doubled to `FLAG_BACKOFF_MAX_MS` 10 min) and the old flag, if any, is still returned.

The real source is `geoFlagSource({ fetchFn?, timeoutMs? })`. It makes two reads at the country's own host, anonymously: the flag file `<host>/files/flag-<local id>` and its small file entity `<host>/base/e/flag-<local id>` (for the ISO code). It never reads the country entity. A picture that is not served as an image, is cut short (`flagSvgIsComplete`), or is not safe (`flagSvgIsSafe`: a script, an event handler, an external reference) is refused. The source and the device store are seams (`setFlagSource`, `setFlagStore`) for a test or a host.

## What this is not

- Not a view: `flag-image` draws the flag and the globe.
- Not the choice of which country: `flag-choice` holds that rule.
- Not a reader of countries: it reads the two small flag files by the slug rule and never the country entity.

## How to take it

Package: `@kaigilb/gilbplatformcode-flag-source`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/flag-source` prints:

```sh
npm install <path-to-the-library>/units/flag-choice <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing to the catalogue. It writes to the device's Cache Storage (`gilb-flags-v1`) a flag it has read, and removes one the catalogue no longer holds. A device with no Cache Storage keeps the flag for the session.

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `GET <host>/files/flag-<local id>` (`Accept: image/svg+xml`, no credentials) | `geoFlagSource` | the host of the country's own address, anonymous |
| `GET <host>/base/e/flag-<local id>` (`Accept: application/ld+json, application/json`, no credentials) | `geoFlagSource`, in parallel; a failure here is swallowed and the flag still draws | the same host |

Both go through `language-fetch-pool` (at most eight at once, eight seconds each). The first is one SVG, capped at one million characters; the second is a few hundred bytes. A flag already kept is drawn with no request.

## Examples

```ts
import { readFlag } from "@kaigilb/gilbplatformcode-flag-source";

const flag = await readFlag("https://<host>/base/e/osm-r-2978650"); // { svg, code } or null
// null: draw the neutral globe
```

## What the host must supply

A `fetch` and, for the device keep, `caches` (Cache Storage). Neither is required: a missing `caches` keeps the flag for the session only.

## Module state

`source` (the reader), `store` (the device store), `known` (the answers of this session, by country address), `backoff` (per country). One set for the page: install the unit once. `__resetFlags()` clears `known` and `backoff`; `setFlagSource` and `setFlagStore` clear what they replace.

## Do not

- Do not read the country entity to name a country or to get its flag.
- Do not set the SVG as markup: draw it as an `<img>` data address (`flagDataUrl` of `flag-choice`).
- Do not treat a thrown read as "no flag": the flag is not held when it is `null`, and unknown when the read threw.

## Wrong readings

- "A failed read is remembered as no flag." It is not remembered; it backs off and the next ask after the wait tries again.
- "`null` is written to the device." "No flag" is kept for the session only.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/languages/countryFlags.ts` lines 30-56 and 65-291 to `src/flagSource.ts`. Lines 57-64 and 292-326 are `flag-choice`'s.

Named changes, and only these: the imports are `ENTITY_ADDRESS` and `flagFileId` from `flag-choice` and `FetchTimeoutError` and `pooledGet` from `language-fetch-pool`; the file header is new and the comments that name a cycle, an agent or a ruling are reworded; no code changed. Every declaration compares 0 against the source (comment-stripped, 26 declarations; `geoFlagSource` 214 words, `load` 131, `cacheStorageStore` 122, `readFlag` 61).

## Tests

49 tests in 7 files (`npx vitest run`):

- `flagSource.s8fix.test.ts` 18, `flagSource.s8lang.test.ts` 10, `flagSource.cacheStorage.test.ts` 5, `flagSource.defaultTimeout.test.ts` 1: 34 ported from the source's `countryFlags.*` tests (the other 8 of its 42 cases, on the file id, the drawing and the choice of flags, are in `flag-choice`). They run against geo-like fakes; no network.
- `exports.test.ts` 2 (new): the twelve exports and the times.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.

Mutation checks: 12 mutants of `src/flagSource.ts` (credentials, the 404 answer, the entity asked for, a script, a non-image, a cut picture, the expiry, the back-off, the device keep, the forgetting, a failed read kept, the ISO tag), 12 killed.
