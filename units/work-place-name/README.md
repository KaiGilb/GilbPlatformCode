# work-place-name

Draws a role's work place by its name, with what it is and where, or says plainly when the name is not known.

## What this is

Draws a role's work place by its name, with what it is and where, or says plainly when the name is not known.

`<WorkPlaceName placeId label />`: the read-only place of a role. The name is the role's own label, else the catalogue's; under it, what the place IS and where ("municipality · in Norway", `place-hit-details`). It is the content of the `renderPlaceName` slot of `employment-card`.

A place whose name is not known is said, never drawn as nothing and never as an address: "A place", and under it "That place is no longer in the catalogue." (404), "The name of this place could not be read right now." (the read failed) or "This place is not in the place catalogue this app uses, so its name cannot be read." (the address is not the catalogue's; nothing was asked). With no stored place it draws nothing.

## What this is not

- Not the catalogue client (`geo-catalogue`) and not the origin setting (`geo-origin`).
- Not a place list: no place is kept here; a name is always the catalogue's or the role's own.
- Not a writer: the place is stored by the caller (the employment unit), never here.

## How to take it

Package: `@kaigilb/gilbplatformcode-work-place-name`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/work-place-name` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/geo-origin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/work-place-name
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing: no request but a `GET` through `geo-catalogue`, and no storage of its own (the device copy of rows is `geo-catalogue`'s).

## Requests and their servers

Through `geo-catalogue` and `place-hit-details`: `GET <row address>` for the place (also when the role has a label, for the kind line), and the container rows of `place-hit-details`. The catalogue is never written; an address outside it is not asked for.

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

1. The imports: the catalogue client is `geo-catalogue`, the kind line is `place-hit-details`.
2. **A name that is not known is said** (F10). GilbApp's `PlaceName` swallowed a failed read (`.catch(() => undefined)`) and, with no label, drew nothing at all, so a stored place looked "not set". Now "A place" and a line that tells a 404, a failed read and an address outside the catalogue apart.
3. `PlaceName` and `NO_PLACE` of `EmploymentCard.tsx` are a unit of their own, named `WorkPlaceName` and exported (GilbApp: private to the card), because the card of this library draws the place only through a slot.
4. No other code changed; the `data-testid`s are GilbApp's.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/EmploymentCard.tsx` lines 98-132 to `src/WorkPlaceName.tsx`.

## Tests

`npx vitest run`, 27 tests in 4 files:

- `WorkPlaceName.test.tsx` 10: the name and the kind line (the place case of GilbApp's `EmploymentCard.s8cardlook` presentation test, ported), and F10 (new): a failed read, a 404 and an outside address each say their own sentence; "A place" while reading; a known label survives a failed read; a container not read is said; every request is an anonymous `GET`.
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes the file: across it, no request to the catalogue was anything but a `GET`.
