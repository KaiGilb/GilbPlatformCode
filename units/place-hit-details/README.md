# place-hit-details

Says what a catalogue place is and where it is, for a list of same-named places.

## What this is

Says what a catalogue place is and where it is, for a list of same-named places.

"Oslo" is four rows in the catalogue: a municipality, a region, a municipality with no container, a township in another country. A picker that lists them needs a second line for each: what it IS (its kind, in the ontology's words) and WHERE it is (its container). The kind is free (the hit's own type); the container costs the parent's row, so the lookup is bounded and cached and degrades to the kind alone. React hook and component, no request of its own: every read goes through `geo-catalogue`.

- `describePlaceHits(places, { signal?, onUpdate? })`: for each place `{ id, kind, container, state, partial, position }`. `state`: `pending` (not read yet), `named`, `none-recorded` (the row records no parent), `unavailable` (a parent exists and was not read). At most `MAX_CONTAINER_HOPS` (2) containers, stopping at a country; at most `MAX_FRESH_PARENT_READS` (3) rows not yet known are read for one list; a parent row over `PARENT_ROW_CEILING_BYTES` (4 MiB) is not read; a container already known (this tab, or the device's copy) costs no read.
- `placeHitLine(detail)`: the second line: `municipality · in Norway`, `municipality · no containing place recorded`, `city · where: not read`, `city · in County L, State L · and further up: not read`, and, for a row still identical to others, `... · 1 of 2 with this name`.
- `usePlaceHitDetails(places)`: the hook; nothing is asked while the list is empty, a new list is looked up, an unmount stops the lookup.
- `PlaceHitMeta({ detail, fallback? })`: the line with the kind in strong type.

## What this is not

- Not the catalogue client (`geo-catalogue`) and not the origin setting (`geo-origin`).
- Not a place list: no place is kept here; a name is always the catalogue's or the role's own.
- Not a writer: the place is stored by the caller (the employment unit), never here.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-hit-details`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-hit-details` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/geo-origin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing: no request but a `GET` through `geo-catalogue`, and no storage of its own (the device copy of rows is `geo-catalogue`'s).

## Requests and their servers

Nothing of its own. Through `geo-catalogue`: `GET <row address>` for a container not yet known (at most 3 fresh rows for one list, each refused above 4 MiB), and the ontology's grain reads (once per tab). The catalogue is never written.

## What the host must supply

The two origins, set once through `geo-origin` and `term-origin`, and `fetch`. Styling: GilbApp's `var(--…)` tokens (`--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--bad`).

## Module state

None of its own.

## Do not

- Do not draw the stored address, or any part of it, as text or in an attribute a person reads (`aria-label`, `title`, `placeholder`, the input's value). `data-*` attributes are for tests.
- Do not treat a failed read as "no such place" or as "no place": say it.
- Do not pass a place address you did not get from the catalogue or from a stored role and expect it to be asked for: outside the catalogue it is refused.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the catalogue client is the unit `geo-catalogue`.
2. **`tail` is replaced by `position`** (name rule). GilbApp told two identical rows apart by the tail of the row's catalogue address ("entry osm-r-2775550"): an id drawn as text. A row still identical to others now carries `{ n, of }` and the line ends "1 of 2 with this name".
3. **A container that was not read says so** (F12). GilbApp drew the kind alone for `unavailable`, which cannot be told from a place with no container: now "where: not read"; and after a partial chain "and further up: not read".
4. The module headers and the comments that named hosts, a cycle or an agent are reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/geo/placeHitDetails.ts` lines 1-210 to `src/placeHitDetails.ts`, `src/lib/mynet/geo/usePlaceHitDetails.ts` lines 1-27 to `src/usePlaceHitDetails.ts`, `src/components/mynet/PlaceHitMeta.tsx` lines 1-21 to `src/PlaceHitMeta.tsx`.

## Tests

`npx vitest run`, 53 tests in 6 files:

- `placeHitDetails.s8cardlook.test.ts` 26: the 21 ported from GilbApp unchanged in their cases, except the two about the id tail (they pin the position), plus the F12 and name-rule cases (new).
- `PlaceHitMeta.test.tsx` 4, `usePlaceHitDetails.test.tsx` 3, `exports.test.ts` 2, `noNetwork.test.ts` 5 (new): the component's shape, the hook, the entry point, and that the source makes no request of its own.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.
- A world-level check closes the file: across it, no request to the catalogue was anything but a `GET`.
