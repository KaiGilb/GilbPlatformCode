# record-sync

A vault's typed record list over the platform's record interface, and only what changed in it since a stored position, read through the authenticated fetch the host injects.

## What this is

A vault's typed record list over the platform's record interface, and only what changed in it since a stored position, read through the authenticated fetch the host injects.

Plain functions and types, no React, no credential. The platform serves the list, and the change feed beside it, on `GET /lws/vault/<vaultId>/records`. A screen that shows the list from its own pages takes the two positions (live and ended) first, and later asks only what changed since. A row appears only if the caller could read that record, so nothing here widens what a caller reads.

- `headRecordState(platform, vaultId, typeNames)`: the list's two positions NOW (`since=head`, no rows): `{ live, ended }`, or `null` when the platform has no feed.
- `syncRecordChanges(platform, vaultId, typeNames, state, { maxPages? }?)`: the live list's changes since `state.live` (full rows, oldest first), then the ended list's deletes since `state.ended`. Answers `{ kind: "changes", rows, ended, state, complete, pages }`, or `null` when the caller must read its list again (a platform without the feed, or a position the platform no longer takes).
- `RECORD_PAGE_LIMIT` (100): the most rows one full-row page carries.
- `RecordListError`: a list that answered other than 200 (`status`, and `code`, the platform's error name such as `since_cursor_invalid`).
- The platform client this talks through: `PlatformClient` (`{ origin, fetch }`), `PlatformFetch`, `PlatformError` (`status` 0 means not reached), `PlatformAnswer`, `request(platform, method, url, body?, headers?, cache?, bound?)`, `RequestBound` (`signal`, `timeoutMs`), `routeUrl(platform, path)`, `vaultSegment(vaultId)`.
- Types: `RecordSyncState`, `RecordSync`, `RecordRow`.

## What this is not

- Not the whole of `gilb-stakeholders`' `recordPages.ts` and `platform.ts`: only the symbols the Plan-card record hooks reach. Not here: `walkRecordPages`, `syncRecordPages`, `RECORD_WALK_MAX_PAGES` (the full walk, and the sync that starts again by itself), and in `platform.ts` `locate`, `retryAfterMs`, `expectStatus`, `isAbsoluteIri`, `originHostMismatch`.
- Not a cache: each call is a request (or two). Where the rows go, and how a row replaces one a screen holds, is the app's.
- Not a credential holder: it never sees a token or a proof. The fetch you give it adds them.
- Not a writer: nothing here sends anything but a `GET`.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-sync`

From a clone of this repository, install the unit's folder; no peer comes first:

```sh
npm install <path-to-the-library>/units/record-sync
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { headRecordState, syncRecordChanges, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const platform: PlatformClient = { origin: "https://holder.platform.example.test", fetch: authenticatedFetch };
const vault = "https://holder.platform.example.test/vault";

let state = await headRecordState(platform, vault, ["Person"]); // before the first page is read
// ... later, to bring the screen up to date:
const sync = state && (await syncRecordChanges(platform, vault, ["Person"], state));
if (sync) {
  state = sync.state; // keep it; a cursor belongs to one vault and one type set
  apply(sync.rows, sync.ended); // by `entity`, then remove the ended ones
} else {
  state = await headRecordState(platform, vault, ["Person"]); // read the list again, as before
}
```

## What the host must supply

- `platform.fetch`: the host app's AUTHENTICATED fetch, at the vault's own origin (`platform.origin`). It adds the token and, where the app uses one, the DPoP proof. In the Plan card it is `lwsReadFetch` of `lws-vault-sets`, which signs through `lws-session-bridge`. Every request here is a `GET`.
- The vault id as `GET /lws/vaults` names it, and bare type names (`Person`, not `t:Person`). Keep the SAME type set for every sync of one state.
- Nothing else. No setting and no start-up call.

## Module state

None. The unit holds only constants.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not page by `records.length`; the unit steps by what the platform names. A row the single read refuses is dropped from `records` but still sits in the window.
- Do not build or edit a cursor. It is opaque. Store the `state` every time, `complete: true` included.
- Do not read an empty `typeNames` as "everything": it is refused before anything is sent (it would read the whole vault).
- Do not use one `state` with another vault, another type set, or another caller.

## Wrong readings

- "`complete: true` with no rows means up to now." It means up to the horizon: a transaction left open anywhere in the store holds the horizon back, and the change comes on a later sync. A reader whose access GREW must start again from `since=start` (not here); losing access gives no signal.
- "`syncRecordChanges` starts again by itself on a bad cursor." It does not (`syncRecordPages`, which does, is not taken): `400 since_cursor_invalid` and a platform without the feed both answer `null`, and the caller reads its list again.
- "A platform that sends no `nextCursor` is at the end of the feed." It has no feed: the unit never loops on its `complete`; it answers `null` (or, for `headRecordState`, `null`).
- "A `RecordListError` is named `RecordListError`." Its `name` stays `PlatformError`, so callers that tell a refusal by that name see the same error as before this unit.
- "The default page cap is the walk's 500." The default of `syncRecordChanges` is 10 requests a list; past it the answer is not complete.
- "`code` is a field of the body." The platform sends the error name as the body's `error`; `code` is that, or `null` when the body is not JSON or names none.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `27fe0cef35857c070354c0439c6e4e4ebcc62815`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from the Plan card's host code in GilbApp at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which pins this package at that commit):

- `src/platform.ts` to `src/platform.ts`: lines 18-46, 69-162, 175-179 (`PlatformFetch`, `PlatformClient`, `PlatformError`, `trimOrigin`, `routeUrl`, `PlatformAnswer`, `request`, `RequestBound`, `boundedRequest`, `plainRequest`, `vaultSegment`);
- `src/recordPages.ts` to `src/recordPages.ts`: lines 21-22, 27-41, 52-103, 153-202, 278-337 (`RECORD_PAGE_LIMIT`, `RecordRow`, `RecordListError`, `listUrl`, `rowOf`, `readPage`, `RecordSyncState`, `RecordSync`, `readFeed`, `headRecordState`, `syncRecordChanges`).

Not taken: in `recordPages.ts` `RECORD_WALK_MAX_PAGES`, `RecordWalk`, `walkRecordPages`, `syncRecordPages`, `syncOnce` (lines 24-25, 43-50, 105-151, 204-276); in `platform.ts` `locate`, `retryAfterMs`, `expectStatus`, `isAbsoluteIri`, `originHostMismatch` (47-68, 163-174, 180-204).

**Merged units compared and taken or not.** No merged unit holds a reached symbol of these two files (searched by name over every `units/*/src`): nothing to import. `lws-vault-sets` and `lws-session-bridge` are where the Plan card's `fetch` comes from; this unit does not import them, because the fetch is an argument.

Named changes, and only these:

1. the imports of the source's own files lose `.ts` (`./platform`), and the import of `PlatformError, request, routeUrl, vaultSegment, PlatformAnswer, PlatformClient` in `recordPages.ts` lists only the symbols that are taken;
2. the header comment of each file is a new, shorter one, and comments that name a host, a person, an agent or a ticket are reworded; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; no shared set-up; the hosts are `example.test` hosts): ported from `gilb-stakeholders` `test/` at the same commit, by test block: `recordPages-sp1b.test.ts` 7 of 7, `recordPages.s129.test.ts` 1 of 2. New: `platform.test.ts` (12), `recordSync.test.ts` (15), `recordSyncUnit.test.ts` (1: the export list), `recordSyncMore.test.ts` (4: what the other files left unpinned, found by mutation checks). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: `recordPages-sp1.test.ts` (11) and `recordPages-sp1.s127.test.ts` (11) (every test runs `walkRecordPages` or `syncRecordPages`, not taken); the other block of `recordPages.s129.test.ts` (it runs `syncRecordPages`); the tests of `pickOrCreate`, `tagResolve` and `holderReference`, which use `PlatformError` and the platform client with symbols that are not taken.
