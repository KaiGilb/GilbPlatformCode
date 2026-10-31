# place-names

Reads the names of catalogue places, one answer per place: named, missing, or not read.

## What this is

Reads the names of catalogue places, one answer per place: named, missing, or not read.

A saved address stores pointers to catalogue places, never their names, so a surface that shows it must dereference them. A count is not a name. React hook and plain functions; every read is `geo-catalogue`'s (fenced to the catalogue, GET only).

- `readPlaceNames(ids)`: one answer per id, in order, every one started at once, never rejecting. `{ state: "named", place }` (read, and it has a name); `{ state: "missing" }` (the catalogue answered 404: an absence); `{ state: "failed", reason }` (not read: `unreachable`, `not-geo` for an address that is not the catalogue's, nothing was asked, or `unnamed` for a row that was read and has no name).
- `loadPlaceNames(ids)`: the shape the one card's host member takes, `Promise<GeoPlace[]>`. It **rejects** with `PlaceNamesNotReadError` (`failed`, the answers that failed) when any place FAILED, because a caller that compares addresses must never compare half of one. A `missing` place does not reject; it is left out, as it is gone.
- `usePlaceNames(ids)`: the hook. `null` while unresolved, `[]` for no ids, else one answer per id. A caller must not render "no places" while it is `null`.

## What this is not

- Not a writer: no function here creates, changes or removes anything.
- Not the origin settings (`geo-origin`, `term-origin`) and not a place list: no place or address is kept here.
- Not a view: what a surface says when something was not read is the view's (the answers here carry what it needs).

## How to take it

Package: `@kaigilb/gilbplatformcode-place-names`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-names` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/geo-origin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-names
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. Every request is a `GET`, and a test reads the source and fails on a write verb, a write function or a network call of its own.

## Requests and their servers

Through `geo-catalogue`: `GET <row address>` for each id (`credentials: "omit"`), every id started at once, a row already known costs none. A whole row is read (a country is 0.5 to 3.1 MB) because the catalogue offers no smaller read for a name. Nothing is written; an address outside the catalogue is not asked for.

## What the host must supply

The platform's settings that the peers read (`base-origin`, the sign-in seam) and, where it reads the catalogue or the ontology, the two origins (`geo-origin`, `term-origin`), set once at start-up. `fetch`.

## Module state

None of its own (the rows are `geo-catalogue`'s).

## Do not

- Do not show the places that read as the whole address when any place is `failed`.
- Do not render "no addresses" or "no places" while a read has not answered, or after it failed.
- Do not write the names it reads back into the vault: they are pointers' names, read each time.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the catalogue client is `geo-catalogue`.
2. **Per-place answers** (F6). GilbApp's `usePlaceNames` returned the named places only ("the caller is told by the shorter list"), which cannot tell a place that is gone from one that was not read. Now one answer per id: `named`, `missing`, `failed`. The hook returns `readonly PlaceRead[] | null`, not `GeoPlace[] | null`.
3. **`loadPlaceNames` rejects when a place failed** (F8). GilbApp resolved with the readable subset for both a 404 and a failure, so the one card's merge could compare a partial address. A row with no name counts as failed (GilbApp dropped it silently).
4. `placeLine` of the source is the unit `place-line`'s (equal).
5. The module header is reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/geo/usePlaceNames.ts` lines 1-66 to `src/placeNames.ts`.

## Tests

`npx vitest run`, 32 tests in 4 files:

- `placeNames.test.tsx` 15: GilbApp's `usePlaceNames.test.ts` (every id is started at once, ported; the second case, "drops one unresolvable id", is CHANGED on purpose: it now pins F6 and F8), the catalogue doubled at `fetch` with the real catalogue client in front (the source stubbed `getPlace`). New: F6 (named, missing, failed apart; a 404 is not a failure), F8 (a failed place rejects, a missing one does not; an outside address; a nameless row), the hook.
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes the file: across it, nothing but a `GET` went to the catalogue.
