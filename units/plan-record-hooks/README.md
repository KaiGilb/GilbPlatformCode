# plan-record-hooks

The vault's records as a list a screen can scroll, and the three changes a person makes to one (create, retype, delete), each shown at once and written in the background, with the device's working-set replica kept in step.

## What this is

The vault's records as a list a screen can scroll, and the three changes a person makes to one (create, retype, delete), each shown at once and written in the background, with the device's working-set replica kept in step.

React hooks over one `QueryClient` (the app's `@tanstack/react-query`). A list is an infinite query; a change is a mutation that edits the list's cache first (so the grid draws at once), then writes in the background, and on success swaps the optimistic stand-in for the vault's own answer; on error it puts the cache back. The vault is always the source of truth; the cache and the device's working-set replica (`working-set-store`) are transient mirrors.

- `useRecords(vaultId, lifecycle?)`: the vault's records, `"live"` (default) or `"ended"`, as an infinite query keyed by `recordsKey(vaultId, lifecycle)` (from `record-cache-kit`). The live list reads the platform's full rows (`?include=body&limit=`) 40 on the first page, 100 on the later ones, hands them on 20 at a time (`LIST_SLICE_ROWS`), walks them by the door's `nextOffset`, and puts every document into the record reads' cache (`seedRecordReads`), so a face, a detail pane or a search hit reads nothing of its own. Names to ask for come from the vault's census (`vault-type-census`), with the previous rows' types and the device's stored types as a second leg, and the catalogue sweep when the platform serves no census. Answers `{ data, total, rowsRead, typeCensus, bounded, ...query }`: `bounded` is false when the app knows it did not ask the vault everything, and an empty list under `bounded` is not "No records yet". It prefetches pages until `RECORDS_PREFETCH_KEPT_CAP` (40) rows are kept or `RECORDS_PREFETCH_ROWS_CAP` (200) rows were sent.
- `useCreateRecord(vaultId)`: the record is added to the list at once under a temporary id, `createRecord` writes it into THAT vault, the canonical row (the id and ETag the vault minted, and the vault's own framed `@id`, asked for after the create) replaces the stand-in, the id is marked freshly created, the device store is told, and every multi-vault snapshot is refreshed. On error the stand-in is removed. `createWiring(facts, nameField, nameOnly?)` is the facts a create writes: the name is copied to the label and the title, unless `nameOnly`.
- `useRetypeRecord(vaultId)`: the record's type is changed by a PUT of the same id with the new type, bound to the ETag in hand. A 412 (or no ETag) reads the record as stored now; if nothing in it was saved elsewhere since the card read it (`keysSavedElsewhere`) the retype is sent once more with the card's facts as they are now, otherwise nothing is written and the mutation fails with `RetypeChangedElsewhereError`, which carries the record as stored. Never `If-Match: *`.
- `useDeleteRecord(vaultId)`: the row is removed at once; `DELETE` goes to the vault that listed it (`entityUri`, else `vaultId`); with `ifMatch` the delete is conditional. On error the row is put back at the place it had. The record's page link and device-store entry are forgotten, and the ended list is refreshed. Runs under `RECORD_DELETE_KEY`; `watchRecordDeletes(qc)` is the one watcher of that key per client (`pending()`, `subscribe(listener)`), and puts a landed delete into the session's deleted list (`stakeholder-list-state`).
- `markFreshlyCreated(id)`, `isFreshlyCreated(id)`: a time window of 60 s (not a one-shot) in which a just-minted id keeps its row in the list across a refetch and opens focused.
- `refreshMultiVaultLists(qc)`, `RECORDS_SNAPSHOT_KEY_HEAD`, `isRecordDeleteKey(key)`, `LIST_FRESH_MS` (15 s), the types `RecordDeleteWatch`, `RecordDeleteStep`, `DeleteRecordVars`.
- `typeFacetKey(typeUriOrId)`: how a type is named in a facet (the registry id when the registry knows the type, else the bare name, lower-cased). The provider must hand it to the `type-key` unit with `setTypeKey(typeFacetKey)`: the unit's default key differs wherever the registry knows aliases. `matchWorkingSetQuery(items, query)`: the text match over loaded holdings.
- `heldVaultIds(vaults)`, `canReadVault(vault)`, the types `ReachableVault` (with the optional `shortName` and `shortNameKnown` since 0.2.0), `ReachableVaultParent`, `VaultMode`: the vaults a person holds (the read mode), once each, in order.
- `useVaultFilesMulti(vaultIds, lifecycle?)`, `vaultFilesKey`, `VAULT_FILES_KEY_ROOT`, the types `VaultFile`, `VaultFileWithSource`: the file sets of several vaults, merged, newest first, each row tagged with `sourceVaultId`.
- `keysSavedElsewhere(stored, read, own)`: the keys whose stored value was saved elsewhere since the card read the record.

The unit holds module state: `freshlyCreatedIds` (the fresh-create window), `fullPageReads` (the full-row pages the live lists read, at most 64 kept), `listHeads` (the lists' feed positions) and `deleteWatches` (a `WeakMap` from the query client to its delete watcher). An app must have ONE copy of it. It is a peer of the stakeholder IO unit that follows it. Its peers are `base-record` (the type `GridRecord`), `lws-records` (`createRecord`, `readRecord`, `retypeRecord`, `deleteRecord`, `recordFromServed`, `factsAsServed`, `writeSource`, `withTypeUri`, `RecordConflictError`; 0.3.0), `lws-vault-sets` (`listVaultRecordsPage`, `listVaultHeldTypes`, `lwsReadFetch`, `listVaultFiles`, `mapWithConcurrency`, `typeLocalName`, `isUiPrefsRecord`; 0.2.0), `record-cache-kit` (the keys, `setList`, `upsert`, `setRecordReads`, `flattenRecordPages`, `entityDisplayName`, `withCanonicalLabel`; 0.3.0), `record-sync` (`headRecordState`, `RECORD_PAGE_LIMIT`), `record-types`, `stakeholder-list-state`, `vault-origin-rule` (`vaultOriginOf`), `vault-type-census` and `working-set-store` (`rememberRecord`, `forgetRecord`, `listRecordRefs`), and the third-party `@tanstack/react-query` `^5.101.2` and `react` `^19`.

### Changes in 0.2.0

Re-synced from `KaiGilb/GilbApp` commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6` (production moved on from `dcfc18b3`). The one change in code the unit takes: `ReachableVault` gains two optional fields after `isLandingVault`, `shortName?: string | null` (the vault's registered short name, `podName` on the vault list; null with `shortNameKnown` true means none is registered, null with the flag false or absent means the register was not read) and `shortNameKnown?: boolean` (true only when the row read the name register). Both are optional, so every vault row built for 0.1.0 is still a `ReachableVault`; nothing is exported or removed. Source `types.ts` lines 140-187 are now 140-199 (the interface); `canReadVault` (old 194-198) is unchanged at 218-222.

- Not taken: `knownVaultShortName` (source `types.ts` lines 201-211, new in the source). It reads the two new fields, but no unit reaches it (it is used by the app's record and file detail screens), so it stays in the app (RuleGhsCutSymbolLevel). A host that wants it writes the six lines itself.
- The comment of the two fields is copied; the one line in it that credits a pull request is left out.
- `recordHooks.ts` changed in production at source lines 2846-2863 (the added-by marks) and 2898-2901 (two lines in `findKnownRecordInCache`); no range of this unit reaches them (its last `recordHooks.ts` range ends at 2695), so every range is the same text; `drift.mjs` says unchanged.
- The peer range of `record-cache-kit` is `^0.3.0` (it now names a nameless record by its main tag; this unit calls only `entityDisplayName`, `withCanonicalLabel` and the cache helpers, none of which changed for it). `record-sync` `^0.2.0` was already so.
- Test: one new test in `src/small.test.ts` (the unit has 194): a vault row with and without the two fields is accepted by `heldVaultIds` and `canReadVault`, and the plain row has no `shortName` key. The fields are types only, so the test's killer is the type check (`npm run typecheck`): taking either field out of the interface, or making `shortNameKnown` required, fails it; the test run alone does not see that.

## What this is not

- Not a host seam: there is no host object. Every call that leaves the unit goes to a peer, which signs it through the auth seam (`lws-session-bridge`).
- Not the whole of the app's `recordHooks.ts`. The file is cut by the rule of RuleGhsSplitFile (see "How `recordHooks.ts` was split"); not reached by any host member, and so in no unit: `useUpdateRecord`, `useCreateByTypeName`, `useRecordsMulti`, `snapshotVaultRecords`, `useRecord`, `useRecordOnDemand`, `useCachedRecord`, `useRecordsBeingDeleted`, `syncHeldLists`, `rowDocOf`, `heldRecordOf`, the carrier-rename error and the tag-carrier constants, and the rest of the 717 code lines the plan lists as "not reached".
- Not the whole of `fileHooks.ts`, `workingSetFacets.ts`, `workingSetLoadVaults.ts`, `savedElsewhere.ts` and `types.ts`: only what `useVaultFilesMulti`, `typeFacetKey`, `matchWorkingSetQuery`, `heldVaultIds` and `keysSavedElsewhere` reach. Not here: `useVaultFiles`, `useRecordFiles`, the attach, detach and register hooks, `intersectWorkingSet`, `typeOptionsByFrequency`, `contentVaultIds`, `expandWithDescendants`, `rebaseOnStored`, `canWriteVault`, `SessionReachableVault` and the rest.
- Not a sign-in and not a store: the hooks keep nothing but the module state above.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-record-hooks`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/plan-record-hooks` prints:

```sh
npm install <path-to-the-library>/units/plan-record-hooks
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-vault-sets` does. `@tanstack/react-query` is a peer at run time: the hooks and the cache helpers they share with `record-cache-kit` must see ONE copy of it.

## Examples

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import { useCreateRecord, useDeleteRecord, useRecords, typeFacetKey } from "@kaigilb/gilbplatformcode-plan-record-hooks";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
setTermOrigin("https://ontology.platform.example.test");
setTypeKey(typeFacetKey);
// (and setLwsAuth(...) from lws-session-bridge)

function Notes({ vault }: { vault: string }) {
  const list = useRecords(vault); // { data, total, bounded, fetchNextPage, hasNextPage, ... }
  const create = useCreateRecord(vault);
  const remove = useDeleteRecord(vault);
  // create.mutate({ type: noteSpec, facts: { title: "Hello" } }); remove.mutate({ id, entityUri });
  return <ul>{list.data.map((r) => <li key={r.id}>{r.facts.title}</li>)}</ul>;
}

export const App = () => <QueryClientProvider client={new QueryClient()}><Notes vault="https://kai.platform.example.test/base" /></QueryClientProvider>;
```

## What the host must supply

- The settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` from `base-origin`; `setTermOrigin(...)` from `term-origin`; `setLwsAuth(host)` from `lws-session-bridge`. Optionally `setOntologyApiOriginRaw` and `setVocabTypeBatchRevisions` (`base-origin` 0.2.0) for the census.
- `setTypeKey(typeFacetKey)` for the `type-key` unit, when it is used.
- One `QueryClient` per app, given to a `QueryClientProvider`. The app's own client was made with `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`; the list overrides `staleTime` to `LIST_FRESH_MS` (15 s) and the file sets to 5 s.
- A browser with IndexedDB for `working-set-store` (or a test double).

## Module state

An app must have ONE copy of this unit (see above): two copies would each keep their own fresh-create window, their own full-row pages and feed positions, and their own delete watchers, and a delete made through one would not be seen through the other.

## Do not

- Do not simplify `useRecords` or `hydrateRecordsPage`. The census leg, the chunking, the bounded concurrency, the prune and the recovery are each the answer to a measured defect (a blank grid over 51,228 rows; a storm of 140 requests a second).
- Do not send `If-Match: *` from a retype, and do not send the old facts under a newer ETag.
- Do not compose a record's address from its vault (`<vault>/e/<id>`): ask the vault, or leave it unset.
- Do not call `watchRecordDeletes` per render with a new client: it is made once per client and kept.
- Do not export `hydrateRecordsPage` to an app: it is public in this unit's source only so that the ported tests can reach it; the package index does not export it.

## Wrong readings

Defects and quirks found while taking the code. Kept as the app has them, listed for the owner.

- "The IndexedDB prune runs on every page." It runs on the first page only, and only when that page is the whole authorized set (`offset === 0 && page.complete`). A first page of a long list forgets nothing. (This is the quirk the seam map names for `recordHooks.ts:584`.)
- "The working set's `podId` and `vaultId` agree." They do not (`working-set-store`'s own note); `rememberRecord({ id, vaultId, typeUri, updatedAt })` is called with the vault namespace, as the app does.
- "`listHeads` forgets a list that is gone." It does not: an entry is replaced when the list's first page is read again and dropped only when the platform has no feed; the map grows with the number of different lists.
- "A failing address lookup fails the create." It does not: `createdEntityUri` answers `undefined` and the row lands without an address (the known edge in the create's comment).
- "A record created under a type the registry does not know gets a label." `createWiring` copies the name into the label and the title only when the create is not name-only; an `a:name`-only create carries neither.
- Two tests of the app fail in the app: `recordHooks.gridTypeFind.test.ts` "source F-LIVEs held type names and F-OPENs held ids whose type-chunk missed" and "source F-LIVEs listRecordRefs type names and F-OPENs those stored ids when prevFlat is empty" read the source of `recordHooks.ts` and expect it NOT to match `/listVaultRecordsPage\\(\\s*vaultId\\s*,\\s*\\[\\s*\\]/`, but the ended-lifecycle read of `hydrateRecordsPage` is `listVaultRecordsPage(vaultId, [], offset, { lifecycle: "ended" })`, which matches. Left out of the port, reported to the owner. The app's create test also depends on a resolved `readRecord` left by an earlier test of the same file; the port sets it in its `beforeEach`.

## How `recordHooks.ts` was split

The app's `recordHooks.ts` (2,965 lines, 1,713 lines of code once comments are left out) is cut between `record-cache-kit` (0.1.0) and this unit by the rule of RuleGhsSplitFile: a symbol that two or more of the new units use goes to the shared kit; one that only one uses goes into that unit; one no host member reaches is in neither ("not reached"). The plan is in the README of `record-cache-kit`. In code lines: `record-cache-kit` 113, `base-record` 5, this unit 823, not reached 717, the import block (a named seam) 55. The code lines of this unit's `src/recordHooks.ts`, apart from its import block and one `export` word (below), equal, in order, the 823 code lines of the statements the plan gives it. The split proof (checked by script against the same plan as the kit's) prints:

```
(4b) plan-record-hooks: 823 code lines of recordHooks.ts, equal to the plan's, in order; named seams: 1 `export` word (hydrateRecordsPage), the import block
SPLIT PROOF: PASS
```

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6` (0.1.0 came from `dcfc18b33e9f091cf22d6ae06906839ec5855e67`; only the `types.ts` ranges changed their numbers), copied by script, symbol by symbol (the reached ones only, found with a symbol tracer that stops at the symbols of merged units):

- `src/lib/base/recordHooks.ts` to `src/recordHooks.ts`: lines 151-156, 162-171, 244-249, 251-252, 254-255, 256-257, 259-292, 294-309, 311-322, 323, 325-329, 334-339, 400-419, 421-422, 445-449, 469-490, 491, 493-498, 500-504, 506-515, 530-532, 555-590, 592-631, 633-662, 664-670, 672-688, 690-707, 709-822, 824-1281, 1306-1315, 1316-1318, 1320-1434, 1889-1924, 1926-1946, 1948-2015, 2358-2370, 2372-2530, 2532-2537, 2539-2545, 2547-2548, 2550-2562, 2564, 2566-2569, 2571-2603, 2633-2695 (the statements the split plan gives to this unit: `RECORDS_SNAPSHOT_KEY_HEAD`, `refreshMultiVaultLists`, `LIST_SLICE_ROWS`, `ListPageParam`, `fullPageReads`, `FULL_PAGE_READS_KEPT`, `listSlice`, `FullRowsOpts`, `ListHead`, `listHeads`, `LIST_FRESH_MS`, `keepListHead`, `seedRecordReads`, `PAGE_DOC_HEAD`, `HELD_RECORD_FRESH_MS`, `FRESH_WINDOW_MS`, `freshlyCreatedIds`, `sweepFreshlyCreated`, `markFreshlyCreated`, `isFreshlyCreated`, `newTempId`, `LWS_RECORDS_MAX_TYPES`, `LWS_RECORDS_MAX_PARALLEL_PAGES`, `DOOR_TYPE_NAME`, `chunkNamedTypes`, `heldTypeNames`, `storedTypeNames`, `listVaultRecordsPageAllNamedTypes`, `hydrateRecordsPage`, `RECORDS_PREFETCH_KEPT_CAP`, `RECORDS_PREFETCH_ROWS_CAP`, `useRecords`, `createdEntityUri`, `createWiring`, `useCreateRecord`, `RetypeChangedElsewhereError`, `useRetypeRecord`, `RECORD_DELETE_KEY`, `DeleteRecordVars`, `RecordDeleteStep`, `RecordDeleteWatch`, `deleteWatches`, `isRecordDeleteKey`, `watchRecordDeletes`, `useDeleteRecord`);
- `src/lib/base/savedElsewhere.ts` to `src/savedElsewhere.ts`: lines 16-38 (`val`, `keysSavedElsewhere`; not taken: `rebaseOnStored`);
- `src/lib/base/workingSetFacets.ts` to `src/workingSetFacets.ts`: lines 43-54, 68-80, 81-101 (`FacetableItem`, `typeFacetKey`, `matchWorkingSetQuery`);
- `src/lib/base/types.ts` to `src/reachableVault.ts`: lines 121-131, 132-139, 140-199, 218-222 (`VaultMode`, `ReachableVaultParent`, `ReachableVault`, `canReadVault`; not taken: `knownVaultShortName` (201-211));
- `src/lib/base/workingSetLoadVaults.ts` to `src/workingSetLoadVaults.ts`: lines 37-53 (`heldVaultIds`);
- `src/lib/base/fileHooks.ts` to `src/fileHooks.ts`: lines 42-75, 76-78, 79-84, 95-117, 135-137, 138-177 (`VaultFile`, `VAULT_FILES_KEY_ROOT`, `vaultFilesKey`, `hydrateVaultFiles`, `VaultFileWithSource`, `useVaultFilesMulti`).

**Dynamic imports in the files taken: none.** The tracer does not follow `import()`, so every file taken was also searched with `grep "import("`: `recordHooks.ts`, `fileHooks.ts`, `workingSetFacets.ts`, `workingSetLoadVaults.ts`, `savedElsewhere.ts` and `types.ts` have none.

**Merged units compared with the app's functions (each reached symbol, comments stripped) and taken as peers or not.**

- `lws-records` (0.3.0): `readRecord`, `createRecord`, `recordFromServed`, `factsAsServed`, `writeSource`, `RecordConflictError` are equal; `retypeRecord`, `deleteRecord`, `withTypeUri` are the 0.3.0 additions (the first two with the method handed to the credential seam). Peer.
- `lws-vault-sets`: `typeLocalName`, `isUiPrefsRecord`, `listVaultRecordsPage`, `lwsReadFetch`, `idFromUri`, `listVaultFiles`, `mapWithConcurrency` are equal. Peer.
- `working-set-store`: `rememberRecord`, `forgetRecord`, `listRecordRefs` are equal. Peer.
- `record-cache-kit` (0.3.0): `recordsKey`, `putRecordInCaches` and `entityDisplayName` are equal (`entityDisplayName` since 0.3.0 only: it takes the optional `mainTag` the app's takes); `setList`, `upsert`, `flattenRecordPages` differ only by the word `export` (its named change). Peer.
- `record-types`: `normalizeTypeUri` and `typeUriForVaultNamespace` are equal; `resolveType` differs only in the registry getter (that unit's named change). Peer.
- `vault-origin-rule`: `vaultOriginOf` differs only in `baseOrigin()` for `BASE_ORIGIN` (its named change). Peer.
- `base-record`: `GridRecord` is equal. Peer (a type).
- `record-sync` (`gilb-stakeholders`' `headRecordState`, `RECORD_PAGE_LIMIT`, `RecordSyncState`): the unit stands in for the private package. Peer.
- `vault-list` is a FALSE FRIEND of `types.ts`'s `canReadVault`: its version reads `(vault.modes ?? [])` and takes a structural type; the app's reads `vault.modes` of a `ReachableVault`. Not used; the app's is taken.
- `entity-name`'s `withCanonicalLabel` differs from the app's (local names), so it is not used (see `record-cache-kit` 0.2.0).

Named changes, and only these:

1. in `recordHooks.ts` the imports are replaced by imports of the peers listed above and of this unit's own `./savedElsewhere` and `./workingSetFacets`; `fileHooks.ts` imports `lws-vault-sets`; `workingSetFacets.ts` imports `record-types`; `savedElsewhere.ts` imports the type `RecordFacts` from `lws-records`; `workingSetLoadVaults.ts` imports `./reachableVault`. `gilb-stakeholders` (`headRecordState`, `RECORD_PAGE_LIMIT`, `RecordSyncState`) is `record-sync`;
2. in `recordHooks.ts` line 880 (source) `async function hydrateRecordsPage(` is `export async function hydrateRecordsPage(`: a test seam, standing in for the app's `export const __hydrateRecordsPageForTest = hydrateRecordsPage` (line 1288, which the plan gives to "not reached"). The word is the one seam in the file; the split proof lists it. The package index does not export it;
3. comments: the long notes (the freshly-created window, the page hydration and its census, the in-flight bound and the measurement behind it, the token grammar, the retype's and the delete's rulings, the rollback) are rewritten shorter with the same facts; internal cycle, ticket and agent tags, names and hosts are removed from the others; no code changed;
4. since 0.2.0, in `reachableVault.ts` the comment of `shortName` / `shortNameKnown` leaves out its credit line (a pull request); `knownVaultShortName` is not copied (see "Changes in 0.2.0");
5. in `reachableVault.ts`, `workingSetFacets.ts`, `workingSetLoadVaults.ts`, `savedElsewhere.ts` and `fileHooks.ts` only the imports and the comments differ from the source ranges.

`src/index.ts` is new. Non-GET `bearerHeaderFor` calls in the files taken: none (the writes go through `lws-records`, whose `retypeRecord` and `deleteRecord` pass their method). Tests (`src/*.test.ts` and `.tsx`; shared set-up in `test/support.ts`, not shipped): see below.

Ported (same inputs and expectations; the app's mocks of its own modules are mocks of the peers' package names, the two census modules are one package here so one mock serves both, hosts are `example.test` hosts, and `__hydrateRecordsPageForTest` is `hydrateRecordsPage`): 

`recordHooks.census.test.ts` (8, all of `recordHooks.census.test.ts`), `recordHooks.chosenTypes.test.ts` (23, all), `recordHooks.declareDropped.test.ts` (4, all), `recordHooks.endedNodes.test.ts` (3, all), `recordHooks.gridTypeFind.test.ts` (18 of 20), `recordHooks.opaqueCarry.test.ts` (3, all), `recordHooks.wRetype.test.tsx` (8, all), `recordHooks.test.tsx` (4 of 7: the delete and create blocks), `recordHooks.r6.test.tsx` (1, all; the app's `isDeletedLinkedRecord` is `deletedLinkedRecords().has`), `recordHooks.sp1b.test.tsx` (5 of 19), `recordHooks.s129.test.tsx` (1 of 2), `savedElsewhere.test.ts` (5 of 10) and `workingSetFacets.test.ts` (2 of 24): 85 tests. Changes in the ported files, all in test set-up: the platform settings are set in `beforeEach` (the app's tests ran against a build-time origin); `RECORD_TYPE_NAMES` (a hand-kept list in the app, not taken) is the registry's type names; `recordsKey` is imported from `record-cache-kit`; the app's `heldRecordOf` (not taken) is a six-line helper in the `sp1b` file; the tests that read the app's source file read this unit's `src/recordHooks.ts`; the create test's `readRecord` default is set in its `beforeEach` (see "Wrong readings").

New (every export pinned, and every mutant of the hooks' behaviour that the ported tests did not kill, each killed or listed below): `hydrate.behaviour.test.ts` (the chunks of the find, what a first page forgets and keeps, what it shows, the rows the previous page held, the feed positions), `hooks.behaviour.test.tsx` (`useCreateRecord`, `useDeleteRecord`, `watchRecordDeletes`, `useRetypeRecord`, `useRecords`), `small.test.ts` (`typeFacetKey`, `heldVaultIds`, `keysSavedElsewhere`, the fresh-create window, the delete key, `refreshMultiVaultLists`, `seedRecordReads`, `createWiring`), `fileHooks.test.tsx`, `exports.test.ts` and `src/hostAgnostic.test.ts` (the same host-agnostic check test as the other units).

Left out, with reasons: `recordHooks.census.live.test.ts` (1; it needs a live platform door); in `recordHooks.gridTypeFind.test.ts` two tests that fail in the app too (see "Wrong readings"); `recordHooks.orderNotIdentity.test.ts` (5; it tests `sortWorkingSetItems` and `GridRecordWithSource`, not taken); in `recordHooks.test.tsx` the three `useUpdateRecord` tests; in `recordHooks.sp1b.test.tsx` 14 (they test `snapshotVaultRecords`, `useRecordsMulti`, `syncHeldLists`, `rowDocOf` and `heldRecordOf`, not taken) and in `recordHooks.s129.test.tsx` 1 (`syncHeldLists`); `useListedVaultIds.test.tsx` (8; it goes through the app's shell context and router with the app's hook, which is not taken; `heldVaultIds` is tested directly); in `savedElsewhere.test.ts` the five `rebaseOnStored` tests; in `workingSetFacets.test.ts` 22 and in `workingSetFacets.c150qa.test.ts` all (they test `intersectWorkingSet`, `typeOptionsFromCensus` and the sort and param functions, not taken); `workingSetLoadVaults.test.ts` and `workingSetLoadVaults.nested.sp1r4.test.ts` (they test `contentVaultIds`, `expandWithDescendants` and `vaultsUnderAnotherListed`, not taken); `fileHooks.fOpenFramedId.test.tsx` and `fileHooks.selectedFile.c209.test.tsx` (other hooks of `fileHooks.ts`); the tests that render the app's pages through these hooks (`RecordGrid.*`, `OnlineStakeholderCard.*`, `useStakeholderListReader.*`, `RecordGraph.*`, `doorInCacheKey.test.tsx`) go through the app's whole page and are left out.

Mutation checks (89 mutants of `recordHooks.ts`, run with `mutate3.mjs`): 83 of 89 killed (`pilot/b3b/specs/m8-plan-record-hooks.result.txt`). The six that survive are equivalent or not observable from outside the module: marking a fresh id does not sweep the stale ones (the window is checked on every read, so the sweep only frees memory); the bound on the full-row pages kept, the unbounded variant and the variant that keeps a failed read (a memory bound, and a failed read that is kept is always followed by a first-slice read that replaces it); dropping the feed position of a list (`listHeads` is written here and read only by `syncHeldLists`, which is not taken); paging by `last.records.length` for `sent` (equal on the paths the hook reaches, because a live list always pages by slice and an ended page carries no `doorRows`).
