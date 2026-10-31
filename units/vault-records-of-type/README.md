# vault-records-of-type

Lists every record of one type in a vault, page by page, and says when the listing stopped before the end.

## What this is

Lists every record of one type in a vault, page by page, and says when the listing stopped before the end.

`listRecordsOfType(vaultId, typeQuery)` asks the vault's typed listing (`?type=<bare name>&include=body`) page by page and returns one reference per record: `{ entity, typeUri, read? }`. With `include=body` the platform sends each record's whole document and ETag on the listing itself, so `read` carries it and `getListedResource(ref, vaultId)` hands it back with NO request; a record listed without a document is read once, at its own address. A page can be empty and still not the last (the door names where the next page starts); a door that names the same offset again ends the listing (it cannot advance).

**When the listing is cut short it says so, and keeps what it read.** `listRecordsOfType` answers `{ records, complete }`. `complete: true`: the door said it was the last page. `complete: false` carries a `reason`: `"capped"` (the listing stops at `MAX_LIST_PAGES`, 50 pages, so that a door that never says `complete` cannot loop the card, and the door still had more) or `"stalled"` (the door could not advance: it named the same offset again, or sent an empty page that was not the last and named no next offset). The records read are ALWAYS returned. A caller must show them AND say that not every record was read; an incomplete listing is never "there are no more".

## What this is not

- Not a writer: no function here creates, changes or removes anything.
- Not the origin settings (`geo-origin`, `term-origin`) and not a place list: no place or address is kept here.
- Not a view: what a surface says when something was not read is the view's (the answers here carry what it needs).

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-records-of-type`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-records-of-type` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. Every request is a `GET`, and a test reads the source and fails on a write verb, a write function or a network call of its own.

## Requests and their servers

`GET <vault node>/lws/vault/<vault>/records?type=<bare type>[&offset=<n>]&include=body`, one per page, at most 50, through `listVaultRecordsPage` (signed, the holder's vault only); `GET <entity address>` (`/lws/r/<id>`) for a listed record that came without its document. Nothing else.

## What the host must supply

The platform's settings that the peers read (`base-origin`, the sign-in seam) and, where it reads the catalogue or the ontology, the two origins (`geo-origin`, `term-origin`), set once at start-up. `fetch`.

## Module state

None.

## Do not

- Do not show what a read returned as the whole answer when `complete` is `false`, or when a place is `failed`.
- Do not render "no addresses" or "no places" while a read has not answered, or after it failed.
- Do not write the names it reads back into the vault: they are pointers' names, read each time.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the vault surface is `vault-resources` (`getResource`), `lws-vault-sets` (`listVaultRecordsPage`), `lws-records` (`recordFromServed`) and `resource-id` (`idFromResourceUri`).
2. **An incomplete listing is said, and what was read is kept** (F4). GilbApp's loop ended at 50 pages, or when a door named the same offset again, and returned the records it had as if they were all, so addresses past that point were never shown and nothing said so. Now `listRecordsOfType` answers `{ records, complete: false, reason: "capped" | "stalled" }` (the smaller shape: a marker beside the records; no error is thrown, so the records cannot be lost). `MAX_LIST_PAGES` is exported (GilbApp: private). The return type is `RecordListing`, not `RecordRef[]`.
3. A stalled door is ALSO incomplete (it was a quiet stop in GilbApp, pinned by its test X19; that test now pins the marker). A page that carried bodies, named no next offset and had nothing more to say is still taken as the end, as GilbApp does.
4. The module header and the comments that named hosts, a cycle or an agent are reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/place/lws.ts` lines 88-146 to `src/vaultRecordsOfType.ts`.

## Tests

`npx vitest run`, 29 tests in 4 files:

- `vaultRecordsOfType.test.ts` 12: the three cases of GilbApp's `placeListBodies.m3f.test.ts` (listed documents instead of one read per record; an empty page that is not the end; a door that cannot advance), ported over a fake platform at the level of `fetch` (the source mocked the app's list function), the last one CHANGED to pin `stalled`; F4 (the 51st page is `capped` and the 50 read are returned; exactly 50 pages is complete; both paging paths; a stalled door keeps its records; an empty page that is not the last is `stalled`), the type/vault asked for, `getListedResource` (new).
- `exports.test.ts` 1, `readOnly.test.ts` 3 (new): the source names no method and no write verb or function, and calls no network function itself.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.
- A world-level check closes the file: across it, no request with a method but `GET` was made.
