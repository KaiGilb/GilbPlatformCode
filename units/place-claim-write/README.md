# place-claim-write

Writes a person's addresses to the vault that holds them: create, change and remove, one request per fact, never to the place catalogue.

## What this is

Writes a person's addresses to the vault that holds them: create, change and remove, one request per fact, never to the place catalogue.

One address is one `t:PlaceClaim` (the composite) with one `t:SelfAssertedFieldClaim` per field. This unit WRITES them; reading them is `place-claims`'s. No React.

- `createPlaceClaim(vaultId, subject, input, principal?)`: POST the composite, then one POST per non-empty text line (street, Address 1, Address 2, Postal Code, in that order) and one per picked place (country, region, city). Resolves `{ id, uri, fieldIds }`.
- `updatePlaceClaim(vaultId, claim, subject, input, principal?)`: only what the act changed (see "The wire"). Refuses an address that would become empty, an address in the older shape, and an address with a detail this screen cannot place, BEFORE writing anything.
- `removePlaceClaim(vaultId, claim, cardSubject)`: refuses an address that also names someone else (`SharedAddressError`), then DELETEs every part that is the address's (found by listing, not only the ones the claim carries), then the composite. It deletes nothing unless the listing of the parts was whole.
- The field-claim writes `createPlaceFieldClaim`, `updatePlaceFieldClaim`, `removePlaceFieldClaim`, the composers `placeClaimFacts`, `placeFieldClaimFacts`, `placeClaimLabelPatch`, `planFieldWrites`, `slotsForFields`, `fieldSpecs`, and the fence on grants `assertNoGrantPlane` (`GRANT_PLANE_ATTRIBUTES`: no `a:directReader`, `a:directWriter`, `a:partOf`, `a:readerGroup` may enter a composed fact; the one reader grant is added at create, after the check).

**The place catalogue is never written.** Every write function checks, BEFORE its first request, each URL it is going to send a POST, PATCH or DELETE to, with `isGeoUrl` of `geo-origin` (the parsed origin): the container URL of the vault for a create, the resource URL of the entity for a change or a remove (built from the same arguments the record client gets, so an entity address planted under the catalogue is refused even when the vault argument is the holder's). A hit throws `GeoWriteRefusedError` (of `geo-origin` 0.1.1; "The place catalogue is read only, so nothing can be written to it.") with no request made. **The fence fails closed:** when the catalogue's origin was never set it cannot tell what is inside it, so every write function throws `GeoWriteRefusedError` with `reason: "origin-unknown"` ("Addresses cannot be saved here: the place catalogue is not known.") before any request. The host must call `setGeoOrigin` before any write. A remove also checks every part its listing found before the first DELETE.

## The wire (keys per request, `a:` as stored)

| Act | Request | Keys |
|---|---|---|
| create | `POST <vault>/lws/vault/<vault>/c` the composite, `type: t:PlaceClaim` | `a:claimSubject` `{@id: record}`, `a:placeClaimLabel` only when the trimmed label is not blank, `a:directReader` only when a principal is given |
| create | one `POST` per field, `type: t:SelfAssertedFieldClaim` | `a:claimSubject`, `a:detailOf` `{@id: composite}`, exactly ONE of `a:streetLine` `a:addressLine1` `a:addressLine2` `a:postalCode` (trimmed text) or `a:claimPlace` `{@id: place}`, `a:directReader` when a principal is given |
| change | `PATCH /lws/r/<id>` of the composite, only when the label changed | `a:placeClaimLabel: "<new>"`; `null` ONLY when a non-blank label was cleared. **Never `a:claimSubject`.** A label that stays as it was sends no request for the composite at all |
| change | `PATCH /lws/r/<id>` of a field whose value changed | its one key (`a:streetLine` ... or `a:claimPlace`), text trimmed. No null |
| change | `DELETE /lws/r/<id>` of a field that was cleared | none |
| change | `POST` of a field that was added | as in create |
| remove | `GET` the address, `GET` the field-claim listing, then one `DELETE /lws/r/<id>` per part, then the composite's | none |

An amend that changes nothing sends nothing.

## What this is not

- Not the reading of addresses (`place-claims`) and not a view: what a card draws for each state is the card's.
- Not the origin settings (`geo-origin`, `term-origin`) and not a place list.
- Not a writer to the place catalogue: no code path of this library writes there.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-claim-write`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-claim-write` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/geo-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims <path-to-the-library>/units/place-claim-write
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Addresses in the holder's vault only: `t:PlaceClaim` and `t:SelfAssertedFieldClaim` entities (create, merge patch, delete). Never the place catalogue; a write whose target URL is inside it throws before any request. Nothing is written to the device.

## Requests and their servers

`POST <vault node>/lws/vault/<vault>/c`, `PATCH /lws/r/<id>`, `DELETE /lws/r/<id>` at the node of the entity's own address, signed, ONLY in the holder's vault (never the catalogue: the fence); `GET` the address (`/lws/r/<id>`) and the field-claim listing (`/lws/vault/<vault>/records?type=SelfAssertedFieldClaim&include=body`) in a remove; `GET <place address>` and the ontology's grain reads in a change that has a place (`slotsForFields`: it classifies the stored places). Nothing else.

## What the host must supply

The platform's settings the peers read (`base-origin`, the sign-in seam), the two origins (`geo-origin`, `term-origin`) set once at start-up, and `fetch`. 

## Module state

None.

## Do not

- Do not call a write function with a vault or an entity address you did not get from the holder's own vault: if it is inside the catalogue it is refused, by design.
- Do not catch `GeoWriteRefusedError` and retry elsewhere.
- Do not show a failure's own text: use the fixed sentences.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the vault surface is `vault-resources`, `vault-namespace` (`entityUriInVault`), `resource-id`; the vocabulary is `place-vocab`; the read side (types, tables, listing) is `place-claims`; `needsFieldMigration` is `place-lines`; the catalogue is `geo-catalogue` (`getPlace`, `resolveGeoGrains` in `slotsForFields`, GETs). `DIRECT_READER` is defined here (GilbApp defined it twice, once in each file; `held-notes` has a named copy of the same string).
2. **The per-write geo fence** (decision 2b, new): see above, and it fails CLOSED. GilbApp had none; the server's whole-vault write grant was the only fence. `GeoWriteRefusedError` is `geo-origin`'s (0.1.1), re-exported here.
3. **The amend wire** (decision 6): GilbApp patched the composite on EVERY amend, re-sent `a:claimSubject` each time (on an address that is also about someone else, a merge patch that replaces a list would drop the other subject), and sent `a:placeClaimLabel: null` whenever the label was blank, changed or not. Now only what the act changed; `a:claimSubject` never. `placeClaimFacts` has no `forAmend` any more; `placeClaimLabelPatch` is new.
4. **A partial create is said** (decision 12): when a field fails after the composite exists, `createPlaceClaim` throws `PlaceClaimPartialError` (`made`, `failure`), not the field's own error as if nothing had been made. Nothing is cleaned up (as GilbApp).
5. **A remove works only from a whole listing** (F4): the listing of the field claims (`listFieldClaimsDetailing`, which moved to `place-claims` 0.1.1 because it reads) answers whether it was whole; if not, `removePlaceClaim` refuses with `REMOVE_NOT_WHOLE_MESSAGE` and deletes nothing. GilbApp's listing ended quietly at its ceiling and deleted on, leaving the parts it never saw.
6. **Fixed sentences:** the refusals a person may be told (`EMPTY_ADDRESS_MESSAGE`, `OLDER_SHAPE_MESSAGE`, the 'cannot be placed' sentence, `REMOVE_NOT_WHOLE_MESSAGE`) are thrown as `PlaceClaimRefusal` with a `sentence`; the 'cannot be placed' sentence is reworded so that it reads to a person (GilbApp's began `Refusing to change this address:`). Every other error is for the log.
7. Not taken: nothing of GilbApp's write side is left out. The module headers and the comments that named hosts, a cycle or an agent are reworded with the same facts.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/place/placeFieldClaim.ts` lines 85-200 to `src/placeFieldClaimWrite.ts`, `src/lib/mynet/place/placeFieldClaim.ts` lines 216-386 to `src/placeFieldClaimWrite.ts`, `src/lib/mynet/place/placeClaim.ts` lines 297-909 to `src/placeClaimWrite.ts`.

## Tests

`npx vitest run`, 94 tests in 7 files:

- `placeClaimWrite.test.ts` 36: the write cases of GilbApp's `placeClaim.c214e6`, `placeAddressLines.c214`, `placePostalCode.c214`, and the library-level cases of `AddressRows.reviewFixes.c214` (N2, Q2's remove, R1 S1-S4, F3, F4), ported over a fake platform at the level of `fetch` (the source mocked the app's record client), with the cases that changed on purpose marked CHANGED (a street change no longer patches the composite). The cards' own cases (the add form, Close, the double-save guard) are `place-claims-card`'s, a later batch.
- `wire.test.ts` 14 (new): the keys of every request; the amend wire against GilbApp's (a blank label left blank, an unchanged label, a changed label, a cleared label, never `a:claimSubject`, an address also about someone else under a merge patch that REPLACES and one that ADDS); the order of a remove; a remove from an incomplete listing.
- `geoFence.test.ts` 17 (new; two of them are the fail-closed cases): create, update, remove and each field write refused with no request at all when the target is the catalogue's, including an entity address planted under the catalogue with the holder's vault, and a part found by the listing; a smuggled address in a query is not the catalogue; the controls.
- `grantPlane.test.ts` 8, `exports.test.ts` 1, `noNetwork.test.ts` 5 (new); `hostAgnostic.test.ts` 13.
- A world-level check closes every file that uses the fake platform: across it, nothing but a GET went to the place catalogue (the grain and place reads of a change are GETs).
