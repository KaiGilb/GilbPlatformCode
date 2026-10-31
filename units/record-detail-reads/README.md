# record-detail-reads

Reads one record for a record card, from the page's cache when the list already has it and from its own vault otherwise, and knows which vault holds it.

## What this is

Reads one record for a record card, from the page's cache when the list already has it and from its own vault otherwise, and knows which vault holds it.

A record card is opened with an id and, at best, a hint of where the record lives. This unit answers three questions for it, over the host's one `QueryClient`:

- **Is the record already on hand?** `useCachedRecord(vaultId, id)` is the record as the vault's list (`recordsKey(vaultId)`) holds it, read on every render, and the caller re-renders when that row, whole, carries a NEW ETag (a write that landed, a reconcile). It does not re-render for an optimistic stand-in (it keeps the row's ETag), for a row that comes back label-only (no ETag, or `hydrated: false`), or for another vault's list. `findKnownRecordInCache(qc, id)` and `useKnownRecordInCache(id)` scan every `["base", ...]` query for the record (a search hit, a jump hit, a multi-vault row, a single read) and give `{ door, record }`: the body with the most facts, rebuilt field by field (`opaqueFacts` kept), and the address of the vault that holds it. `cacheRowsOf(data)` is the list of rows one such query might hold (a bare array, `records`, `hits`, the `records` of each infinite page, a single record); it is enumerated, not deep-walked, because the row it finds decides which vault is asked.
- **Which vault holds it?** `useKnownRecordDoor(id)` is the door alone. The order is: the row's own `entityUri`; the found record's `entityUri`; the vault it was found in (`vault`, then `sourceVaultId`); the vault a create in this session wrote it into (`createdInVaultOf`); the card an "Added by" link opened (`addedByCardOf(...).door`); else `null`. `createdInVaultKey(id)` is `["created-in-vault", id]`, `rememberCreatedIn(qc, id, vaultId)` writes it and `createdInVaultOf(qc, id)` reads it (a record no create wrote is `null`). Since 0.2.0 the same store has a neutral pair: `rememberVaultOf(qc, id, vaultId)` and `knownVaultOf(qc, id)`, for a vault a find named for an existing record; the older two delegate to them. `rememberAddedByCard(qc, id, { door, name })` and `addedByCardOf(qc, id)` do the same for the card an "Added by" link opened, whose vault is usually not one the viewer holds. Both entries are held for the session (`gcTime` and `staleTime` infinite) and sit outside `["base"]`, so the scan never mistakes them for a record.
- **What does the vault say?** `useRecord(id, at)` reads the record with `readRecord(id, at)` under the query key `["base", "record", id, vaultOriginOf(at)]`, with a 15 s `staleTime`; it reads nothing for a null id or a temporary id (`temp:...`). `useRecordOnDemand(id, at)` observes the SAME entry and reads nothing by itself; its `fetch()` makes exactly one read and returns the record (`null` = not there, also for a refused read).

## What this is not

- Not the fresh-create window. `markFreshlyCreated`, `isFreshlyCreated`, `consumeFreshlyCreated` and `clearFreshlyCreated` are in `plan-record-hooks` 0.2.1, which holds the one Map; this unit reads none of it and exports none of it. A card that opens a record just created takes them from there.
- Not the save. The card's save, with the version it read, is `record-update`.
- Not the list. `useRecords` and the list's keys are `plan-record-hooks` and `record-cache-kit`; this unit takes `recordsKey`, `flattenRecordPages`, `isTempId` and `RecordsPage` from `record-cache-kit` and reads what the list already put in the cache.
- Not a way to find a record by name. A taking app that has no list passes the vault's door itself; `useCachedRecord` is then `null` and the read of `useRecord` is the source.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-detail-reads`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/record-detail-reads` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/record-detail-reads
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Requests and their servers

It only READS. The one request is `GET /lws/r/<id>` (`useRecord`, `useRecordOnDemand`), made through `readRecord` of `lws-records` at `vaultOriginOf(at)`:

- **Which server answers:** the record's OWN vault node: the authority of the entity address you pass as `at` (the `door`), or the base origin when `at` is `null`. The platform answers `/lws/r/<id>` only from the vault that holds the record, so a record asked at any other host (the base address included) is a 404, which reads as `null`.
- **What `vaultOriginOf` does with it:** an address whose host is a subdomain of the base origin's host (https, no port) is asked at its own origin; any other address, and `null`, falls back to the base origin. So with the platform's apex set as the base origin, every vault's subdomain resolves to its own node (the finding of 2026-10-30); with a vault's own address set as the base origin, a record of another vault is asked at that vault and is not found.
- **What the host must pass:** a door. `onOpenRecord(id)` carries none; take it from `useKnownRecordDoor(id)` (the cache, a create of this session, an "Added by" link) or from the vault the card was opened in. After a reload the caches are empty and the door is `null`: the read goes to the base address and answers `null` for every vault but the base one. The card's entry must take the vault or the entity address.
- It signs through the `lws-records` auth seam, as the other units do (no call of its own).

It writes nothing: no PATCH, no POST. (The save is `record-update`.)

## Examples

```tsx
import { useKnownRecordDoor, useRecord, useCachedRecord } from "@kaigilb/gilbplatformcode-record-detail-reads";

function Card({ id, vaultId }: { id: string; vaultId: string }) {
  const cached = useCachedRecord(vaultId, id);          // the list's row, or null in an app with no list
  const door = useKnownRecordDoor(id);                  // the vault that holds it, from the caches
  const read = useRecord(id, door);                     // the vault's own answer (null = not there)
  const record = read.data ?? cached;
  // ...
}
```

## What the host must supply

- One `QueryClientProvider` above the hooks (the unit makes no client).
- The platform settings the peers need, once at start-up: `setBaseOrigin(...)` (and `setSystemVaultHosts([...])`) from `base-origin`, and the auth seam `setLwsAuth(...)` from `lws-session-bridge`.
- A door for `useRecord` (see "Requests and their servers").

## Module state

None of its own. The only state is in the query client: the entries `["created-in-vault", id]` and `["added-by-card", id]` (held for the session), and the record reads `["base", "record", id, origin]` the hooks fill. The fresh-create window is module state of `plan-record-hooks`, not of this unit. Two installed copies of this unit would share the client's entries, but each copy of `plan-record-hooks` would keep its own window.

## Do not

- Do not call `useRecord` with `null` for a record that lives in a vault other than the base one: it is asked at the base address and answers `null`. Pass the door.
- Do not read `["base", ...]` rows yourself to find a record's vault: `findKnownRecordInCache` enumerates the shapes; a blind walk can match an unrelated `{ id }` and that value decides which vault is asked.
- Do not write `["created-in-vault", id]` or `["added-by-card", id]` by hand; use `rememberCreatedIn` and `rememberAddedByCard`, which also hold them for the session.
- Do not read the list's row once (a getter) in place of `useCachedRecord` for a pane that renders the record: a one-shot read never sees a save made in another pane.

## Wrong readings

- "`useCachedRecord` reads the record from the vault." It reads the vault's LIST cache; in an app with no list it is `null` and `useRecord` is the source.
- "`useKnownRecordDoor` makes a request." It reads caches only. The door can be `null`.
- "`useRecordOnDemand().fetch()` always makes a request." It makes exactly one read when called (it refetches the entry); it never reads before.
- "A record the vault refuses is `null`." Only a 404 is `null`; any other refusal throws (`isError`), and `fetch()` then returns `null`.
- "`createdInVaultOf` knows where a record lives." It knows only where a create made in THIS session wrote it; after a reload it is `null`.
- "A row without an ETag changes the card." It does not: only a whole row with a new ETag does.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/recordHooks.ts` to `src/recordDetailReads.ts`: lines 2696-2961 (`useRecordOnDemand`, `useRecord`, `cacheRowsOf`, `asCachedBaseRecord`, `KnownRecordInCache`, `CREATED_IN_VAULT_HEAD`, `createdInVaultKey`, `rememberCreatedIn`, `ADDED_BY_CARD_HEAD`, `AddedByCard`, `rememberAddedByCard`, `addedByCardOf`, `createdInVaultOf`, `findKnownRecordInCache`, `useKnownRecordInCache`, `useKnownRecordDoor`, `useCachedRecord`, `wholeRowEtag`).

Imports: `readRecord` and `BaseRecord` from `lws-records` 0.4.0; `recordsKey`, `flattenRecordPages`, `isTempId`, `RecordsPage` from `record-cache-kit` 0.3.0 (all five token-equal to the source's); `vaultOriginOf` from `vault-origin-rule` 0.1.0. Named changes, and only these: the imports; the comments that name a cycle, a ticket, an agent, a person, a ruling or a host are reworded with the same facts; no code changed. The comment-stripped file, imports excluded, equals the source's lines 2696-2961 (0 diff words; 711 words each). `src/index.ts` is new.

Not taken, because a unit already holds it: `freshlyCreatedIds` and the window (`plan-record-hooks`), `RECORD_QUERY_HEAD` and `setRecordReads` (`record-cache-kit`). Not taken, because the held card does not read it: `useSelectRecordFromCache` (the source's next function). The provider `stakeholder-card-hosts-gilbplatform` carries a named copy of `CREATED_IN_VAULT_HEAD`, `createdInVaultKey` and `rememberCreatedIn` (its `src/inline.ts`); it compares 0 against this unit's, so there are two definitions of one key until the provider imports them from here.

## Tests

69 tests in 3 files (`npx vitest run`):

- `recordDetailReads.test.tsx` 53: 3 ported (from 2 of the 4 cases of `RecordDetail.searchHitDoor.test.tsx`: the door a search hit is asked at, its negative control at the apex, and the genuine 404) and 50 new, over the real `lws-records`, `record-cache-kit` and `vault-origin-rule` and a fake platform that answers a record only at the host that holds it (`test/support.ts`, a fake `fetch` and a fake auth host, no timers): `useRecord` (the node asked, the key with the origin, no read for a null or temporary id, the 15 s freshness, a refused read), `useRecordOnDemand` (no read by itself, one read on `fetch()`, the same entry, no id, a refused read), `cacheRowsOf` (every shape), `findKnownRecordInCache` (every source of a row, the most facts, `opaqueFacts` kept (the source's `objectFact` O8), the order of the door), `createdInVaultOf` and `rememberCreatedIn`, `rememberAddedByCard` and `addedByCardOf`, `useKnownRecordInCache` and `useKnownRecordDoor`, `useCachedRecord` (the list's row, re-render on a new whole ETag, none otherwise).
- `exports.test.ts` 3: the twelve exports and their arities, and that nothing named `*FreshlyCreated` is exported.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units (it writes to the OS temp directory).

Mutation checks: 38 mutants of `src/recordDetailReads.ts` (the key and the door of both reads, the enabled and stale rules, every shape of `cacheRowsOf`, the rebuild, the scan, the order of the door, the two held entries, the re-render rules of `useCachedRecord`), 37 killed, 1 equivalent: removing the query-hash test in `useCachedRecord`'s subscription changes nothing observable, because the row it reads depends on that one list only, so a change of any other query leaves the ETag it compares unchanged (it is a shortcut, not a rule).

The source's `RecordDetail.searchHitDoor.test.tsx` has 4 cases. Ported as hook tests: the door a search hit is asked at (the case that asks the vault's own door and never the apex) and the genuine 404 that still goes to the vault's door. Left out: the case that renders the record pane and finds the record's name in a box, and the case that checks the sentence "no longer in your vault" is nowhere in the tree; both test the `RecordDetail` screen, which is not in this unit. The source's `objectFact` case O8 (`asCachedBaseRecord` carries `opaqueFacts`) is ported here; its other cases belong to `record-update`, `lws-records` and the search and list units.
