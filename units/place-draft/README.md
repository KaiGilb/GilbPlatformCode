# place-draft

The address a person is filling in: its parts, the places picked into it, and the rules that move a pick through it.

## What this is

The address a person is filling in: its parts, the places picked into it, and the rules that move a pick through it. No React, no storage.

- `PlaceClaimDraft`: `{ label, streetLine, addressLine1, addressLine2, postalCode, place: { city, region, country }, cascaded: { city, region, country }, divergence }`. `cascaded` says which rungs a pick filled rather than the person; `divergence` is the notice that a pick landed at another rung than the box it was made in. `emptyDraft()` is the blank one.
- `cascadeFrom(draft, picked, boxRung)`: a pick at any rung fills the rungs above it. The rung is the ontology's, not the box's (New York typed in the City box lands in Region and fills Country), and the notice is recorded. A rung the person picked directly is never overwritten by a cascade; a rung an earlier cascade filled is replaced by the new pick's own. A rung the walk cannot reach stays as it was: a country is never guessed from a label. It reads the catalogue through `geo-catalogue` (GET only); a failed read rejects with that unit's error and gives back no half-filled draft.
- `draftToInput(draft)`: what the store is handed (`PlaceClaimInput` of `place-claims`): the five parts and the three places, without the cascade marks and the notice.
- `snapshotOf(draft)`, `draftChangedSince(latest, sent)`: the comparable shape of a draft (scalars, and a place by its id) and whether two drafts differ in it. A re-read hands back fresh objects, so a place is compared by id.
- `applyCarried(stored, { sent, latest })`: the stored address's draft with every part the person changed after `sent` taken from `latest`. A part the person left alone stays the store's.
- `PlaceSaveOutcome`: what a new address's save answers (the new address's id, `true`, `false` or `null`).

`clearFinerOnCountryChange` and `clearRung` (what a new country or an emptied box does to a draft) are `place-clear`'s; a draft of this unit is the shape they take, and a test runs them on it.

## What this is not

- Not the picker (`place-picker`) and not the card: this unit draws nothing.
- Not a writer: the store is handed the draft's input (`draftToInput`) by the caller.
- Not the origin setting (`geo-origin`): the catalogue's address is the host's setting.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-draft`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-draft` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/geo-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims <path-to-the-library>/units/place-draft
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing: no request but a `GET` through `geo-catalogue`, and no storage of its own (the device copy of rows is `geo-catalogue`'s).

## Requests and their servers

Through `geo-catalogue` only, and only in `cascadeFrom`: `GET <ontology origin>/base/t/GeoRegion/children` and `GET .../base/t/<Type>` (the kind of each grain, once), and `GET <row address>` up the picked place's `memberOf` chain until a country, a region and a city are found or the chain ends. The catalogue is never written, credentials are omitted, and an address outside it is not asked for.

## What the host must supply

The two origins, set once through `geo-origin` and `term-origin`, and `fetch`.

## Module state

None of its own (the grain map and the rows are `geo-catalogue`'s caches).

## Do not

- Do not read `cascaded` as "a pick of the person": it says which rungs a cascade filled.
- Do not save `divergence`: it is a notice about what the person just did, and `draftToInput` leaves it out.
- Do not write a country the cascade could not reach: leave the rung empty for the person.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the catalogue client is `geo-catalogue`, the input type and the text-slot table are `place-claims`'s.
2. `snapshotOf` and its type `FieldSnapshot` are exported (GilbApp kept them inside the card's file). Their code is GilbApp's.
3. The module comments are reworded with the same facts (no host, cycle or agent named). No code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/PlaceClaimsCard.tsx` lines 86-86 to `src/placeDraft.ts`, `src/components/mynet/PlaceClaimsCard.tsx` lines 106-152 to `src/placeDraft.ts`, `src/components/mynet/PlaceClaimsCard.tsx` lines 184-222 to `src/placeDraft.ts`, `src/components/mynet/PlaceClaimsCard.tsx` lines 255-289 to `src/placeDraft.ts`, `src/components/mynet/PlaceClaimsCard.tsx` lines 972-1005 to `src/placeDraft.ts`.

## Tests

`npx vitest run`, 46 tests in 4 files:

- `placeDraft.test.ts` 29 (new: GilbApp had no test of these functions apart from the card's, which reached them through the screen): the empty draft and the input's keys; the cascade (a city fills its country, New York in the City box lands in Region and says so, the same row in the Region box says nothing, an unclassified type is filed in the box's rung, a direct pick is never overwritten, a cascaded rung is replaced, an unreachable rung stays empty, the draft given is not changed, a failed walk rejects); `place-clear` on this draft; the snapshot and what counts as a change; what is carried and what is left to the store.
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes the file: across it, no request to the catalogue was anything but a `GET`.
