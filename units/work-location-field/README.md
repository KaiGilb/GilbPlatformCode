# work-location-field

The box where a role's work place is searched in the catalogue and chosen, showing each place by name.

## What this is

The box where a role's work place is searched in the catalogue and chosen, showing each place by name.

`<WorkLocationField placeId label onChange />`. The stored value is the place's address; what the box shows is only its name. A search of two letters or more lists up to eight places from the catalogue, each with what it is and where it is (`place-hit-details`); choosing one calls `onChange({ placeId, placeLabel })`; emptying the box calls `onChange({ placeId: "", placeLabel: "" })`. The box writes nothing itself: the caller stores the place.

A stored place whose name is not known is said, never drawn as an empty box and never as an address: "A place" in the box and, under it, "That place is no longer in the catalogue." (the catalogue answered 404), "The name of this place could not be read right now. It is still saved." (the read failed) or "This place is not in the place catalogue this app uses, so its name cannot be read. It is still saved." (the address is not the catalogue's, so nothing was asked). A search that could not check every match says "Could not check every match for ... This is not a statement that the place does not exist."; one that checked all of them says "No city, town, or municipality matches."

It is the content of the `renderWorkLocation` slot of `employment-card`.

## What this is not

- Not the catalogue client (`geo-catalogue`) and not the origin setting (`geo-origin`).
- Not a place list: no place is kept here; a name is always the catalogue's or the role's own.
- Not a writer: the place is stored by the caller (the employment unit), never here.

## How to take it

Package: `@kaigilb/gilbplatformcode-work-location-field`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/work-location-field` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/geo-origin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/work-location-field
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing: no request but a `GET` through `geo-catalogue`, and no storage of its own (the device copy of rows is `geo-catalogue`'s).

## Requests and their servers

Through `geo-catalogue` and `place-hit-details`: `GET <geo origin>/base/search?q=<text>&type=<kind>` and `GET <row address>` (up to eight rows per search, one after another, each whole), debounced 140 ms and aborted by the next key; `GET <row address>` for the stored place's name when the role carries no label. The catalogue is never written; an address outside it is not asked for.

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

1. The imports: the catalogue client is `geo-catalogue`, the second line of a row is `place-hit-details`.
2. **A stored place whose name is not known is said** (F9). GilbApp set the name to `""` for a failed read, a 404 and a row with no label alike, and the box was empty over a stored place. Now: "A place" in the box, and a line that tells the three apart; a 404 (`getPlace` answered `null`) is told from a failed read (it threw), and an address outside the catalogue (`reason: "not-geo"`) from both.
3. **A click keeps the name** (surprise 8). On focus GilbApp set the search text to `label`, which is `""` on a held role (the role is read with no label), so a click blanked the box over a stored place. Now the text is `label` or the name read from the catalogue.
4. **The place's address is not written as text** (name rule). GilbApp wrote `<p className="sr-only">{placeId}</p>` for assistive tech. Removed; what is said instead is why the box shows no name, when it does not.
5. **The search** is `searchPlacesInCountryDetailed(q, "city", null, 8, signal)` (GilbApp: `searchPlaces`): the same hits in the same order, and it also says whether the answer is the whole answer (F11). Under the list, "Showing the first matches. There are more than this search could check." when it is not.
6. The module header is reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/WorkLocationField.tsx` lines 1-154 to `src/WorkLocationField.tsx`.

## Tests

`npx vitest run`, 40 tests in 6 files:

- `WorkLocationField.s8cardlook.test.tsx` 3 and `.s8cityfix.test.tsx` 1: ported from GilbApp unchanged in their cases (the four Oslo rows told apart; the city first).
- `WorkLocationField.honest.test.tsx` 19 (new): the name is shown and kept on a click; no address, host or id tail is readable in any state (text, `aria-label`, `title`, `placeholder`, input value); a failed read, a 404 and an outside address each say their own sentence; a partial search is not "no match"; twins read by position; the choice and the clearing hand over exactly the values; every request to the catalogue is a `GET` with credentials omitted.
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes the file: across it, no request to the catalogue was anything but a `GET`.
