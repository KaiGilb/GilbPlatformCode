# place-picker

The box where a place is searched in the catalogue and chosen, one rung at a time: city, region or country.

## What this is

The box where a place is searched in the catalogue and chosen, one rung at a time: city, region or country.

`<PlacePicker rung label value onPick onClear restrictToCountryId? filledByCascade? foundInBoxLabel? pickLandedElsewhere? rungPill? disabled? />`. Nothing is typeable into it as a value: a search of two letters or more lists up to eight places from the catalogue (`geo-catalogue`), each with its kind and where it is (`place-hit-details`) and, when it will land in another field, a line that says so before the pick; choosing one calls `onPick(place)` and the box waits for that to finish before it clears itself. A bound value shows its name; a tap opens it for edit with the text selected (it is not wiped); emptying the box clears it; Escape or leaving the box unchanged keeps it. `RUNG_LABEL` is the word of each rung ("City", "Region", "Country") and `PLACE_SEARCH_*` are the debounce (140 ms), the minimum (1), the listing (2) and the cap (8).

**It says what it does not know.** The box has a state for each of idle, keep typing, searching, the list, nothing, and a failure, and never draws one as another:

- An answer that was cut short or left matches out is not "no match". Empty and cut short: "Could not check every match for ... This is not a statement that the place does not exist." Empty and some matches had no country found: "Some matches could not be placed in a country, so they are not listed." plus the same sentence. Listed, and more than could be checked: "Showing the first matches ... Type more to narrow." Listed, and some left out: "Some matches could not be placed in a country, so they are not listed." Only a complete answer with nothing in it says "No city matches ...".
- A search that fails, or that the fence refuses (the catalogue's address is not set), says "The place catalogue could not be searched right now. This is not a statement that the place does not exist." The cause goes to `console.error`.
- A pick that fails says the catalogue's own sentence when the catalogue could not be reached ("The place catalogue could not be reached, so places cannot be looked up right now. ..."), and "That place could not be added right now." for any other failure; the cause goes to `console.error`. The query and the rows stay.
- No place's address, id tail or host is drawn: not as text, not in `aria-label`, `title`, `placeholder` or the input's value. The place's address is only in `data-place-id` on the bound value, for the host's own use (a flag is drawn from it).

## What this is not

- Not the catalogue client (`geo-catalogue`) and not the origin setting (`geo-origin`).
- Not a draft: the pick's cascade and the notice that a pick landed at another rung are `place-draft`'s; this box draws the notices it is given.
- Not an access control: the rung pill is a slot, never a level this box reads or writes.
- Not wired to the language chooser: `flag-chooser` has no country search yet (a later, separate change).

## How to take it

Package: `@kaigilb/gilbplatformcode-place-picker`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-picker` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/geo-origin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/place-picker
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing: no request but a `GET` through `geo-catalogue` and `place-hit-details`, and no storage of its own.

## Requests and their servers

Through `geo-catalogue` and `place-hit-details`: `GET <geo origin>/base/search?q=<text>&type=<kind>` (one per grain the rung searches, debounced 140 ms and aborted by the next key), `GET <ontology origin>/base/t/...` (the grain map, once), `GET <row address>` for each hit's kind and container (bounded: two hops, each parent read once) and, when a country is chosen, the ancestry of each candidate (up to the candidate ceiling). The catalogue is never written; credentials are omitted; an address outside it is not asked for.

## What the host must supply

The two origins, set once through `geo-origin` and `term-origin`, and `fetch`. Styling: GilbApp's `var(--...)` tokens (`--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface`, `--sel`, `--surface-sunken`, `--bad`, `--serif`).

## Module state

None of its own (the grain map and the rows are `geo-catalogue`'s caches).

## Do not

- Do not draw a failure's own text: the box does not, and a host that wraps it must not either.
- Do not treat a list that says it was cut short, or that left matches out, as the whole answer.
- Do not give `onPick` a function that throws a sentence meant for the person: only the catalogue's own error is shown; anything else becomes "That place could not be added right now."
- Do not add a place's address to the row's text; show the name.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the catalogue client is `geo-catalogue`, the second line of a row is `place-hit-details` (`usePlaceHitDetails`, `PlaceHitMeta`).
2. **A partial answer is not 'no match'** (F13). The search is `searchPlacesInCountryDetailed` as before; GilbApp used `capped` only. Now `unplaced` (matches with no country found while a country is chosen) travels with the answer too: empty and `unplaced > 0` says "Some matches could not be placed in a country, so they are not listed." and is never "No city matches"; a list with `unplaced > 0` says it under the list.
3. **A failed search says one fixed sentence** (F15). GilbApp drew the catalogue's message or `String(e)`. Now "The place catalogue could not be searched right now. This is not a statement that the place does not exist." for any failure, including the fence's refusal; the cause goes to `console.error`.
4. **A failed pick** (F15). GilbApp drew the catalogue's message or `String(e)`. Now the catalogue's own sentence (it names no address) or "That place could not be added right now."; the cause of the second goes to `console.error`.
5. **No address or id tail as text** (F14). The second line of a row is `place-hit-details`'s, which says a position ("1 of 2 with this name") where GilbApp wrote `entry <end of the address>`. The box itself wrote no address as text; `data-place-id` stays.
6. `RUNG_LABEL` says "Region", as GilbApp's picker did; `place-display` (the read-only address line) says "Region/State".
7. The module header and the comments that named a cycle, an agent or a person are reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/PlacePicker.tsx` lines 1-581 to `src/PlacePicker.tsx`.

## Tests

`npx vitest run`, 79 tests in 8 files:

- `PlacePicker.cycle168.test.tsx` 17 of GilbApp's 30 (the other 13 render the whole address card and go with the card parts and the Address view): the listbox owns options only (axe clean), a cut-short empty answer is not "no match", the country clause is conditional, the row says where it will land, a pick that lands at another rung is said in both places (over `test/AddressBoxes.tsx`, the card's three boxes with `place-draft` and `place-clear`), a failed commit is said and not an untouched form.
- `PlacePicker.n6.test.tsx` 7, `.s8cardlook.test.tsx` 6, `.s8cityfix.test.tsx` 6 of 8 (the other 2 render the address card): changing a bound city by keyboard and pointer, the four Oslo rows told apart, the city first.
- `PlacePicker.honest.test.tsx` 24 (new): F13 (unplaced, cut short, complete), F14 (no address or id tail readable in any state), F15 (a 502, a throw, the fence), the pick awaited (M28), an older search aborted (M29), the states in words, and the box as a control (the pause before a search, a change of country, the access pill, Escape, `aria-expanded`, leaving the box during a pick).
- `exports.test.ts` 3, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes every file: across it, no request to the catalogue was anything but a `GET`.
