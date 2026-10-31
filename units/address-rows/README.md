# address-rows

A person record's Address section: reads the addresses, shows them as a card group, and saves, changes and removes them in the holder's vault.

## What this is

A person record's Address section: reads the addresses, shows them as a card group, and saves, changes and removes them in the holder's vault.

`<AddressRows title legacyText vaultId recordEntityUri principal canEdit vaultName? />`: `usePlaceClaims(vaultId, recordEntityUri, principal)` of `use-place-claims` wired to `PlaceClaimsCard` of `place-claims-card`, as GilbApp wires them. Each address is its own `t:PlaceClaim` (with one `t:SelfAssertedFieldClaim` per field) in the vault that holds the record, `a:claimSubject` the record; the record itself is not touched.

- `vaultId` is the vault that HOLDS THE RECORD, never the viewer's. With none (`null`) nothing is asked and the group says so.
- `editMode = canEdit && !!vaultId && !present` (present: the card is in presentation); `addInPlace = canEdit && !!vaultId` ("+ Add your own" on the one card).
- The state of the read is handed on (`status`, `reason`, `vaultName`): no vault, reading, failed, incomplete and ready are each told in words by the card.
- "Add" is withheld while no read of this vault has answered and the last one failed. Once a read has answered, a later failed re-read keeps the addresses it has and the add; the error says the latest read failed.

## What this is not

- Not the card (`place-claims-card`), the hook (`use-place-claims`) or the writer (`place-claim-write`).
- Not an owner-home address: GilbApp's `ownerHome` lock and its line are not taken (the held card has none).
- Not a gate on who may write: `canEdit` is the card's, and the platform's grants decide in the end.

## How to take it

Package: `@kaigilb/gilbplatformcode-address-rows`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/address-rows` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/flag-choice <path-to-the-library>/units/geo-origin <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/place-clear <path-to-the-library>/units/place-line <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/role-label <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/place-names <path-to-the-library>/units/place-picker <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims <path-to-the-library>/units/place-claim-write <path-to-the-library>/units/place-draft <path-to-the-library>/units/address-card-parts <path-to-the-library>/units/use-place-claims <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/place-claims-card <path-to-the-library>/units/address-rows
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Through `use-place-claims`: in the holder's vault only, one request per fact (`POST` the address and each of its fields, `PATCH` a field that changed, `DELETE` the parts of a removed address). Never the place catalogue. Nothing is written on open.

## Requests and their servers

Through `use-place-claims` and `place-claims-card`: the vault's two typed listings (`GET /lws/vault/<vault>/records?type=...`), shared with the one card's merge; the catalogue's reads (`GET` only); the writes above.

## What the host must supply

The platform's settings that the peers read (`base-origin`, the sign-in seam), the two origins (`geo-origin`, `term-origin`), `fetch`, and a `QueryClientProvider` above it.

## Module state

The `QueryClient`'s entry under `placeClaimsKey(vaultId)` (the whole `PlaceClaimsRead`). No module state.

## Do not

- Do not pass the viewer's vault as `vaultId`: it is the record's.
- Do not offer an address to be added on the strength of an unread vault.
- Do not write to the place catalogue: no code path of this unit does, and `place-claim-write` refuses before any request.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: `place-claims-card`, `use-place-claims`, `place-draft` (`draftToInput`), `card-mode`.
2. `ownerHome` is not taken (GilbApp B3: the section was read-only with one line when the address was written as the vault owner's own). The held card has no owner-home address. `locked` and the owner-home line go with it; `editMode` and `addInPlace` drop `!ownerHome`.
3. **What the read came to is handed to the card** (F1-F4): `readState` and `canAdd`. New optional prop `vaultName`, for "Not every address in <name> was read."
4. **No add while the vault was never read** (F3): `canAdd` is false while the status is `failed` and no read of this vault has answered. GilbApp had no failed state.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/records/AddressRows.tsx` lines 1-75 to `src/AddressRows.tsx`.

## Tests

`npx vitest run`, 68 tests in 9 files:

- `AddressRows.addressLines.test.tsx` 4 and `.postalCode.test.tsx` 5: Address 1 / Address 2 and the Postal Code on a stored address and in the add form, writing that field only.
- `AddressRows.person.test.tsx` 9 (`AddressRows.c214e6`): the title, add, change in place, pick a country on a stored address, remove, the (-), only this record's addresses, read-only, a plain-text address kept.
- `AddressRows.addOwn.test.tsx` 6 (`AddressRows.addOwn.s5e`): "+ Add your own" in place on the one card, Enter saves, Close and Esc write nothing, read-only holders and unlinked cards see none, the same writes as the existing editor.
- `AddressRows.reviewFixes.test.tsx` 14: the view parts of `AddressRows.reviewFixes.c214` (typing during a first save, the address the save named, the double-save guard, clearing the last part, Close).
- `AddressRows.status.test.tsx` 13 (new): F1-F4, an answered read kept across a failed re-read and the mark kept per vault, the fail-closed sentence, the add affordance by mode, the record's vault.
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13.
- Over a fake platform (`test/`): the in-memory vault behind `fetch` (A mocked its record client). A world-level check closes every file: no request to the catalogue was anything but a `GET`.
- The merge ("You have the same on your card") is proved with the provider's own members in `stakeholder-record-card-host-gilbplatform`.
