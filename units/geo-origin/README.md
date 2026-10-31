# geo-origin

The one setting "which origin is the shared place catalogue", with the two tests every read of it uses: is this value a catalogue row, and is this address inside the catalogue.

## What this is

The one setting "which origin is the shared place catalogue", with the two tests every read of it uses: is this value a catalogue row, and is this address inside the catalogue.

The place catalogue (GilbGeo) is read by address. A shared unit must not name a host, so the app sets the origin once at start-up, as `term-origin` does for the ontology. Plain functions, no React, no network.

- `setGeoOrigin(origin)`: set the origin. Same rules as `setTermOrigin`: trimmed, parsed with `new URL(...)`, an `http:` or `https:` origin only (no path beyond `/`, no query, no fragment, no user name or password), stored as the URL standard's `origin`. Otherwise a `TypeError` whose message starts with `geo-origin:`, and the earlier origin stays.
- `geoOrigin()`: the origin that was set. If it was never set, it throws an `Error`: `geo-origin: call setGeoOrigin(<origin>) once at start-up`.
- `resetGeoOrigin()`: forget the origin (for tests).
- `isGeoEntityId(value)`: true when `value` is a string that starts with `<origin>/base/e/`. It says nothing about whether the row exists.
- `isGeoUrl(value)`: true when `value` parses as an absolute http(s) address with no user name or password whose origin is exactly the catalogue's. The test is on the parsed origin, never on the text, so `https://other.example/?u=<catalogue>/base/e/x`, `https://<catalogue host>@other.example/` and `https://<catalogue host>.other.example/` are outside. Every read of the catalogue asks this first and makes no request when the answer is false.

- `GeoWriteRefusedError(reason?)` (0.1.1): a write was refused because of the place catalogue. `reason` `"catalogue"` (default; "The place catalogue is read only, so nothing can be written to it.") or `"origin-unknown"` ("Addresses cannot be saved here: the place catalogue is not known.": the write could not be checked, and a guard that protects the catalogue fails closed). Fixed sentences, no address.

## What this is not

- Not a fetcher. It never asks the origin anything; it only keeps the text and tests addresses against it.
- Not a default. There is no built-in origin: every function that needs it throws until the app has set it.
- Not the ontology's origin (`term-origin`).

## How to take it

Package: `@kaigilb/gilbplatformcode-geo-origin`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/geo-origin
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. A unit that reads the catalogue lists this one under `peerDependencies`, never under `dependencies`.

## What it writes

Nothing. No request of any kind: the source holds no network call (a test reads the source and fails on a write verb or a method but `GET`).

## Examples

```ts
import { setGeoOrigin, geoOrigin, isGeoUrl } from "@kaigilb/gilbplatformcode-geo-origin";

setGeoOrigin("https://<your catalogue host>"); // once, at start-up
geoOrigin(); // "https://<your catalogue host>"
isGeoUrl("https://<your catalogue host>/base/e/osm-r-1"); // true
isGeoUrl("https://other.example/?u=https://<your catalogue host>/base/e/x"); // false
```

## What the host must supply

One call to `setGeoOrigin("https://<your catalogue host>")` at start-up, before any read. The provider of `stakeholder-card-hosts-gilbplatform` makes it from its `geoOrigin` prop.

## Module state

One value, the origin. An app must have ONE copy of this unit: install it once.

## Do not

- Do not call `setGeoOrigin` per render or per record: it changes what every read accepts.
- Do not test an address with `includes` or `startsWith` on the text: use `isGeoUrl`.
- Do not install a second copy: a unit that reads the origin would read a copy your `setGeoOrigin` never set, and throw.

## Wrong readings

- "`isGeoEntityId` fences the reads." It does not: it answers only for `<origin>/base/e/` values. The fence is `isGeoUrl`.
- "`isGeoUrl` says the place exists." It says the address is inside the catalogue, nothing more.

## Changes in 0.1.1

- New export `GeoWriteRefusedError`, so the units that fence their writes (`place-claim-write`) throw one error. Additive; `reason` is optional.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/geo/baseGeo.ts` lines 61-64 (the catalogue origin and the row prefix) and 82-84 (`isGeoEntityId`).

Named changes, and only these: the origin is a setting the app sets (`setGeoOrigin`) and not a constant derived from a vault identity in the app's configuration; `isGeoEntityId` reads it at each call; `isGeoUrl` and `resetGeoOrigin` are new (the first is the fence of `geo-catalogue`).

## Tests

A count is in the commit message of the build; run `npx vitest run`:

- `geoOrigin.test.ts`: the setting (ported in shape from `term-origin`'s test), `isGeoEntityId`, `isGeoUrl` (17 outside cases, including a catalogue address inside a query, inside a fragment, as a user name, and as a sub-domain).
- `readOnly.test.ts` (new): the source names no method but `GET`, no write verb, no network call.
- `hostAgnostic.test.ts`: the same host-agnostic check test as the other units.
