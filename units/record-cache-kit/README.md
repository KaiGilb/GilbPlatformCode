# record-cache-kit

The Plan card's record cache: one writer for a row in every list and read that holds it, the membership finds of a card's lines with their pins and drops, and the picker search, all over one query client.

## What this is

The Plan card's record cache: one writer for a row in every list and read that holds it, the membership finds of a card's lines with their pins and drops, and the picker search, all over one query client.

Every function takes the `QueryClient` it works on (or reads it with `useQueryClient`); the unit holds no client of its own. Four parts:

- **The record lists and record reads** (`recordCaches.ts`, taken from the app's record-hooks file): `recordsKey(vaultId, lifecycle?)` (`["base","records",vault]`, with `"ended"` for the ended list), the heads `RECORD_QUERY_HEAD` (`["base","record"]`) and `RECORDS_QUERY_HEAD` (`["base","records"]`), the page shape `RecordsPage`, `isTempId`, and the writers: `putRecordInCaches(qc, vaultId, row, { insert? })` (a save replaces the row in every live list that already holds it and in every record read of that id, and adds it to none; `insert: true` is a create and adds it first on `vaultId` only), `refreshRecordInCaches(qc, vaultId, { id, entityUri })` (reads the record once and puts it in with `insert: true`). Five helpers the hooks batch needs are public here and private in the app: `flattenRecordPages`, `emptyPage`, `setList`, `upsert`, `setRecordReads`.
- **The row cache of a card** (`planRowCache.ts`): `applyPatch(row, patch, etag, { keepOpaque? })` (the row as it is after a save; a missing ETag is `null`), `liveRow(qc, vaultId, id, fallback)` (the newest of the screen list, the record read and `fallback`), `storePlanRow`, `ensureEtag`, `ensureEtagUnchanged(qc, vaultId, row, sameFor)` and `reconcileAfterConflict`.
- **The finds of a card's lines** (`planFind.ts`): `loadPlanFind`, `usePlanFind` (a hook), `invalidatePlanFind(qc, vaultId, attr, parentId, { members?, afterStale? })`, `prependPlanFind`, `dropPlanFind`, `patchPlanFindRows`, `applyPinsAndDrops`, `readCached`, `pageAttributeIds`, the keys `planFindKey` and `planRecordKey`, `planFindRows`, `PLAN_FIND_PAGE` (100), `PLAN_FIND_CAP` (300) and the type `PlanFind`. The membership is asked with find-by-attribute at the vault's own origin, never from the paged vault list.
- **The picker search** (`planSearch.ts`): `searchPlanRecords(vaultId, text, typeNames, opts?)`, `searchVaults(vaultIds, text, typeNames, opts?)` and `invalidatePlanSearch(qc, vaultId)`, with the types `PlanSearchHit`, `PlanSearchPage`, `PlanSearchOpts`, `VaultSearchOpts`.
- **Shared key prefixes** (`cacheKeys.ts`, new): `STAKEHOLDER_SEARCH_AUTHORITY_KEY` (`["stakeholder-search","authority"]`), `planSearchKey(vaultId)` (`["plan-search", vault]`), `planFindVaultKey(vaultId)` (`["plan-find", vault]`). Each was a literal written at more than one place in the app; each has one definition here. The sites that will use them are listed under "Named changes".

Two files are internal: `entityDisplayName.ts` (the name a picker hit shows, the reached symbols only; since 0.2.0 the package index exports its two functions that the hooks use, `entityDisplayName(facts, opts?)` and `withCanonicalLabel(facts, nameField?)`, the fact map a write should send with `label` filled from the name) and `partyName.ts` (the one constant `PARTY_NAME_FLOOR`, not exported).

## What this is not

- Not the record hooks. `useRecords`, `useCreateRecord`, `useDeleteRecord`, `useRetypeRecord`, `markFreshlyCreated` and what only they reach are the next unit (`plan-record-hooks`), cut from the same source file; see "How `recordHooks.ts` was split".
- Not a network client. The reads go through the peers (`lws-records` for one record, `lws-vault-sets` for a find, a search and a page), which sign them through the auth seam. This unit never forms a header.
- Not a client of its own. No `QueryClient` is made here; the provider of the app owns it.
- Not the whole of the app's three plan files. Not taken, because no host member reaches them: `planFindCapFor`, `PLAN_FIND_CAP_PART_OF`, `planCapSentence`, `planUnreadSentence` (`planFind.ts`); `WRITE_CONFLICT` (`planRowCache.ts`); `PLAN_SEARCH_DEBOUNCE_MS`, `SEARCH_INCOMPLETE_CREATE`, `SEARCH_INCOMPLETE_NONE`, `SEARCH_INCOMPLETE_HITS` (`planSearch.ts`).

### Changes in 0.3.0

A record's MAIN tag is now part of the picker's names. Re-synced from `KaiGilb/GilbApp` commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6` (production moved on from `dcfc18b3`); nothing of 0.2.0 was removed or renamed, and the package index exports the same names.

- `entityDisplayName(facts, opts)`: `EntityDisplayOpts` gains `mainTag?: string | null` (the record's main tag, read from the platform). It is read after `unitTag` and `tag` and before the identity ids, the type's name field and the bridges (`title`, `processName`, `name`): a record that holds a name, a label or a tag keeps it, a blank main tag is ignored, and the main tag is trimmed. The header comment's read order says so (line 12).
- `searchPlanRecords(vault, text, typeNames, opts)`: when `opts.qc` is given, both the empty-box branch and the typed-text branch pass their hits through a new private function `withMainTags`, which asks `fetchMainTagsForRows` of the unit `main-tag` (a direct peer, new in 0.3.0) for the hits whose record holds no name, label or tag. That is one `POST <vault>/base/tag/masters` per vault per 50 such hits, through the client's cache (60 seconds), and a hit that is answered gets `tag` = its main tag and `label` from `entityDisplayName(..., { mainTag })`. Without `opts.qc` nothing is asked and the search is as it was in 0.2.0.
- Not taken: `needsMainTag` (source `entityDisplayName.ts` lines 175-183). It is in `main-tag`, which this unit imports, so a copy here would be a second home; and `main-tag` cannot import it from here without a cycle (`record-cache-kit` imports `main-tag`). Its source range 170-197 is therefore taken as the part that moved, 185-212 (the doc and `displayFriendly`).
- The only code that is not the app's: the import in `planSearch.ts` (source line 12, `./recordTags`) is the peer `@kaigilb/gilbplatformcode-main-tag` (a named change, number 7 below). `scripts/check-host-agnostic.mjs` lists the new peer among the allowed imports. `package.json` gains the peer `main-tag ^0.1.0` and the `file:` dev dependencies the tests need (`main-tag` and its own: `direct-shares`, `folder-part`, `lws-relations`, `ontology-reads`, `plan-kinds`, `platform-fetch`, `record-sync`, `share-refusal`, `tag-client`, `term-origin`). The lock was made with `npm install --package-lock-only`; the version and peers of each linked unit in it were then checked by script against the unit's own `package.json` (none was stale).
- Tests, 18 new (the unit has 181): in `src/entityDisplayName.test.ts` (6): `entityDisplayName({}, {mainTag:"alpha"})` is `"alpha"`; a `unitTag`, `tag`, label or name wins; an email, the type's name field and a bridge lose to it; a blank, null or missing main tag is ignored and a padded one is trimmed; a record with only a `title` shows its main tag (see "Wrong readings"); with no facts the address tail wins. New `src/planSearch.mainTag.test.ts` (12, over a fake `fetch` for the platform, a fresh client each test): the empty-box and typed-text branches, one call and its body, the sort by label then address, a row with a label costs nothing, two hits with the same label are ordered by address, a failed call leaves the hits exactly as they were, no client asks nothing, a repeat search is answered from the cache, and the quirk below.
- Mutants (killed by those tests): the main-tag step removed, moved before the name, moved after the identity ids, not trimmed; either return of `searchPlanRecords` not wrapped; no re-sort, a re-sort when no tag was found, a sort without the address tie-break; `tag` or `label` not taken from the main tag; asking with no facts; the lookup by id instead of address. Three survive and are equivalent: no `!qc` guard (`fetchMainTagsForRows(undefined, …)` throws at `qc.fetchQuery` inside its own `try`, so no request is made and no tag is found, the same answer); no empty-hits guard (an empty list asks nothing and finds nothing); and `|| h.label` (an answered hit always has a non-empty main tag, so its label is never empty).

### Changes in 0.2.0

Taken from the same GilbApp commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, because the record hooks (`plan-record-hooks`) write a record's name into its label. New code, copied by script from `src/lib/base/entityDisplayName.ts`: lines 262-310 (`withCanonicalLabel`), into `src/entityDisplayName.ts`; no code changed, comments checked. The package index now exports `entityDisplayName` and `withCanonicalLabel` (two lines, new). `entity-name`'s `withCanonicalLabel` was compared and is not used: its code lines differ from the app's (local variable names `value` for `v`, three times), so it is a look-alike and not equal. Nothing of 0.1.0 changed. Tests: `src/entityDisplayName.canonicalLabel.test.ts` (7) is ported from `entityDisplayName.test.ts` (the `withCanonicalLabel` block, all 7), with the hosts made `example.test` hosts; new: `src/withCanonicalLabel.test.ts` (8); the export pin lists the two new names. One mutant survives and is equivalent: `factTrim(facts, "title") || v` in the bridge arm equals `v`, because a non-empty title would have been the bridge's first hit.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-cache-kit`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/record-cache-kit` prints:

```sh
npm install <path-to-the-library>/units/record-cache-kit
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-vault-sets` does, because a unit's type check reads its peers' source and a peer does not pass it.

Peers (all library units except the last two): `base-record` (the type `GridRecord`), `description-parts-model` (`asGrid`), `plan-links-model` 0.2.0 (`recordTag`), `main-tag` (`fetchMainTagsForRows`, only when a client is passed to `searchPlanRecords`), `lws-records` (`readRecord`, `recordFromServed`, `isFactStringFaithful`, `BaseRecord`, `MergePatchValue`), `lws-vault-sets` (`pageAllByAttribute`, `findByAttribute`, `planReadLimit`, `searchEntities`, `listVaultRecordsPage`, `mapWithConcurrency`, `MAX_PARALLEL_DEREFERENCES`, `idFromEntityUri`, `typeLocalName`, `UNTYPED_FIND`, `VaultRecordRef`), `vault-origin-rule` (`vaultOriginOf`); `@tanstack/react-query` `^5.101.2` at run time (the unit calls the client and `usePlanFind` calls `useQuery` and `useQueryClient`), and `react` `^19` (react-query's own peer; `usePlanFind` is a hook).

## Examples

```ts
import { QueryClient } from "@tanstack/react-query";
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { liveRow, loadPlanFind, prependPlanFind, putRecordInCaches, recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";

// Once at start-up (the same settings the peers need):
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: "https://platform.example.test/base/auth/session/dpop-token" })));

const qc = new QueryClient();
const vault = "https://kai.platform.example.test/base";
const parent = "https://kai.platform.example.test/base/e/parent";

const find = await loadPlanFind(qc, vault, "a:partOf", "parent", parent); // { rows, total, capped, unread, cap }
prependPlanFind(qc, vault, "a:partOf", "parent", newRow);                 // shown at once, then the find is read again
putRecordInCaches(qc, vault, savedRow);                                   // a save: every list and read that holds the row
const now = liveRow(qc, vault, savedRow.id, savedRow);                     // call it when the click happens, not at render
```

## What the host must supply

- The settings the peers need, once at start-up: `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, and `setLwsAuth(host)` from `lws-session-bridge`. Since 0.3.0 `main-tag` signs its tag reads with that host's write proof (`dpopWriteAuth`); the signing and the origins are used only when a `QueryClient` is passed to `searchPlanRecords`. A search without one asks the platform nothing for tags.
- The query-key contract of `main-tag`: whatever writes tags must invalidate `["main-tag", uri]` and `["main-tags"]` (see that unit's README); a picker search shares those cache entries.
- One `QueryClient` per app, passed to every function (or given to a `QueryClientProvider` for `usePlanFind`). The app's own client was made with `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`; this unit overrides some of these on its own queries (`usePlanFind`: `staleTime: 15_000`, `retry: false`; `readCached` with `fresh`: `staleTime: 15_000`), so those are the values the card's timing was tuned on.
- Nothing else: there is no host object. Every outside call is a call to a peer.

## Module state

An app must have ONE copy of this unit: it keeps three `WeakMap`s keyed by the query client, and two copies would each keep their own pins.

- `pinStore` (`planFind.ts`): the rows `prependPlanFind` pinned, per client, then per `vault\nattribute\nparent`. A pin shows first in that line until the server returns the row (then the server's copy is shown) or `dropPlanFind` removes it.
- `dropStore` (`planFind.ts`): the ids `dropPlanFind` hid, per client and line. A drop is kept while the server still returns the id, and forgotten on the first find the server no longer returns it in.
- `memberScope` (`planFind.ts`): which member records the next re-read of one find must read fresh (a list of entity addresses, or `"all"`). `invalidatePlanFind` sets it; the next `loadPlanFind` of an invalidated find takes it, and takes it only once.

Nothing empties them; the garbage collector does when the client goes. The unit also reaches the module state of its peers: `limits` of `lws-vault-sets` (`planReadLimit(qc)`: one limiter of 6 per client), and the settings of `base-origin` and the session of `lws-session-bridge`. Each of those must also be a single copy.

## How `recordHooks.ts` was split

The app's `recordHooks.ts` (2,965 lines, 1,713 lines of code once comments are left out) is cut between this unit and the next one, `plan-record-hooks`, by the rule of RuleGhsSplitFile: a symbol that two or more of the new units use goes to this shared kit; one that only one uses goes into that unit; one no host member reaches is in neither ("not reached"). The plan is per top-level statement (135 of them); in code lines it is:

| Where | Code lines | What |
|---|---|---|
| this unit (`recordCaches.ts`) | 113 | `recordsKey`, `RECORD_QUERY_HEAD`, `RECORDS_QUERY_HEAD`, `RecordsPage`, `isTempId`, `flattenRecordPages`, `emptyPage`, `putRecordInCaches`, `listsHolding`, `refreshRecordInCaches`, `setList`, `replaceOnly`, `upsert`, `setRecordReads` |
| `base-record` (already a unit) | 5 | `GridRecord` |
| `plan-record-hooks` (next) | 823 | `useRecords` and everything only the four hooks reach, `markFreshlyCreated`, `RECORDS_SNAPSHOT_KEY_HEAD`, `refreshMultiVaultLists`, `deleteWatches` |
| not reached | 717 | for example `useUpdateRecord`, `useCreateByTypeName`, `snapshotVaultRecords`, `recordsSnapshotKey` |
| the import block (a named seam) | 55 | each unit writes its own |

`isTempId` is here because `useRecords` (hooks) and `relationHooks.ts` (the stakeholder unit) both use it. `RECORDS_SNAPSHOT_KEY_HEAD` is not here, although the brief of this unit listed it: only `refreshMultiVaultLists`, which only the create and retype hooks call, reaches it, so the rule puts it with the hooks; `recordsSnapshotKey` is reached by nothing. The code lines of this unit's `recordCaches.ts` equal, in order, the code lines of the statements the plan gives it, apart from five `export` words (below) and the import block.

## Do not

- Do not install a second copy of this unit (see "Module state").
- Do not read `liveRow` once at render and keep the answer. It is a read of the caches at the moment it is called; call it when the click happens. It also **writes**: see "Wrong readings".
- Do not give `putRecordInCaches` a list that is not there and expect a list: a save (`insert` not true) makes none. Only a create does.
- Do not use the entry of `["base","record", id, ...]` as a list of one vault: its fourth part is the origin of the door the address names, not the vault id.

## Wrong readings

- "`liveRow` only reads." It writes when the list row is older than the winner: `putRecordInCaches(qc, vaultId, asGrid(winner))` (`planRowCache.ts`, the last `if`). Kept. A row the card just saved (newer, no ETag) is not replaced by an older row that still has an ETag; and a record read whose ETag differs from the list row's wins whatever the stamps say.
- "`putRecordInCaches` updates every list." It updates the live lists that already hold the row (a key of three parts, the third not `"snapshot"`). An ended list, a snapshot and a list without the row are left alone; and it never adds the row to a list on a save.
- "A cap below the page size cuts the find." `pageAllByAttribute` (in `lws-vault-sets`) stops at a page boundary: `loadPlanFind(..., cap)` with a cap below 100 and a short page returns the whole page and `capped: false`. The app's caps are 300 and 2000, both whole pages. Kept, listed for the owner.
- "`pageAttributeIds(attr, entityUri, ...)` always sends an address." For `a:unitTag` the value is the tag string, and the argument named `entityUri` is that string; wrapping it as `{"@id"}` would find nothing.
- "`readCached(qc, uri, false)` always reads." It returns the cached row whatever its age and reads only when there is none. A row seeded by `prependPlanFind(..., { refresh: false })` is therefore used without a read.
- "`searchPlanRecords` returns a partial list when a vault fails." It throws `Error("Could not search")`, so the picker shows its error line. The partial answer is `searchVaults`'s (`vaultsMissed`).
- "`entityDisplayName` reads `title` before the main tag." It reads the main tag first (the step is before the type's name field and the bridges): a record that holds only a `title` shows its main tag when one is given. `main-tag`'s `needsMainTag` tests only `name`, `label`, `unitTag` and `tag`, so such a record is asked for its main tag, and `refDisplayName` of `entity-ref-value` shows its `title` instead: the readers disagree. Kept as the app has it.
- "`searchPlanRecords` always returns the hits sorted by label." The sort after the main tags runs ONLY when at least one main tag was found (and only when `opts.qc` is given). With none found, the order is the one before: the exact-tag hit stays in front of the search hits. With one found, all hits are sorted by label then address, and the exact-tag hit can lose its front place. Kept; pinned in `planSearch.mainTag.test.ts`.
- "`PARTY_NAME_FLOOR.source` is the app's text." The field is a provenance string that no code reads; its text is reworded here (no host).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6` (0.1.0 and 0.2.0 came from `dcfc18b33e9f091cf22d6ae06906839ec5855e67`; the ranges below are the new line numbers), copied by script, symbol by symbol (the reached ones only, found with a symbol tracer that stops at the symbols of merged units):

- `src/lib/base/recordHooks.ts` to `src/recordCaches.ts`: lines 128-140, 142-148, 149, 194-242, 464-467, 1290-1304, 1796-1799, 1801-1819, 1821-1832, 1834-1849, 1851-1868, 1869-1876, 1878-1887, 2963-2971 (`recordsKey`, `RECORD_QUERY_HEAD`, `RECORDS_QUERY_HEAD`, `RecordsPage`, `isTempId`, `flattenRecordPages`, `emptyPage`, `putRecordInCaches`, `listsHolding`, `refreshRecordInCaches`, `setList`, `replaceOnly`, `upsert`, `setRecordReads` (the statements the split plan gives to this unit));
- `src/lib/base/planRowCache.ts` to `src/planRowCache.ts`: lines 1-2, 17, 19-28, 30-70, 72-75, 77-83, 85-93, 95-111, 113-124, 126-139, 144-159, 161-170 (`PlanRowPatch`, `editorString`, `applyPatch`, `stamped`, `newer`, `recordRead`, `liveRow`, `storePlanRow`, `ensureEtag`, `ensureEtagUnchanged`, `reconcileAfterConflict`; not taken: `WRITE_CONFLICT` (lines 141-142));
- `src/lib/base/planFind.ts` to `src/planFind.ts`: lines 1-3, 13, 15-16, 26-33, 35-37, 47-50, 52-55, 57-60, 62-64, 66-70, 72-76, 78-102, 104-106, 108-112, 114-122, 124-136, 138-161, 163-170, 172-176, 178-185, 187-196, 198-211, 213-259, 261-284, 286-302, 304-307, 309-335, 337-362, 364-382 (everything except `PLAN_FIND_CAP_PART_OF` (18-19), `planFindCapFor` (21-24), `planCapSentence` (39-41) and `planUnreadSentence` (43-45));
- `src/lib/base/planSearch.ts` to `src/planSearch.ts`: lines 1-4, 19-20, 25-28, 40-77, 79-88, 90-98, 100-116, 118-135, 137-143, 145-150, 152-220, 222-270, 272-276, 278-304, 306-313 (`HIT_CAP`, `LIST_LIMIT`, `invalidatePlanSearch`, the types, `uniqueIds`, `hitOf`, `withMainTags` (100-116, new in 0.3.0), `listedRow`, `searchVaults`, `searchPlanRecords`, `exactTagText`, `readExactTag`, `mergeExactHit`; not taken: `PLAN_SEARCH_DEBOUNCE_MS` (22-23) and the three `SEARCH_INCOMPLETE_*` constants (30-38));
- `src/lib/base/entityDisplayName.ts` to `src/entityDisplayName.ts`: lines 1-18, 21-22, 24-28, 30-42, 44-45, 47-53, 155-165, 167-173, 185-212, 214-278, and since 0.2.0 280-328 (the header comment and `CANONICAL_DISPLAY_SLUG`, `MASTER_TAG_SLUGS`, `IDENTITY_DISPLAY_SLUGS`, `BRIDGE_SLUGS`, `FILE_NAME_SLUG`, `EntityDisplayOpts`, `factTrim`, `displayFriendly`, `entityDisplayName`, and `withCanonicalLabel`; not taken: `TAG_CARRIER_SPELLINGS`, `openTypeNameSlug`, and since 0.3.0 `needsMainTag` (175-183); `withCanonicalLabel` since 0.2.0);
- `src/lib/base/partyName.ts` to `src/partyName.ts`: lines 21-38 (`PARTY_NAME_FLOOR` only (the file's `gilb-stakeholders` import and everything else in it are not taken)).

**Dynamic imports in the files taken: none.** The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`: `planRowCache.ts`, `planFind.ts`, `planSearch.ts`, `entityDisplayName.ts`, `partyName.ts` and the whole of `recordHooks.ts` have none.

**Merged units compared with the app's functions (each reached symbol, comments stripped, whitespace collapsed) and taken as peers or not.**

- `lws-records`: `readRecord`, `recordFromServed`, `isFactStringFaithful`, `BaseRecord`, `MergePatchValue` are equal. Peer.
- `lws-vault-sets`: `planReadLimit`, `pageAllByAttribute`, `idFromEntityUri`, `searchEntities`, `UNTYPED_FIND`, `mapWithConcurrency`, `MAX_PARALLEL_DEREFERENCES`, `typeLocalName`, `VaultRecordRef` and `listVaultRecordsPage` are equal; `findByAttribute` differs only in the default of `origin` (`baseOrigin()` for `BASE_ORIGIN`, that unit's named change). Peer.
- `vault-origin-rule`: `vaultOriginOf` differs only in `baseOrigin()` for `BASE_ORIGIN` (its named change). Peer. `units/vault-origin` is a false friend (the seam map says why) and is not used.
- `base-record`: `GridRecord` is equal. Peer (a type).
- `description-parts-model`: `asGrid` is equal. Peer.
- `plan-links-model` 0.2.0: `recordTag(facts, mainTag?)` is equal to the app's, comments stripped. Peer (`^0.2.0`; 0.1.0 has no `mainTag` argument). `record-cache-kit` calls it with the main tag in `withMainTags`.
- `main-tag` 0.1.0: `fetchMainTagsForRows` is the app's function (`recordTags.ts`), taken as a unit of its own (new in the 9a602ea7 re-sync). Peer. It holds `needsMainTag` too; see "Changes in 0.3.0".
- `entity-name` is a false friend of `entityDisplayName`: its `entityDisplayName` has no `a:name` first step, its `displayFriendly` takes a path list and its `FILE_NAME_SLUG` is missing. `display-friendly` is a false friend of `displayFriendly` (a second argument, another path rule). `plan-card` and `plan-stakeholder-lines` each keep a private `entityDisplayName.ts` that reads the literal `"name"` where the app reads `PARTY_NAME_FLOOR.name`, and export none of it. So the reached symbols of `entityDisplayName.ts` are taken into this unit, with `PARTY_NAME_FLOOR` from the app's `partyName.ts`.

Named changes, and only these:

1. in each file the imports are replaced by imports of the peers listed above and of this unit's own files: `planRowCache.ts` (`@tanstack/react-query` types; `base-record`; `description-parts-model`; `lws-records`; `./planFind`; `./recordCaches`), `planFind.ts` (`@tanstack/react-query`; `lws-records`; `lws-vault-sets`; `vault-origin-rule`; `./cacheKeys`), `planSearch.ts` (`@tanstack/react-query` type; `lws-records`; `lws-vault-sets`; `plan-links-model`; `vault-origin-rule`; `./cacheKeys`; `./entityDisplayName`), `recordCaches.ts` (`@tanstack/react-query` types; `base-record`; `lws-records`). `entityDisplayName.ts` keeps its one import line (`./partyName`), unchanged;
2. in `recordCaches.ts` the word `export` is added in front of five functions that are private in the app and that the hooks (next unit) use: `flattenRecordPages` (app `recordHooks.ts:1291`), `emptyPage` (`:1797`), `setList` (`:1851`), `upsert` (`:1878`), `setRecordReads` (`:2949`);
3. in `planFind.ts` line 371, `{ queryKey: ["plan-find", vaultId] }` is `{ queryKey: planFindVaultKey(vaultId) }`; in `planSearch.ts` line 26, `queryKey: ["plan-search", planVault]` is `queryKey: planSearchKey(planVault)`. The three definitions are the new file `cacheKeys.ts`. The sites that will take them in the next batches: `STAKEHOLDER_SEARCH_AUTHORITY_KEY` at `PlanStakeholders.tsx:920` and `PlanFunctionForm.tsx:1468`; `planFindVaultKey` at `PlanDescriptionParts.tsx:997`; `planSearchKey` as the head of the key built at `PlanTagLinks.tsx:58` (`["plan-search", vaultId, typeNamesKey, needle]`). The literal `["plan-find", vaultId, attr, recordId]` in `planFindKey` (`planFind.ts:49`) keeps its own text, since it is a four-part key and not the prefix;
4. in `partyName.ts` line 33 the text of the field `source` of `PARTY_NAME_FLOOR` names a host and an internal ruling; it is reworded (`the ontology host's /base/a/name, /base/a/label and /base/a/title (control /base/a/zzqqnotanattr 404); the party-name ruling §1`). No code reads the field;
5. `GridRecord`, `asGrid` and `recordTag` are not copied: they come from `base-record`, `description-parts-model` and `plan-links-model`;
6. comments that name a host, a person or an internal ruling are reworded or shortened; no code changed. Since 0.3.0 this includes the cycle tags ("C214 TA2") on `mainTag` and `withMainTags` and on the header's read order;
7. since 0.3.0, in `planSearch.ts` the source import `import { fetchMainTagsForRows } from "./recordTags";` (line 12) is `import { fetchMainTagsForRows } from "@kaigilb/gilbplatformcode-main-tag";`, a peer. `needsMainTag` (`entityDisplayName.ts` 175-183) is not copied (see "Changes in 0.3.0").

`src/index.ts` and `src/cacheKeys.ts` are new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts` and `test/rows.ts`, not shipped): the app's mocks of `./dpop` and `./token` are a fake `LwsAuthHost` set with `setLwsAuth`, the hosts are `example.test` hosts.

Ported (same inputs and expectations; 30 tests): `planFind.vaultit.test.ts` 6 of 7 (the one left out tests `planUnreadSentence`, which is not taken; the V30 test calls `planFindCapFor(true)` in the app and passes its value, `2000`, here), `planQaTester3.vaultit.test.ts` all 9 (`searchVaults` and the row cache), `planQaTester5.vaultit.test.ts` 4 of 15, kept as `planQaTester5.ensureEtag.vaultit.test.ts` (the `ensureEtagUnchanged` block), `planSearch.vaultit.test.ts` 10 of 17 (`searchPlanRecords` 9 and `invalidatePlanSearch` 1), `planQaTester2.vaultit.test.ts` 1 of 7, kept as `planQaTester2.searchPlanRecords.vaultit.test.ts` (its `searchPlanRecords` test). Each was copied by script with listed replacements: the app's mocks of `./dpop` and `./token` are `setUp()` of a fake `LwsAuthHost`, the hosts are `example.test` hosts, the imports point at the peers.

New (105 tests): `recordCaches.test.ts` (19: the keys, `flattenRecordPages`, `upsert`, `setList`, `putRecordInCaches` save and create, the ended and snapshot lists, `setRecordReads`, `refreshRecordInCaches`), `planRowCache.test.ts` (21: `applyPatch`, `liveRow` read at call time and its catch-up write, `storePlanRow`, `ensureEtag`, `reconcileAfterConflict`), `planFindState.test.ts` (38: pins, drops, the member scope, `patchPlanFindRows`, `readCached`, `pageAttributeIds`, the per-client state), `cacheKeys.test.ts` (3), `entityDisplayName.test.ts` (4), `planSearch.test.ts` (14: `searchVaults`, the list path, the exact-tag path with a client), `usePlanFind.test.tsx` (4, in jsdom), `kitExports.test.ts` (2: the export list). `src/hostAgnostic.test.ts` (13) is the same host-agnostic check test as the other units.

Left out, with reasons: `planLevelRead.vaultit.test.ts` (14; it tests `planFullLevelMove`, `planStep`, `readLevel` and `removalPlan` of `planLevelRead.ts`, which the levels unit takes; the pins and drops it reaches through `readLevel` are tested here directly); the other 11 of `planQaTester5.vaultit.test.ts` and 6 of `planQaTester2.vaultit.test.ts` (they test `planLevelRead.ts`, `planCard.ts`, `planLinks.ts` and `planStakeholders.ts`); the other 7 of `planSearch.vaultit.test.ts` (`wouldLoop`, `findStakeholderRecords`, `findAnyRecords`); `planTagVault.vaultit.test.ts` (9; `tagUsedInVault` and the description-part rules); `doorInCacheKey.test.tsx` (5; it renders `useGraphAssembly`, `useRecord` and `useRelations`); the `RecordDetail.*` and `useValue*` test files that name these functions (they render the app's whole page); the `recordHooks.*` test files (13, 104 `it`; they test the hooks of the next unit).
