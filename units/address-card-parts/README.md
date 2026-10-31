# address-card-parts

The parts of one address on a card: a stored address as compact lines or an editor, its bound places by name, its text rows.

## What this is

The parts of one address on a card: a stored address as compact lines or an editor, its bound places by name, its text rows.

- `SavedAddress({ claim, busy, editMode, fieldLabels?, onAmend, onRemove, carried?, onCarried? })`: one stored address (a `PlaceClaim` of `place-claims`). Not being edited it shows its heading and its filled lines (`CompactAddress`); a tap opens every field, in the order Location / Street.. / Address 1 / Address 2 / Postal Code / City / Region/State / Country, with the same boxes a new address uses, and each leave of a box or pick of a place hands the whole draft to `onAmend(claim, draft)`. It does not write: the caller does, and answers `true`, `false` or throws. It fails closed: no box commits until every stored place was read, named and sorted into a rung, and the three boxes can hold what is stored (an address with two places at one rung, or a place of a kind it cannot sort, is read-only and says so). A change made while a save is in flight waits and is sent once; the add form's typing that arrived during the first save is applied once (`carried`).
- `CompactAddress`, `compactLines(draft)`: the filled lines (Street, Address 1, Address 2, "Postal Code City", "Region, Country"); the country line draws the country's flag (`flag-image`), the neutral globe while it is read or when the country has none.
- `BoundPlaceLine({ claim })`: the places the address binds, by name, coarse to fine, and what is not known about the others.
- `AddressTextRow`, `AddressLineRows`, `LINE_SLOTS`, `termWords`, `textFieldLabel`: a text box in the house row, the three address lines from the one table, the master's label for each.

**It says what it does not know.** A detail kept out of the address, a place not read, a place no longer in the catalogue, the kinds of place not read, a change that failed: each has its own sentence, and none is drawn as "nothing" or as another cause. No place's address or id tail is drawn as text.

## What this is not

- Not the card: the list of addresses, the add form, the group frame and the legacy text are the Address view's (a later batch).
- Not the picker (`place-picker`), the draft (`place-draft`) or the reading and writing of addresses (`place-claims`, `place-claim-write`, `use-place-claims`).
- Not a writer: it makes no request of its own; the catalogue is read through the units it uses, and a change goes out through the caller's `onAmend`.

## How to take it

Package: `@kaigilb/gilbplatformcode-address-card-parts`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/address-card-parts` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/flag-choice <path-to-the-library>/units/geo-origin <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/narrow-total <path-to-the-library>/units/place-clear <path-to-the-library>/units/place-line <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-types <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/role-label <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/place-names <path-to-the-library>/units/place-picker <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims <path-to-the-library>/units/place-draft <path-to-the-library>/units/address-card-parts
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. It hands the draft to `onAmend`; the caller stores it. No storage of its own (the device copy of rows is `geo-catalogue`'s, the device copy of flags is `flag-source`'s).

## Requests and their servers

None of its own. Through the units it uses: `GET <geo origin>/base/e/<id>` for each bound place's name (`place-names`, all started at once), the grain map from the ontology (`geo-catalogue`), a search and the kind and container of each hit while the editor is open (`place-picker`), and the country's flag files (`flag-image`, `GET <geo origin>/files/flag-<code>` and the file entity). The catalogue is never written; credentials are omitted.

## What the host must supply

The two origins, set once through `geo-origin` and `term-origin`, and `fetch`. A `CardModeProvider` above it when the card has modes (without one the address is always editable when `editMode` is true). Styling: GilbApp's `var(--...)` tokens.

## Module state

None of its own.

## Do not

- Do not draw a failure's own text: the parts do not, and an `onAmend` that wants a sentence shown must throw one that carries `name: "PlaceClaimRefusal"` and a `sentence`.
- Do not offer a change on an address whose places were not all read: the parts do not, and a host that bypasses them must not.
- Do not count the bound addresses to say how many places an address has: say which were not read.
- Do not add a place's address to a line; show the name.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the catalogue client is `geo-catalogue`; the names of the bound places are `place-names` (`usePlaceNames`); the draft and its rules are `place-draft` and `place-clear`; the picker is `place-picker`; the flag is `flag-image`; the shared pieces are `button`, `card-mode`, `remove-control`, `role-label`, `place-line`, `place-lines`, `place-claims`.
2. **A detail kept out of the address is said** (F5). GilbApp left it out and said nothing. `SavedAddress` draws "1 detail of this address is not shown (it belongs to someone else or could not be read)" ("N details ... are not shown (they belong to someone else or could not be read)") when the claim's `hiddenFieldCount` is above 0, in every mode.
3. **The bound places are told by state** (F6). GilbApp showed the places it could name as if they were all of them, and "N places bound, none reachable right now" when it could name none. `BoundPlaceLine` shows the names read, then "1 more place not read right now" for each place that was not read and "1 place no longer in the catalogue" for each the catalogue answered 404 for (without names: "2 places not read right now"). Never a count of the bound addresses, never the readable subset as if whole.
4. **Why an address cannot be changed is said by cause** (F7). GilbApp said "One of this address's places cannot be read right now" when the kinds of place (the grains) failed to read, when a place failed and when a place was gone. Now four sentences: still reading; "The kinds of place could not be read right now, so this address cannot be changed yet."; a place not read; a place no longer in the catalogue; and (unchanged) more places than the three boxes can show. A failed grain read is its own state (GilbApp set `null` for "not yet" and "failed").
5. **A change that fails says a sentence** (F15). GilbApp swallowed a thrown `onAmend` and drew nothing. Now: a thrown error whose `name` is `PlaceClaimRefusal` and which carries a `sentence` is shown as given; any other thrown error shows "That change could not be saved right now." and the cause goes to `console.error`. An answer of `false` is not told here (the card says it, from the section's error). The next change clears an older message.
6. **No address or id tail as text** (F14). The parts draw names; the country's id is only in `data-country-id`. A test scans every state.
7. The text rows, the address lines, the compact view, the flag and the (-) are GilbApp's, unchanged. `LINE_SLOTS`, `termWords`, `textFieldLabel`, `compactLines`, `AddressTextRow`, `AddressLineRows`, `CompactAddress`, `BoundPlaceLine` and `SavedAddress` are exported (GilbApp kept all but `compactLines` inside the card's file). The module comments are reworded with the same facts.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/PlaceClaimsCard.tsx` lines 155-171 and 1602-1620 to `src/addressLines.ts`, 379-494 to `src/AddressTextRows.tsx`, 1622-1666 to `src/CompactAddress.tsx`, 1669-1702 to `src/BoundPlaceLine.tsx`, 1022-1592 to `src/SavedAddress.tsx`.

## Tests

`npx vitest run`, 96 tests in 9 files:

- `AddressParts.flags.test.tsx` 17: `PlaceClaimsCard.flags.c214` (3) and 13 of 14 of `.flags.s130.agenttester` (the legacy-text case is the card's) over the stored address: the flag from the catalogue, the globe, no flag on a street line, anonymous reads, a 500 and a timeout, unsafe SVG, one read per country, the device copy, the layout, axe; and that nothing but GET reached the fixture.
- `AddressParts.view.test.tsx` 8: `PlaceClaimsCard.viewLayout.c214` (5) and 2 of 4 of `.s8cardlook`: compact lines only, a tap opens, each address its own headed block, the (-) and its guard, edit on a tap and Done.
- `SavedAddress.cycle168.test.tsx` 8: 7 of `PlacePicker.cycle168` that render a stored address (places by name, amendable in place, fail closed, more places than slots, an amend may leave no place and never nothing, blanking the Location) and 1 of `.s8cityfix` (`compactLines` and the country id).
- `AddressParts.honest.test.tsx` 23 (new): F5, F6 by state, F7 by cause, F12 in the editor's list, F14 in every state, F15, and that every request is a GET.
- `SavedAddress.edit.test.tsx` 11 and `AddressParts.pieces.test.tsx` 8 (new): the editor's commits and refusals, the queued edit, the draft following the store, the carried typing; the compact lines, the field names, the text row, the three lines.
- `exports.test.ts` 1, `noNetwork.test.ts` 7 (new: no network function and no write verb in the source); `hostAgnostic.test.ts` 13.
- Every file ends with the world's proof that no request to the catalogue was anything but a `GET`.
