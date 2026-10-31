# use-place-claims

The state of a record's addresses on a card: what was read, whether it was all of it, and the acts that save, change and remove one.

## What this is

The state of a record's addresses on a card: what was read, whether it was all of it, and the acts that save, change and remove one.

`usePlaceClaims(vaultId, subject, principal?)`: `{ status, claims, reason, loading, busy, error, save, amend, remove, fieldLabels }`.

**The state is told apart** (so a card can say the true thing):

| `status` | Meaning | `claims` |
|---|---|---|
| `no-vault` | the vault that holds the record is not known; NOTHING was read (`NO_VAULT_SAYS`) | `[]` means unknown |
| `reading` | the first read has not answered | `[]` means not yet |
| `failed` | the read failed; `error` is `READ_FAILED_SAYS` | the last that were read, if any |
| `incomplete` | the read answered but was not the whole vault; `reason` is `capped` or `stalled` (`INCOMPLETE_SAYS`) | what was read |
| `ready` | the whole vault was read | `[]` means there are none |

The read is one read of the vault's addresses held in React Query under ONE key per vault, `placeClaimsKey(vaultId)` of `place-claims`, and the value under it is the whole `PlaceClaimsRead` (`{ claims, complete, reason? }`): the Address group and the one card's merge read through the same entry. It is shared by every person card in the vault, then narrowed to this record. A load uses a held read up to `PLACE_CLAIMS_STALE_MS`; every read-back after a write is fresh.

`save`, `amend` and `remove` resolve the truth only when the read-back proves it: `save` the new address's id (null otherwise), `amend` and `remove` true or false. A read-back that was not the whole vault, and does not hold the address, does not claim it was kept (or gone). A save that made the address and failed on one of its details resolves null, shows the address, and says `PARTIAL_SAVE_SAYS`.

**Every sentence is fixed** (F3, F15): no status code, server text, term path or address in a message a view may draw; the detail goes to `console.error`. The sentences are exported as `*_SAYS`: `READ_FAILED_SAYS` ("The addresses could not be read right now. This is not a statement that there are none."), `NO_VAULT_SAYS`, `INCOMPLETE_SAYS`, `SAVE_FAILED_SAYS` ("This address could not be saved right now."), `PARTIAL_SAVE_SAYS` ("The address was saved, but one of its details was not."), `CHANGE_FAILED_SAYS`, `REMOVE_FAILED_SAYS`, `CATALOGUE_READ_ONLY_SAYS`, `ORIGIN_UNKNOWN_SAYS` ("Addresses cannot be saved here: the place catalogue is not known."), `VOCAB_DOWN_SAYS`, the three not-signed-in sentences, and the six read-back sentences (`SAVE_NOT_CONFIRMED_SAYS`, `SAVE_NOT_KEPT_SAYS`, `CHANGE_NOT_CONFIRMED_SAYS`, `CHANGE_NOT_KEPT_SAYS`, `REMOVE_NOT_CONFIRMED_SAYS`, `REMOVE_NOT_DONE_SAYS`). A refusal of the write layer (an address that would be empty, an older shape, a detail that cannot be placed, a remove from a listing that was not whole) is told as its own fixed `sentence`; an address that is also about someone else as `SHARED_ADDRESS_MESSAGE`.

`factsSurvived(kept, input)`: the read-back test. It compares the label, EVERY free-text line the write named (street, Address 1, Address 2, Postal Code), and the bound places.

## What this is not

- Not the reading of addresses (`place-claims`) and not a view: what a card draws for each state is the card's.
- Not the origin settings (`geo-origin`, `term-origin`) and not a place list.
- Not a writer to the place catalogue: no code path of this library writes there.

## How to take it

Package: `@kaigilb/gilbplatformcode-use-place-claims`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/use-place-claims` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/geo-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims <path-to-the-library>/units/place-claim-write <path-to-the-library>/units/use-place-claims
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Addresses in the holder's vault only: `t:PlaceClaim` and `t:SelfAssertedFieldClaim` entities (create, merge patch, delete). Never the place catalogue; a write whose target URL is inside it throws before any request. Nothing is written to the device.

## Requests and their servers

None of its own. Through `place-claims`: the vault's two typed listings (`GET /lws/vault/<vault>/records?type=...&include=body`), once per page up to 50 each, shared per vault; through `place-claim-write`: the writes, only in the holder's vault. Nothing else.

## What the host must supply

The platform's settings the peers read (`base-origin`, the sign-in seam), the two origins (`geo-origin`, `term-origin`) set once at start-up, and `fetch`. A `QueryClientProvider` above the hook.

## Module state

The `QueryClient`'s entry under `placeClaimsKey(vaultId)`. No module state.

## Do not

- Do not call a write function with a vault or an entity address you did not get from the holder's own vault: if it is inside the catalogue it is refused, by design.
- Do not catch `GeoWriteRefusedError` and retry elsewhere.
- Do not show a failure's own text: use the fixed sentences.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the writes are `place-claim-write`, the reads `place-claims`, `boundPlaceIds`/`claimPlaceIds` `place-lines`, the vocabulary `place-vocab`.
2. **The state is told apart** (F1, F2, F4): `status` (`no-vault | reading | failed | incomplete | ready`) and `reason`. GilbApp had `claims`, `loading`, `busy`, `error`; `claims: []` with `error: null` meant 'no vault', 'not yet' and 'none' alike. `loading` is kept (`status === 'reading'`).
3. **One shape under `placeClaimsKey`:** the hook stores the whole `PlaceClaimsRead` (GilbApp stored the bare `PlaceClaim[]`). The one card's merge (a later batch) reads through it.
4. **Fixed sentences only** (F3, F15): GilbApp wrote `Could not read the addresses: <message>`, `Could not save this address: <message>`, `Could not save this change: <message>`, `Could not remove this address: <message>`, with the error's own text (a status, a server detail, a term path). Now a fixed sentence by kind; the detail is `console.error`.
5. **The partial save is said** (decision 12): `PARTIAL_SAVE_SAYS`, and the address is shown by a fresh read; GilbApp showed the field's own error.
6. **An incomplete read-back proves nothing** (F4): a save, change or remove whose read-back was not the whole vault, and which does not hold the address, is 'not confirmed', not 'kept' or 'gone'.
7. **Surprise 12:** `factsSurvived`'s comment said it compares 'only label/street/places'; its code also compares Address 1, Address 2 and the Postal Code. The comment now says what the code does. The code is unchanged.
8. `usePlaceClaims`'s MyNet-adaptation header and the comments that named a cycle or an agent are reworded with the same facts.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/place/usePlaceClaims.ts` lines 1-358 to `src/usePlaceClaims.ts`.

## Tests

`npx vitest run`, 49 tests in 3 files:

- `usePlaceClaims.test.tsx` 34: the five states, one test each (no-vault with no request; reading; failed with the fixed sentence and the detail logged; incomplete with the claims read; ready with [] meaning none); one shape under the key, and two cards sharing one read; save / amend / remove resolve the truth only on the read-back (ported in intent from GilbApp's `AddressRows.*` write cases at the level of the hook), including a store that accepts and does not keep, a failed read-back, an incomplete read-back, the partial save, the geo refusal, a legacy address, a shared address; no exported sentence and no sentence of a failed act contains `http`, `/base/`, a status or a term path; `factsSurvived` (every line, places, unnamed lines, trim).
- `exports.test.ts` 1; `hostAgnostic.test.ts` 13.
