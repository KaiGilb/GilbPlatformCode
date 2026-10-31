# geo-catalogue

Reads the shared place catalogue: search by kind of place, one place, the walk up to its country, and the ontology's map of which kind of place is a city, a region or a country.

## What this is

Reads the shared place catalogue: search by kind of place, one place, the walk up to its country, and the ontology's map of which kind of place is a city, a region or a country.

The client of the shared world catalogue (GilbGeo), with no React. The app owns no place data: a place is a row of the catalogue, and a value that names a place is that row's address. This unit asks the catalogue for rows and keeps nothing but a small copy of what it said.

- `searchPlaceIds(q, rung, signal?)`: the ids a search finds at one rung (`city`, `region`, `country`) and whether the answer is the whole answer (`incomplete`). `searchPlaces(q, rung, limit?, signal?)`: the same, each id read as a row and ranked for the box (`rankHitsForRung`: the box's own kind first, then the unclassified, then the rest).
- `searchPlacesInCountryDetailed(q, rung, countryId, limit?, signal?)`: the same restricted to one country, `{ hits, capped, unplaced }`. `capped` says the scan stopped early; `unplaced` (new) counts the candidates left out because no country could be reached from them. An empty `hits` with `capped` or `unplaced` above zero is not "no such place".
- `getPlace(id, signal?, { maxBytes? })`: one row as `{ id, label, type, memberOf }`, geometry dropped; `null` for a 404 (an absence); a thrown `GeoUnavailableError` for anything else (a failure). `peekPlace(id)`: what is known without asking. A row read once is kept for the tab and a small copy (label, type, parents) on the device for 30 days, 400 rows.
- `resolveAncestry(startId, signal?)`: walks `memberOf` up from a row to find its city, region and country, at most `MAX_MEMBER_OF_HOPS` (5) hops; a rung not reached is `null` and is never guessed.
- `resolveGeoGrains(signal?)`: the ontology's map (`byRung`, `rungOf`, `kindOf`, `unclassified`), read once per tab and asked again after a failure.
- `GeoUnavailableError` (with `status` and a new `reason`: `unreachable` or `not-geo`), `GeoRowTooLargeError`, `RUNG_GRAIN`, `RUNG_SEARCH_GRAINS`, `MAX_RESTRICTED_CANDIDATES` (24), `__resetGeoCache`, `__resetGeoGrainCache`, `__resetGeoMemoryOnly`.

## What this is not

- Not the origin settings: the catalogue's is `geo-origin`, the ontology's is `term-origin`; both are set by the app.
- Not a place list: no seed, no fallback, no offline copy of places. A catalogue that cannot answer gives a failed read, and the surface says so.
- Not a view, and not the place claims of a person (later units).
- Not a writer. See "What it writes".

## How to take it

Package: `@kaigilb/gilbplatformcode-geo-catalogue`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/geo-catalogue` prints:

```sh
npm install <path-to-the-library>/units/geo-origin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing to the catalogue, and nothing to any server. The only requests are `GET`. On the device it writes the small copy of the rows it read, in `localStorage` under `base:geo:lean-rows:v1` (label, type, parents; no geometry; 30 days; 400 rows; an empty label is never kept; a full or blocked store only means the next session reads the row again).

## Requests and their servers

| Request | Made by | Server |
|---|---|---|
| `GET <geo origin>/base/search?q=<text>&type=<kind>` (one per kind of the rung, in parallel; `credentials: "omit"`) | `searchPlaceIds`, so `searchPlaces` and `searchPlacesInCountryDetailed` | the catalogue |
| `GET <row address>` (the row, `credentials: "omit"`) | `getPlace`, so every search, the walk and the pinned search | the catalogue, and only an address inside it (the fence) |
| `GET <ontology origin>/base/t/GeoRegion/children` and `GET <ontology origin>/base/t/<kind>` for each child, one after another | `resolveGeoGrains`, once per tab | the ontology master (`termOrigin()`) |

A row is read whole (a country is 0.5 to 3.1 MB, geometry included); the catalogue offers no projection and no range read. The grain reads are small.

## The fence

Every read of the catalogue asks `isGeoUrl` (of `geo-origin`: the parsed origin of the address is exactly the catalogue's) before any request. For an address outside it: no request at all, and `getPlace` throws `GeoUnavailableError` with `reason: "not-geo"` (status `null`; a message that names no address); `peekPlace` answers `null`; `resolveAncestry` does not follow a parent that is outside. A view can tell the two failures apart with `error.reason`.

## Examples

```ts
import { setGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { getPlace, GeoUnavailableError } from "@kaigilb/gilbplatformcode-geo-catalogue";

setGeoOrigin("https://<your catalogue host>");
setTermOrigin("https://<your ontology host>");

try {
  const place = await getPlace("https://<your catalogue host>/base/e/osm-r-406091"); // { id, label, type, memberOf } or null
} catch (e) {
  if (e instanceof GeoUnavailableError && e.reason === "not-geo") {
    // an address that is not the catalogue's was handed in; nothing was asked
  }
}
```

## What the host must supply

`fetch` and, for the device copy, `localStorage` (neither is required: a missing `localStorage` keeps rows for the tab). The two origins, set once at start-up through `geo-origin` and `term-origin`.

## Module state

The rows of this tab (`placeCache`), the reads in flight, the device copy's in-memory image, the grain map's promise. One set for the page: install the unit once. `__resetGeoCache()` clears the rows, the reads in flight and the device copy; `__resetGeoGrainCache()` the grain map; `__resetGeoMemoryOnly()` the tab's memory only (a new tab).

## Do not

- Do not hand `getPlace` an address you did not get from the catalogue or from a stored claim and expect it to be fetched: outside the catalogue it is refused.
- Do not render an empty search as "no such place" without looking at `incomplete`, `capped` and `unplaced`.
- Do not catch a failed read and treat it as a 404: `null` is an absence, a throw is a failure.
- Do not keep your own list of places or of kinds of place: the kinds come from `resolveGeoGrains`.

## Wrong readings

- "`unplaced` counts the hits in other countries." It does not: those are dropped and not counted. It counts candidates from which no country could be reached.
- "A parent outside the catalogue ends the walk with an error." It does not: it is not followed and the rung above stays `null`.
- "`credentials: omit` also applies to the ontology reads." It does not: those are the source's plain `GET`s (the master is public and the browser sends no cookie across origins).

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in `src/geoCatalogue.ts`.

1. **The catalogue's origin** is `geoOrigin()` of `geo-origin`, read at each use (GilbApp: the constant `GEO_ORIGIN`, derived from a vault identity in its configuration). `GEO_ENTITY_PREFIX` and `isGeoEntityId` moved to `geo-origin`. Reason: a unit names no host.
2. **The ontology's origin** (`VEDA_BASE`) is `termOrigin()` (GilbApp: the constant for the GilbVeda master). The live setting is `https://veda.gilb.com` (Kai-Zen read it from the taking app's saved settings on 2026-10-31); an operator who points `ontologyOrigin` elsewhere gets that master's grains. Pinned by `ontologyOrigin.test.ts`: with `https://veda.gilb.com` the grain reads go to `https://veda.gilb.com/base/t/GeoRegion/children` and `https://veda.gilb.com/base/t/<kind>`, exactly, and to nothing else. Reason: the app sets the ontology's origin once for every ontology read (`term-slots` does the same).
3. **The fence.** `geoFetch`, `getPlace` and `peekPlace` refuse an address outside the catalogue (by parsed origin) with no request; `getPlace` throws `GeoUnavailableError` with the new `reason: "not-geo"`. GilbApp fetched whatever it was handed (`geoFetch(id)`), and `fullPlaceIri`/a stored claim can name any host. The smallest shape that fits GilbApp's return types: the failed-read outcome (a throw of the same class) with one added field.
4. **`credentials: "omit"`** on the catalogue's requests (GilbApp: the browser's default). The catalogue is public, so nothing of the person goes to it.
5. **The ontology reads have their own fetcher** (`vedaFetch`): GilbApp used one `geoFetch` for both. Same request as before.
6. **A row's own `@id`** is taken as the place's id only when it is inside the catalogue; otherwise the address the row was asked at stays (the id feeds later reads, such as the flag).
7. **`resolveAncestry`** does not follow a parent outside the catalogue (the fence would refuse it); GilbApp followed it with a request.
8. **`RestrictedSearch.unplaced`** (F13): the number of scanned candidates left out for want of a country. GilbApp dropped them without a word (its comment said the surface states the cost; the code counted nothing).
9. **Not taken:** `immediateParent` and `searchPlacesInCountry` (no caller in GilbApp's Address or work location). The module header and the comments that named hosts, a cycle or an agent are reworded with the same facts.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/geo/baseGeo.ts` lines 66-848 to `src/geoCatalogue.ts`, less lines 60-84 (`geo-origin`'s), `immediateParent` (677-697) and `searchPlacesInCountry` (839-848). The test double and `placeKinds.s8cityfix.test.ts` come from `src/lib/mynet/geo/geoCatalogueDouble.ts` and `placeKinds.s8cityfix.test.ts`.

## Tests

`npx vitest run`, 8 files:

- `placeKinds.s8cityfix.test.ts` 12: ported from GilbApp unchanged in its cases (the order of a City box's hits; `rankHitsForRung`).
- `restricted.test.ts` 12: the catalogue behaviours of GilbApp's `PlacePicker.cycle168.test.tsx` put at the function level (N6, NEW-2, the 502 on the deepest hop, the bounded walk), plus the F13 cases (new).
- `fence.test.ts` 46 (new): an address outside the catalogue (including a catalogue address inside a query, a fragment, a path, a sub-domain, a user name) makes no request and fails with `not-geo`; a catalogue row is one anonymous `GET`; every request to the catalogue in a search or a walk is a `GET` with `credentials: "omit"`.
- `ontologyOrigin.test.ts` 6 (new): where the grain map is read from; a failed read is asked again; one unreadable kind is listed and the rest stay.
- `getPlace.test.ts` 10 (new): the row's shape, the caches, the ceiling, the device copy.
- `readOnly.test.ts` 3 (new): the source names no method but `GET`, no write verb, and calls `fetch` in two places only.
- `exports.test.ts` 3 (new); `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.
- A world-level check closes every file that uses the test double: across the file, no request to the catalogue was anything but a `GET`.

Mutation checks are listed in the build handback: 14 mutants of `src/geoCatalogue.ts` and 3 of `geo-origin`'s test of an address. Two survive and are equivalent: the cycle guard in `resolveAncestry` (a repeated row is a cache hit and the hop bound ends the walk anyway) and the second fence in `geoFetch` (every address it is given is built from the catalogue's origin or already fenced by `getPlace`; it stays as a second line).
