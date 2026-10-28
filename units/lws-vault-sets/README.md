# lws-vault-sets

Asking a vault what it holds over the platform's record interface: a page of its records or files, a find by attribute, a text search, and the cap on requests in flight.

## What this is

Asking a vault what it holds over the platform's record interface: a page of its records or files, a find by attribute, a text search, and the cap on requests in flight.

Plain functions and types, no React. Every request is signed through the auth seam (`lws-session-bridge`) and addressed at the origin the vault's own address names (`vault-origin-rule`).

- `listVaultRecordsPage(vaultId, typeNames?, offset?, opts?)`: `GET /lws/vault/<namespace>/records`, one page, recent first. Answers `{ records, total, complete, pageSize, offset, types?, served, nextOffset? }`. Rows that are not records (relations, control-plane rows, UI-preferences rows, registered card parts) are dropped after the door sent them, so `served` says how many rows the door sent, and a reader that pages by `offset` must advance by `served`, not by `records.length`.
- `listVaultHeldTypes(vaultId)`: `GET /lws/vault/<namespace>/types`, the vault's row-less, per-viewer type census: `{ types, totalItems, totalItemsKind, excludedTypes, vault, scannedVaults }`, each type with its count. `null` when the door answers 404 (a Base that does not serve it); any other failure throws. A 404 is remembered per Base origin for `CENSUS_DOOR_ABSENT_TTL_MS` (60 s) and asked again after it; a served census is never cached. `__resetCensusDoorProbeForTest()` empties that memory. Added in 0.2.0.
- `listVaultFilesPage(vaultId, offset?, filter?)`, `listVaultFiles(vaultId, lifecycle?)`, `OPEN_PAGE_SIZE` (20): `GET /lws/vault/<namespace>/files`, the first page only.
- `lwsReadFetch(url, init?)`: the authenticated `fetch` the vault reads use. Credential first, the DPoP read pair when none can be formed, and one DPoP retry on a 401.
- `searchEntities(query, typeNames, facet?, vaultId?, match?, cursor?, opts?)`, `UNTYPED_FIND`, `SearchUnavailableError`, `bareTypeNames`, `idFromEntityUri`, and the types `SearchResult`, `FacetBucket`: `GET /base/search`, with the keyset cursor passed through unread.
- `findByAttribute(attr, value, page?, origin?)`, `pageAllByAttribute(attr, value, origin, opts?)`, and the types `AttributeFindResult`, `AttributeFindPage`: `GET /base/find-by-attribute`.
- `planReadLimit(queryClient)`, `createLimiter(limit)`, `MAX_PARALLEL_DEREFERENCES` (6), `mapWithConcurrency(items, limit, fn)`: the cap on requests in flight.
- `isNonRecordListEntry`, `isRelationEntityUri`, `isInternalControlType`, `isAppUiPreferencesType`, `isUiPrefsRecord`, `isCardPartType`, `registerCardPartTypes`, `typeLocalName`, `APP_UI_PREFS_TYPE`, `PREFS_LABEL`: which rows are not ordinary content.
- `idFromUri`.

## What this is not

- Not the whole of the app's `vaultSets.ts`, `search.ts`, `heldTypes.ts` and `vocabCatalog.ts`. Only the symbols the readers of the Plan card reach through `lwsReadFetch`, `listVaultRecordsPage`, `listVaultFiles`, `listVaultFilesPage`, `planReadLimit`, `searchPlanRecords` and `pageAllByAttribute` are taken. Not here: `listReachableVaults`, `listVaultRecords`, the vault census (`listVaultHeldTypes`, its `censusDoorAbsentAt` memory and `CENSUS_DOOR_ABSENT_TTL_MS`), `heldTypePlanes` and everything under it (the term dereference, the `import("./ontologyBrowse")` load, the `/version` read and the two environment settings it reads), and `vocabCatalog.ts` whole. They belong to the record hooks, which decide how the ontology load and those settings are supplied.
- Not `searchPlanRecords` or the Plan-card search that calls `searchEntities`; not the hooks that call these readers; not a cache. Each call is a request.
- Not the result-total or narrow-total behaviour: `search.ts` reads a total through the peer `result-total`, and `listVaultRecordsPage` narrows a total through the peer `narrow-total`.
- Not a re-implementation of the record client: a failure sentence is read by `lws-records`.

### Changes in 0.2.0

Taken from the same GilbApp commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, because the record hooks ask the vault for its census of held types. New code, copied by script from `src/lib/base/vaultSets.ts`: lines 439-616 (see "Where it came from"). The import from `vault-origin-rule` gains `LWS_VAULT_TYPES_URL` and `vaultOriginOf`. The two long comment blocks (the banner and the one on the remembered absence) are rewritten shorter, with the same facts; no code changed. The unit keeps one more piece of module state, `censusDoorAbsentAt` (the instant a Base origin's census door answered 404); an app must have ONE copy. Nothing of 0.1.0 changed. Tests: `src/vaultSets.heldTypes.test.ts` (7) and `src/vaultSets.censusDoorProbe.test.ts` (7) are ported from `vaultSets.heldTypes.test.ts` (all 7) and `vaultSets.censusDoorProbe.test.ts` (all 7), with the app's token and DPoP mocks replaced by the fake host and the hosts made `example.test` hosts. New: `src/heldTypesEnvelope.test.ts` (5: the envelope members that are read tolerantly, and the census URL). The peer range of `lws-relations` and `record-cache-kit` on this unit is `^0.2.0`.

## How to take it

Package: `@kaigilb/gilbplatformcode-lws-vault-sets`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/lws-vault-sets` prints:

```sh
npm install <path-to-the-library>/units/lws-vault-sets
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-session-bridge`'s does, because a unit's type check reads its peers' source and the peer `signin` does not pass it.

`@tanstack/react-query` is declared twice, on purpose: as a `peerDependency` (`^5.101.2`) and as a `devDependency` (so this unit's own type check and its limiter test have it). The unit uses it for one thing, the **type** `QueryClient` (`import type`, in `planRequestLimit.ts`): there is no runtime import of it, and `planReadLimit` only uses the client as the key of a `WeakMap`. An app that never calls `planReadLimit` does not need the package at run time, but it must be installed for the unit's type check to pass.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { listVaultRecordsPage, searchEntities } from "@kaigilb/gilbplatformcode-lws-vault-sets";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: "https://platform.example.test/base/auth/session/dpop-token" })));

const page = await listVaultRecordsPage("https://kai.platform.example.test/base", ["Task"], 0);
const next = page.complete ? null : page.offset + page.served; // advance by what the door sent
const found = await searchEntities("milk", ["NoteDocument"], undefined, "https://kai.platform.example.test/base");
```

## What the host must supply

- `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, once at start-up. `findByAttribute` reads `baseOrigin()` when it is called without an `origin`.
- `setLwsAuth(host)` from `lws-session-bridge`, once at start-up.
- A caller that registers the types whose records are parts of a person card (`registerCardPartTypes([...])`) before the first page it wants filtered. Until it does, no type is a card part.
- On a local development rig only: `setLocalRigHosts([...])` from `base-origin`.

## Module state

The unit holds three pieces of module state. An app must have ONE copy of this unit, or each copy keeps its own.

- `limits` (`planRequestLimit.ts`): a `WeakMap` from a query client to its limiter. `planReadLimit(qc)` makes one limiter of `MAX_PARALLEL_DEREFERENCES` per client and returns the same one after. Nothing empties it; the garbage collector does when the client goes.
- `CARD_PART_TYPE_LOCALS` (`recordPlane.ts`): the set of bare type names registered by `registerCardPartTypes`, read by `isCardPartType` and so by `isNonRecordListEntry` and by every page `listVaultRecordsPage` drops rows from. It starts empty and only grows. `registerCardPartTypes` was not found by the symbol tracer (it is a writer to the state, not a reference from reached code); it is taken because without it the set can never be filled.
- `NON_RECORD_TYPE_LOCALS` (`recordPlane.ts`): a constant set of eleven names, never changed.

The app's other state in the files this unit is taken from is **not** here: `censusDoorAbsentAt` (`vaultSets.ts`), `servedRevisionInFlight` and `ontologyBrowseInFlight` (`heldTypes.ts`), and the catalogue caches of `vocabCatalog.ts` (`findCached`, `findCachedAt`, `findInFlight`, `typeCached`, `typeCachedAt`, `attrCached`, `attrCachedAt`).

Dynamic imports in the files taken: none. The app's `heldTypes.ts` holds `import("./ontologyBrowse")` (line 78, and the type `typeof import("./ontologyBrowse")`, line 75); both are in code that is not taken. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not page by `records.length`. A page whose rows the register filter all dropped has 0 records and is not the end; advance by `served`.
- Do not send these reads without a credential. Ask the seam; a URL outside the platform gets no header and is not sent one.
- Do not call `bearerHeaderFor(url)` for a request that is not a GET without naming the method: a DPoP proof names it. `lwsReadFetch` passes the request's own.
- Do not install a second copy of this unit.

## Wrong readings

- "`lwsReadFetch` sends a bearer token first." It asks `bearerHeaderFor`, which here answers the same DPoP pair as `dpopReadAuth` (the bridge's README says why). The two-step is kept as the app wrote it: when that answer carries no `authorization`, or throws, the DPoP read pair is asked for, and a 401 is retried once with the DPoP read pair.
- "The apex long-path DPoP 401 is handled." It is kept, not solved. The app preferred the bearer first because the platform's apex route 401s a DPoP proof on a long percent-encoded `/lws/vault/<namespace>/...` path when the proof's `htu` and the path's encoding disagree. Here both steps send a DPoP pair, so the first request can meet that 401 and the retry sends a second proof for the same URL. Whether the apex accepts it is not proven here.
- "`searchEntities` reads a 401 as search being unavailable." A 401 is a sign-out: it drops the held token and throws `NotSignedInError`. A 403 and any other failure, and a request that could not be sent, are `SearchUnavailableError`.
- "No total in the answer means no matches." The total is `null` when the server sent none, never zero.
- "An unattached file list needs a parameter of its own." `listVaultFilesPage(vault, offset, { storedWith: null })` sends `unattached=true`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer):

- `src/lib/base/vaultSets.ts` to `src/vaultSets.ts`: lines 56-120 (`lwsReadAuth`, `lwsReadFetch`, `idFromUri`, `throwForStatus`), 209-430 (`VaultRecordRef`, `RecordsWire`, `VaultRecordsPage`, `listVaultRecordsPage`), 620-681 (`FileLifecycle`, `VaultFileRef`, `FilesWire`, `OPEN_PAGE_SIZE`), 686-757 (`FileListFilter`, `VaultFilesPage`, `mapWireFile`, `listVaultFilesPage`, `listVaultFiles`). Not taken: `FILE_PAGE_SIZE` (a deprecated alias, not reached);
- `src/lib/base/vaultSets.ts` to `src/vaultSets.ts`, added in 0.2.0: lines 439-616 (the held-types banner, `VaultHeldTypes`, `HeldTypesWire`, `typeCountRows`, `CENSUS_DOOR_ABSENT_TTL_MS`, `censusDoorAbsentAt`, `__resetCensusDoorProbeForTest`, `listVaultHeldTypes`). Not taken: `listVaultRecords` (431-437), which no host member reaches;
- `src/lib/base/search.ts` to `src/search.ts`: lines 41-45, 47-78, 80-88, 90-94, 96-100, 102-108, 119-137, 139-181, 183-266;
- `src/lib/base/attributeFind.ts` to `src/attributeFind.ts`: lines 11-20, 22-76;
- `src/lib/base/attributeFindPaging.ts` to `src/attributeFindPaging.ts`: lines 1-67, the whole file;
- `src/lib/base/planRequestLimit.ts` to `src/planRequestLimit.ts`: lines 1-55, the whole file;
- `src/lib/base/heldTypes.ts` to `src/mapWithConcurrency.ts`: lines 106-111 (`MAX_PARALLEL_DEREFERENCES`) and 116-151 (`mapWithConcurrency`);
- `src/lib/base/recordPlane.ts` to `src/recordPlane.ts`: lines 34-60, 95-104, 106-109, 116-119, 121-129, 131-147, 149-159, 161-190 (`CARD_PART_TYPE_LOCALS`, `registerCardPartTypes`, `isCardPartType`), 192-204.

**Peers that were compared and taken or not (each reached symbol, comments stripped, whitespace collapsed).**

- `units/record-plane` is a false friend: of the 12 reached symbols of `recordPlane.ts`, `isRelationEntityUri`, `NON_RECORD_TYPE_LOCALS`, `APP_UI_PREFS_TYPE` and `PREFS_LABEL` are equal; `isInternalControlType`, `isAppUiPreferencesType`, `isUiPrefsRecord` and `typeLocalName` differ in local variable names only; `isNonRecordListEntry` differs in behaviour (the unit has no `isCardPartType` arm); `isCardPartType`, `CARD_PART_TYPE_LOCALS` and `registerCardPartTypes` are not in the unit, and `typeLocalName` is not exported from it. So the reached symbols are taken into this unit, and `record-plane` is not a peer.
- `units/narrow-total`: `narrowTotal` is equal. It is a peer.
- `units/result-total`: `ResultTotal`, `ResultTotalKind`, `TotalBearingWire`, `KINDS`, `readResultTotal` and the six other functions are equal. It is a peer; `resultTotal.ts` is not copied.
- `units/map-limit` is a false friend: its `mapWithConcurrency` has no `failed` short-circuit (after one call throws, the app's starts no further item). The app's is taken.
- `units/id-tail` is not text-equal: its `idFromUri` and `idFromEntityUri` are aliases of `slashTail`. The two small functions are taken.
- `units/type-plane`: the symbols of `vocabCatalog.ts` and `heldTypes.ts` it overlaps are not reached here.
- `units/lws-records` exports `serverErrorText`, the one thing `throwForStatus` uses of `./serverError`; it is a peer.

Named changes, and only these:

1. in `vaultSets.ts` the imports `./config`, `./token`, `./bearer`, `./dpop`, `./recordTypes`, `./recordPlane`, `./types` and `./serverError` are replaced by imports of `vault-origin-rule` (`LWS_VAULT_RECORDS_URL`, `LWS_VAULT_FILES_URL`), `lws-session-bridge` (`NotSignedInError`, `bearerHeaderFor`, `dpopReadAuth`, `invalidateDpop`), `record-types` (`normalizeTypeUri`), `narrow-total` (`narrowTotal`), `lws-records` (`serverErrorText`) and this unit's `./recordPlane`; `./types` is dropped (its names are used by `listReachableVaults`, which is not taken);
2. in `search.ts` the imports `./config`, `./recordPlane`, `./resultTotal`, `./token` and `./bearer` are replaced by `vault-origin-rule` (`vaultOriginOf`), `./recordPlane`, `result-total` (`readResultTotal`, `ResultTotal`) and `lws-session-bridge` (`NotSignedInError`, `tokenManager`, `bearerHeaderFor`);
3. in `attributeFind.ts` the imports `./config`, `./dpop` and `./token` are replaced by `base-origin` and `lws-session-bridge`, and the default of `origin` (line 41) `BASE_ORIGIN` is `baseOrigin()`, read when the function is called;
4. in `planRequestLimit.ts` the import of `MAX_PARALLEL_DEREFERENCES` (line 6) is `./mapWithConcurrency` and not `./heldTypes`;
5. **the method of a signed request** (the one change in what the code does): in `lwsReadAuth` (`vaultSets.ts` line 64) `bearerHeaderFor(url)` is `bearerHeaderFor(url, method)`. A DPoP proof names the HTTP method, and the app's bearer token did not. `method` is the request's own (`lwsReadFetch` upper-cases `init.method`, default `GET`; `listVaultRecordsPage` and `listVaultFilesPage` send `GET`), so for every call the unit makes the value is `"GET"`, the default; the change matters only to a caller of `lwsReadFetch` that sends another method. This is the only `bearerHeaderFor` in `vaultSets.ts`. The other is `search.ts` line 93 (`authHeader`), unchanged: its one caller sends `GET` (line 232) and the default is `GET`. Every other signed call (`dpopReadAuth("GET", url)` in `attributeFind.ts` and `vaultSets.ts`) already names its method;
6. comments that name a host are reworded, and `BASE_ORIGIN` in a comment reads `baseOrigin()`; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, not shipped): the app's mocks of `./token` and `./dpop` are a fake `LwsAuthHost` set with `setLwsAuth`, the environment stubs are settings, and the hosts are `example.test` hosts. Ported: `vaultSets.test.ts` 5 of 18 (the `listVaultFilesPage` block), `vaultSets.admitRelationRow.c214.test.ts` (all 8), `vaultSets.endedLifecycle.c199.test.ts` (3), `vaultSets.served.f2.test.ts` (3), `search.test.ts` (all 7 tests that run), `searchCursorPaging.c161.test.ts` (4), `attributeFind.origin.d8.test.ts` (3; its check of the proof's `htu` host belongs to the replaced DPoP module), `attributeFindPaging.vaultit.test.ts` (6). New: `recordPlane.test.ts` (19), `planRequestLimit.test.ts` (5), `mapWithConcurrency.test.ts` (8), `vaultSets.reads.test.ts` (17: the credential, its method and the DPoP fallback of `lwsReadFetch`, the refusals of the page readers and `findByAttribute`), `lwsVaultSets.test.ts` (3: the export list). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: from `vaultSets.test.ts` the other 13 (they test `listVaultRecords`, `isNonGraphNodeEntity` and `normalizeTypeUri`, none taken here); `vaultSets.censusDoorProbe.test.ts` and `vaultSets.heldTypes.test.ts` (the census, not taken); `heldTypes.test.ts` and `vocabCatalog.nodeTypeNames.test.ts` (not taken); the live block of `search.test.ts` and `searchWireShape.live.test.ts` (they need a running server and skip without one); `search.fTextWithType.test.ts` (9) and `searchVaultWordsNotCatalogue.c161.test.ts` (12) (they run `runSearch` and `fanoutSearch` of the hooks and mock `vocabCatalog`); `searchSubstringFabrication.c150qa.test.ts` (it tests `workingSetFacets`); `planSearch.vaultit.test.ts` (17; all call `searchPlanRecords`, `wouldLoop` or the stakeholder finders, which are not here); `workingSetLoadVaults.test.ts` and `workingSetLoadVaults.nested.sp1r4.test.tsx` (their subject is the census and the working set, not these symbols); `resultTotal.test.ts` and `narrowTotalContract.test.ts` (they test the peers, which have their own).
