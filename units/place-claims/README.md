# place-claims

Reads a person's addresses from the vault that holds them: the address claims, their field claims, and what each says.

## What this is

Reads a person's addresses from the vault that holds them: the address claims, their field claims, and what each says.

One address is one `t:PlaceClaim` (`a:claimSubject` the person's record, `a:placeClaimLabel`) with one `t:SelfAssertedFieldClaim` per field (`a:detailOf` the address, and exactly one of `a:streetLine`, `a:addressLine1`, `a:addressLine2`, `a:postalCode` or `a:claimPlace`). This unit READS them; the writing is `place-claim-write`'s.

- `listPlaceClaimsInVault(vaultId)`: every address of the vault, each with its fields, sorted by id (creation order, never the store's last-write order). It lists the whole vault's `PlaceClaim` records and the whole vault's field claims (two typed listings), then groups the fields on their address; it cannot ask for one person's. `claimsAbout(claims, subject)` keeps those about one record, compared by opaque id.
- `PlaceClaim`: `{ id, uri, label, streetLine, memberOf, fields, subjects, hiddenFieldCount, etag }`. `streetLine` and `memberOf` are the LEGACY copies on the composite; read the lines with `claimFieldText(claim, term)` and the places with `claimPlaceIds` of `place-lines`. `hiddenFieldCount` is the number of field records that point at this address and were left out of `fields` because they are about someone else or their subject cannot be read.
- `claimFieldText(claim, term)` (`streetLine`, `addressLine1`, `addressLine2`, `postalCode`; `""` when none), `placeClaimHeading(claim)` (the label, else the first non-empty line), `placeClaimHasContent(input)`.
- `toPlaceFieldClaim(id, uri, doc, etag, vocab)`: one stored document as a field claim, or `null` when it is not an address field. Two values on one record read as `subject: "unknown"`, never as either.
- The tables the write side shares: `PLACE_TEXT_SLOTS`, `PLACE_FIELD_SLOTS`, `textSlotOfTerm`, `termOfTextSlot`, `placeFieldValuesOf`; the messages and errors `EMPTY_ADDRESS_MESSAGE`, `SHARED_ADDRESS_MESSAGE`, `PlaceClaimError`, `SharedAddressError`.
- `placeClaimsKey(vaultId)` and `PLACE_CLAIMS_STALE_MS` (60 s): the key and freshness of the vault's one shared address read, so the Address group and the one card's merge share it.

**It says when it did not read everything.** The listing stops at 50 pages; past that `listPlaceClaimsInVault` throws `VaultListingCappedError` ("Not every record in this vault was read ..."), for the addresses or for the field claims alike. It never returns the pages it has as the whole.

## What this is not

- Not a writer: no function here creates, changes or removes anything.
- Not the origin settings (`geo-origin`, `term-origin`) and not a place list: no place or address is kept here.
- Not a view: what a surface says when something was not read is the view's (the answers here carry what it needs).

## How to take it

Package: `@kaigilb/gilbplatformcode-place-claims`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-claims` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/geo-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. Every request is a `GET`, and a test reads the source and fails on a write verb, a write function or a network call of its own.

## Requests and their servers

Through `vault-records-of-type` and `vault-resources`: `GET <vault node>/lws/vault/<vault>/records?type=PlaceClaim&include=body` and the same for `type=SelfAssertedFieldClaim`, page by page (at most 50 each); `GET /lws/r/<id>` only for a listed record that came without its document. The holder's vault only. Nothing else.

## What the host must supply

The platform's settings that the peers read (`base-origin`, the sign-in seam) and, where it reads the catalogue or the ontology, the two origins (`geo-origin`, `term-origin`), set once at start-up. `fetch`.

## Module state

None of its own.

## Do not

- Do not show what a read returned as the whole answer when it threw `VaultListingCappedError`, or when a place is `failed`.
- Do not render "no addresses" or "no places" while a read has not answered, or after it failed.
- Do not write the names it reads back into the vault: they are pointers' names, read each time.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the vault surface is `vault-records-of-type`, the vocabulary `place-vocab`, `boundPlaceIds` is `place-lines`, the catalogue type is `geo-catalogue`'s.
2. **A page ceiling is said** (F4): the listing is `vault-records-of-type`'s, which throws instead of ending silently.
3. **A field left out is counted** (F5): `PlaceClaim.hiddenFieldCount`. GilbApp left a field out of an address when its subjects are not the address's (or cannot be read) and wrote a `console.warn` naming it; nothing on the screen said so.
4. **Not taken here:** the write side of both files (`placeClaimFacts`, `createPlaceClaim`, `updatePlaceClaim`, `removePlaceClaim`, `slotsForFields`, `planFieldWrites`, `fieldSpecs`, `compositeEntityUri`, `DIRECT_READER`, `PlaceFieldClaimError`, the grant-plane fence, `placeFieldClaimFacts`, the field create/update/remove, `isPartOfAddress`, `listFieldClaimsDetailing`) are `place-claim-write`'s. `claimStreetLine`, `claimPlaceIds`, `isDecomposed`, `needsFieldMigration`, `boundPlaceIds` are the unit `place-lines`'s (equal to GilbApp's; `claimStreetLine` is not used: `claimFieldText(claim, "streetLine")` reads the same). `factsSurvived` and the hook `usePlaceClaims` are `use-place-claims`'s (the key and the freshness are here).
5. The module headers and the comments that named hosts, a cycle or an agent are reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/place/placeFieldClaim.ts` lines 1-637 to `src/placeFieldClaim.ts`, `src/lib/mynet/place/placeClaim.ts` lines 1-909 to `src/placeClaim.ts`, `src/lib/mynet/place/usePlaceClaims.ts` lines 50-52 to `src/placeClaimsKey.ts`.

## Tests

`npx vitest run`, 49 tests in 4 files:

- `placeClaims.read.test.ts` 29: the read cases of GilbApp's `placeClaim.c214e6.test.ts` (3 of 4; the round trip writes), `placeAddressLines.c214.test.ts` (the line table; a record holding only a line; one field per record; no find route), `placePostalCode.c214.test.ts` (the fourth row; "0150" with its zero; the heading with no Location; a postal-only address; no find route) and `placeListBodies.m3f.test.ts` (the whole read takes the listed documents), ported over a fake platform at the level of `fetch`, the writes in them seeded as the writer stores them (the writing cases are `place-claim-write`'s). New: F4 (a read past the ceiling throws, for the addresses and for the field claims), F5 (a hidden field is counted: another person's, an unreadable subject; one under another spelling of the same record is not), `claimsAbout`, the key.
- `exports.test.ts` 2 (the entry point; no write function is exported), `readOnly.test.ts` 5 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes the file: across it, no request with a method but `GET` was made.
