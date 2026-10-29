# record-sync

A vault's typed record list over the platform's record interface, and only what changed in it since a stored position, read through the authenticated fetch the host injects.

## What this is

A vault's typed record list over the platform's record interface, and only what changed in it since a stored position, read through the authenticated fetch the host injects.

Plain functions and types, no React, no credential. The platform serves the list, and the change feed beside it, on `GET /lws/vault/<vaultId>/records`. A screen that shows the list from its own pages takes the two positions (live and ended) first, and later asks only what changed since. A row appears only if the caller could read that record, so nothing here widens what a caller reads.

- `headRecordState(platform, vaultId, typeNames)`: the list's two positions NOW (`since=head`, no rows): `{ live, ended }`, or `null` when the platform has no feed.
- `syncRecordChanges(platform, vaultId, typeNames, state, { maxPages? }?)`: the live list's changes since `state.live` (full rows, oldest first), then the ended list's deletes since `state.ended`. Answers `{ kind: "changes", rows, ended, state, complete, pages }`, or `null` when the caller must read its list again (a platform without the feed, or a position the platform no longer takes).
- `walkRecordPages(platform, vaultId, typeNames, { until?, maxRows?, maxPages? }?)`: the whole typed list in full rows (`include=body&limit=100`), newest first, stepping by the page's `nextOffset` until the list says `complete`. Answers a `RecordWalk` (`{ rows, complete, pages }`). An empty `typeNames` is refused. Added in 0.3.0.
- `RECORD_PAGE_LIMIT` (100): the most rows one full-row page carries. `RECORD_WALK_MAX_PAGES` (500): the most requests one walk sends by default. Added in 0.3.0.
- `RecordListError`: a list that answered other than 200 (`status`, and `code`, the platform's error name such as `since_cursor_invalid`).
- The platform client this talks through: `PlatformClient` (`{ origin, fetch }`), `PlatformFetch`, `PlatformError` (`status` 0 means not reached), `PlatformAnswer`, `request(platform, method, url, body?, headers?, cache?, bound?)`, `RequestBound` (`signal`, `timeoutMs`), `routeUrl(platform, path)`, `vaultSegment(vaultId)`, `locate(platform, iri)` (the IRI's own path and query, on the platform's origin; a `PlatformError` of status 0 when the IRI is not an address), `retryAfterMs(headers, now?)` (what a `Retry-After` header asks for, in milliseconds, or `null`), `isAbsoluteIri(value)` (a shape check for an absolute http(s) IRI), `originHostMismatch(platform, vaultId)` (why the client's origin cannot write in that vault, or `null`; the origin's host and port must be the vault's), and `expectStatus(answer, method, ok)`: the answer itself when its status is one of `ok`, else a `PlatformError` that says what was asked and what came back (`<METHOD> <url> answered <status>: <first 300 characters of the body>`).
- Types: `RecordSyncState`, `RecordSync`, `RecordRow`, `RecordWalk`.

## What this is not

- Not the whole of `gilb-stakeholders`' `recordPages.ts` and `platform.ts`: only the symbols the Plan-card record hooks and the Stakeholder card reach. Not here: `syncRecordPages` (the sync that starts again by itself) and its `syncOnce`.
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

### Changes in 0.3.0

Taken from the same gilb-stakeholders commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, because the Stakeholder card's holder-reference, pick-or-create, person-connections and online-card units read through these symbols. New code, copied by script and verbatim: `platform.ts` lines 48-67 (`locate`, `retryAfterMs`) and 181-204 (`isAbsoluteIri`, `originHostMismatch`); `recordPages.ts` lines 24-25 (`RECORD_WALK_MAX_PAGES`, which `walkRecordPages` defaults to), 43-50 (`RecordWalk`) and 105-151 (`walkRecordPages`). The six symbols asked for are `walkRecordPages`, `RecordWalk`, `isAbsoluteIri`, `locate`, `originHostMismatch` and `retryAfterMs`; `RECORD_WALK_MAX_PAGES` comes with them because `walkRecordPages` uses it and the source exports it beside them. Nothing of 0.2.0 changed, and the host seam is the same: the authenticated fetch still arrives through `PlatformClient`. Named changes: comments only (the ones that named a person, a ticket or a section are reworded). Tests: `src/recordWalk.test.ts` (5) and `src/recordWalk.s127.test.ts` (5) are ported from the `walkRecordPages` blocks of `recordPages-sp1.test.ts` and `recordPages-sp1.s127.test.ts`, with the source's own files imported by relative path. New: `src/platformAddress.test.ts` (11: `isAbsoluteIri`, `locate`, `originHostMismatch`, `retryAfterMs`; no clock, `now` is passed in) and `src/recordWalkLimits.test.ts` (8: the limits and errors of `walkRecordPages`, and the page cap). `recordSyncUnit.test.ts` now lists seven more exports. The peer range of the units that take this one is `^0.3.0`.

### Up to 0.2.0

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from the Plan card's host code in GilbApp at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which pinned this package at `27fe0cef`; `expectStatus` was added from GilbApp at `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, which pins this package at `0a261488`):

Changes in 0.2.0: adds `expectStatus` (gilb-stakeholders platform.ts 164-173); re-pinned to 0a261488, where every earlier range is byte-identical.


- `src/platform.ts` to `src/platform.ts`: lines 18-46, 48-67, 69-162, 164-173, 175-179, 181-204 (`PlatformFetch`, `PlatformClient`, `PlatformError`, `trimOrigin`, `routeUrl`, `locate`, `retryAfterMs`, `PlatformAnswer`, `request`, `RequestBound`, `boundedRequest`, `plainRequest`, `expectStatus`, `vaultSegment`, `isAbsoluteIri`, `originHostMismatch`);
- `src/recordPages.ts` to `src/recordPages.ts`: lines 21-22, 24-25, 27-41, 43-50, 52-103, 105-151, 153-202, 278-337 (`RECORD_PAGE_LIMIT`, `RECORD_WALK_MAX_PAGES`, `RecordRow`, `RecordWalk`, `RecordListError`, `listUrl`, `rowOf`, `readPage`, `walkRecordPages`, `RecordSyncState`, `RecordSync`, `readFeed`, `headRecordState`, `syncRecordChanges`).

Not taken: in `recordPages.ts` `syncRecordPages`, `syncOnce` (lines 204-276).

**Merged units compared and taken or not.** No merged unit holds a reached symbol of these two files (searched by name over every `units/*/src`): nothing to import. `lws-vault-sets` and `lws-session-bridge` are where the Plan card's `fetch` comes from; this unit does not import them, because the fetch is an argument.

Named changes, and only these (0.3.0 adds comment rewording only):

1. the imports of the source's own files lose `.ts` (`./platform`), and the import of `PlatformError, request, routeUrl, vaultSegment, PlatformAnswer, PlatformClient` in `recordPages.ts` lists only the symbols that are taken;
2. the header comment of each file is a new, shorter one, and comments that name a host, a person, an agent or a ticket are reworded; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; no shared set-up; the hosts are `example.test` hosts): ported from `gilb-stakeholders` `test/` at the same commit, by test block: `recordPages-sp1b.test.ts` 7 of 7, `recordPages.s129.test.ts` 1 of 2; since 0.3.0 also `recordPages-sp1.test.ts` 5 of 11 (as `recordWalk.test.ts`) and `recordPages-sp1.s127.test.ts` 5 of 11 (as `recordWalk.s127.test.ts`). New: `platform.test.ts` (16, of which 4 pin `expectStatus`), `recordSync.test.ts` (15), `recordSyncUnit.test.ts` (1: the export list), `recordSyncMore.test.ts` (4: what the other files left unpinned, found by mutation checks), and since 0.3.0 `platformAddress.test.ts` (11) and `recordWalkLimits.test.ts` (8). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: the `syncRecordPages` blocks of `recordPages-sp1.test.ts` and `recordPages-sp1.s127.test.ts`, and the `findCandidates` test of the first (they run `syncRecordPages`, not taken, or `pickOrCreate`); the other block of `recordPages.s129.test.ts` (it runs `syncRecordPages`); the tests of `pickOrCreate`, `tagResolve` and `holderReference`, which use `PlatformError` and the platform client with symbols that are not taken.
