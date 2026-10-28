# main-tag

Gives the main tag of a record, or of a page of records, read from the platform in one call per record and one call per fifty records, kept in one shared cache that a tag change refreshes at once.

## What this is

Gives the main tag of a record, or of a page of records, read from the platform in one call per record and one call per fifty records, kept in one shared cache that a tag change refreshes at once.

The platform makes a record's tag itself, when the record is created; this unit only reads it, and says which records need the read. It is an I/O unit: React hooks over `@tanstack/react-query` and a signed request to the platform. It is used directly by other I/O units and by a ready-made host, never by a card unit (a card gets the hook as a member of its host).

A record's main tag is asked at the record's OWN vault origin (`vaultOriginOf(record address)`, without a trailing slash), never at the apex, with `POST /base/tag/masters` through `tag-client`, signed for each request by `platform-fetch`, and bound at 12 seconds.

- `useMainTag(entityUri)`: one record's main tag, one call. Query key `["main-tag", entityUri]`. Answers `{ tag, known }` (and `reason` when the platform gave one): `{ tag: "alpha", known: true }`, or `{ tag: null, known: false }` when the platform does not state a tag or leaves the record out of its answer. Disabled (no call, no data) for `null`, `undefined` and an address `vaultOfEntity` rejects.
- `useMainTags(entityUris)`: the main tags of a page of records, `{ tags: ReadonlyMap<address, MainTag>, pending }`. The addresses are grouped by vault and cut into groups of fifty: one call per vault per fifty records. Query key `["main-tags", vault, ...sorted addresses]`. A record not yet answered is absent from the map.
- `useMainTagsForRows(rows)`: the same for the rows of a list or pool (`MainTagRow`: `{ entityUri?, facts }`), asking only for the rows that need a tag to be named (`rowsNeedingMainTag`). Answers `ReadonlyMap<address, string>` with the tags the platform STATES (`known` and a non-empty string); a row not in it keeps the name it had. It shares the cache, and the invalidation, of `useMainTags`.
- `fetchMainTagsForRows(qc, rows)`: the same, for code that is not a component (a search), through the query client's cache: `qc.fetchQuery` with the same key and `staleTime: 60_000`. A group that cannot be read gives no tags and does not throw.
- `readMasterTags(vault, entityUris)`: one `tag-client` read of at most 50 records of ONE vault; `[]` makes no call; above 50 it throws `at most 50 records in one read`.
- `tagPlatformFor(entityUri)`: the `PlatformClient` for one record: the record's origin and the signed fetch, bounded by `TAG_READ_BOUND_MS`.
- `vaultOfEntity(entityUri)`: the vault of a record from its own address: the text before `/e/<id>` of `http(s)://<host>/(base|vault)/e/<id>` (for example `https://ann.example.test/base`); the address is trimmed; `null` for any other shape.
- `rowsNeedingMainTag(rows)`: the addresses, once each, of the rows whose address is of that shape and whose facts hold no `name`, `label`, `unitTag` or `tag`.
- `needsMainTag(facts)`: true when the facts hold none of those four (blank counts as absent) or are missing.
- `mainTagKey(uri)` and `mainTagsKey(vault, uris)`: the two query keys. `TAG_READ_BOUND_MS` (12 000), `MASTERS_BATCH_MAX` (50, from `tag-client`).
- Types `MainTag` (`MainTagRead` of `tag-client`) and `MainTagRow`.

The options of the queries: `useMainTag` and `useMainTags` use `staleTime: 60_000, retry: false, refetchOnWindowFocus: false`; `fetchMainTagsForRows` uses `staleTime: 60_000`.

## What this is not

- Not a writer of tags: nothing here adds, removes or makes a main tag. A writer lives in the app and keeps the cache honest by the contract in "What the host must supply".
- Not the name of a record: `needsMainTag` says whether to ask; which name wins is `refDisplayName` of `entity-ref-value` and `entityDisplayName` of `record-cache-kit`, which take the main tag as an argument.
- Not a way to work a tag out of a name: there is one rule, the platform's.
- Not a retry and not a poll: a failed read stays failed until the cache is invalidated or the query is mounted again.
- Not a credential holder: the proof is made by the session bridge's host; see "What the host must supply".

## How to take it

Package: `@kaigilb/gilbplatformcode-main-tag`

From a clone of this repository, install the unit's peers in the order `node scripts/peers.mjs units/main-tag` prints, then the unit:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/direct-shares <path-to-the-library>/units/folder-part <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/tag-client <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/main-tag
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own. Peers: `tag-client` (`^0.1.0`), `platform-fetch` (`^0.1.0`), `record-sync` (`^0.2.0`, the type `PlatformClient`), `lws-relations` (`^0.1.0`, `boundAwait`), `vault-origin-rule` (`^0.1.0`), `@tanstack/react-query` (`^5.101.2`) and `react` (`^19.0.0`).

## Examples

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchMainTagsForRows, useMainTag, useMainTagsForRows, mainTagKey, needsMainTag } from "@kaigilb/gilbplatformcode-main-tag";

// One record. Ask only when the record's own facts do not name it.
function Name({ uri, facts }: { uri: string; facts: Record<string, string> }) {
  const main = useMainTag(needsMainTag(facts) ? uri : null);
  return <span>{facts.name ?? (main.data?.known ? main.data.tag : "…")}</span>;
}

// A list page: ONE call per vault per fifty rows, never one per row.
function Rows({ rows }: { rows: { entityUri: string; facts: Record<string, string> }[] }) {
  const mains = useMainTagsForRows(rows); // Map<address, tag>, only the rows that need one
  return <ul>{rows.map((r) => <li key={r.entityUri}>{r.facts.name ?? mains.get(r.entityUri) ?? "Untitled"}</li>)}</ul>;
}

// Code that is not a component, through the same cache.
async function search(qc: QueryClient, hits: { entityUri: string; facts: Record<string, string> }[]) {
  return fetchMainTagsForRows(qc, hits); // Map<address, tag>; a group that cannot be read gives nothing
}

// A writer of tags makes every reader read again by invalidating BOTH heads.
async function afterMakeMain(qc: QueryClient, uri: string) {
  await qc.invalidateQueries({ queryKey: mainTagKey(uri) });
  await qc.invalidateQueries({ queryKey: ["main-tags"] });
}
```

## What the host must supply

- `setLwsAuth(host)` of `lws-session-bridge`, called once at start-up: its `dpopWriteAuth` signs every tag request (through `platform-fetch`). Before it is called, a read throws the bridge's sentence naming `setLwsAuth`, and no request leaves.
- The platform origin and the system vault hosts, set once through `base-origin` (`setBaseOrigin`, `setSystemVaultHosts`), which `vault-origin-rule` reads: a record's origin is its own host when that is a platform host, else the platform's origin.
- A `QueryClient` in a `QueryClientProvider` for the hooks, and the client itself for `fetchMainTagsForRows`.
- The query-key contract: whatever writes tags (adds one, makes one the main tag, removes one) must invalidate `["main-tag", uri]` (or the head `["main-tag"]`) AND the head `["main-tags"]`. That is how a change shows at every site at once. This unit does not write, so it does not do it.
- Record addresses as the platform serves them: `http(s)://<host>/(base|vault)/e/<id>`.

## Module state

None here. The unit holds only constants. It relies on two singletons that must exist ONCE in an app: the auth host of `lws-session-bridge` (set by `setLwsAuth`) and the settings of `base-origin` read by `vault-origin-rule`. Two installed copies of either break the signing or the origin: one copy signs with a session the other never saw, or addresses a record at another origin than the rest of the app. Install the units as copies (`install-links=true`) so each is installed once.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not mix vaults in one `readMasterTags` call: it takes ONE vault. `useMainTags` and `fetchMainTagsForRows` group by vault for you.
- Do not pass more than 50 records to `readMasterTags`; cut the list first (the hooks do).
- Do not read `known: false` as "the record has no tag". It is also what the platform says for a record the caller cannot read, and for a record the answer left out.
- Do not write to the cache by hand under `["main-tag", ...]` or `["main-tags", ...]`; invalidate it.
- Do not treat a thrown read as "no tag" in a place that must tell them apart: a `NoTagRoutesError` means the platform cannot make tags at all.
- Do not install a second copy of `lws-session-bridge`, `base-origin` or `vault-origin-rule` (see "Module state").

## Wrong readings

- "`needsMainTag` asks for every record the name reader would pass over." It tests only `name`, `label`, `unitTag` and `tag`. A record with only a `title` is asked for its main tag. And `entityDisplayName` of `record-cache-kit` puts the main tag BEFORE `title` and `processName`, while `refDisplayName` of `entity-ref-value` puts `title` and `name` BEFORE the tags: the two readers disagree on a record with only a `title`, and the request for it is partly wasted. Kept as the app has it.
- "A record that is not in the loaded list costs one call." Where a caller asks the main tag only after it has the record's facts, it costs two round trips in a row (the record read, then the masters call). That is the caller's order; this unit asks as soon as it is given an address.
- "A row with no address, or an address with a query, a trailing slash or a deeper path, is named by its main tag." It is not: `rowsNeedingMainTag` skips any row whose address does not match `http(s)://<host>/(base|vault)/e/<id>`. A lookup of the key `""` for a row without an address finds nothing.
- "`platformFetch` signs a read with the read proof." Every request here, a read `POST` included, is signed with the WRITE proof (`dpopWriteAuth`); the read proof and the bearer are never asked. And the 12-second bound does not cancel the request: the late answer is ignored.
- "`useMainTags` always shows the latest map." NOT DETERMINED. The map is memoised on the groups' `dataUpdatedAt` stamps joined with commas, and the dependency list is not complete (the app silences the lint rule). While groups are pending their stamp is 0, so a change of the list of groups that leaves the stamps equal could keep a stale map. Whether this is reachable is not determined; the tests do not reach it.
- "`readMasterTags` chunks like `readMainTags`." It does not: it throws above 50 records, although `readMainTags` of `tag-client` cuts the list by itself. Harmless, because its callers cut first.
- "A failed read in `fetchMainTagsForRows` throws." It does not: that group's rows get no tags and the other groups are answered. The `useMainTags` hook shows the same group as absent.

## Where it came from

`KaiGilb/GilbApp` (private repo), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script, range by range:

- `src/lib/base/recordTags.ts` lines 49-51, 78-80, 104, 106-110, 112-122, 174-175, 177-182, 249-260, 262-294, 296-300, 302-307, 309-313, 315-324 and 326-346 to `src/mainTag.ts` (the main-tag read path: `TAG_READ_BOUND_MS`, `mainTagKey`, `mainTagsKey`, the private `originOf`, `vaultOfEntity`, `tagPlatformFor`, `MainTag`, `readMasterTags`, `useMainTag`, `useMainTags`, `MainTagRow`, `rowsNeedingMainTag`, the private `knownTags`, `useMainTagsForRows`, `fetchMainTagsForRows`). Line 51 is `export { MASTERS_BATCH_MAX };`, kept as a re-export of the one `tag-client` has.
- `src/lib/base/entityDisplayName.ts` lines 22 and 28 (the two slug constants), 167-173 (`factTrim`, private) and 175-183 (`needsMainTag`) to `src/needsMainTag.ts`.

Not taken: the tag WRITE path and the Tags section's data in `recordTags.ts` (`RecordTag`, `RecordTagList`, `TagForbiddenError`, `readRecordTags`, `ensureRecordTag`, `addRecordTag`, `makeMainRecordTag`, `removeRecordTag`, `invalidateRecordTags`, `useRecordTags`, `useEnsureTag`, `useTagMutations`, `useTagGrammar`, `useTagWriteRule`, and the tag-string helpers). No code that is taken reaches them. The app's `invalidateRecordTags` must use `mainTagKey` and the head `["main-tags"]` of this unit.

Named changes, and only these:

1. the imports at the top of `src/mainTag.ts` are new: `useMemo` from `react`; `useQuery`, `useQueries` and the type `QueryClient` from `@tanstack/react-query`; `readMainTags`, `MASTERS_BATCH_MAX` and the type `MainTagRead` from the peer `tag-client`; the type `PlatformClient` from the peer `record-sync`; `platformFetch` from the peer `platform-fetch`; `boundAwait` from the peer `lws-relations` (the app's `boundAwait` and this one are the same code, comments apart; the app's file holds one more function, which is not reached); `vaultOriginOf` from the peer `vault-origin-rule`; `needsMainTag` from `./needsMainTag` (the source imports them from `gilb-stakeholders` and from the app's `./boundAwait`, `./config`, `./entityDisplayName` and `./stakeholderCard`);
2. in `src/needsMainTag.ts`, `PARTY_NAME_FLOOR.name` is written as its literal value `"name"`, with a comment saying so (as `plan-card` does in its private `entityDisplayName.ts`), and `CANONICAL_DISPLAY_SLUG` and `MASTER_TAG_SLUGS` are private constants copied from lines 22 and 28 with the word `export` taken off. Why: this unit cannot import `record-cache-kit`, which will import this unit (a cycle);
3. the doc comment of `vaultOfEntity` named a real host as its example; it names `https://ann.example.test/base`;
4. comments: the cycle and ticket tags (`C214 TA2`) are removed from the doc comment of `needsMainTag`, and the two file headers are new, shorter ones; no code changed.

`src/index.ts` is new. **Merged units compared and taken or not.** `platformFetch` is the `platform-fetch` unit, a peer. `readMainTags`, `MASTERS_BATCH_MAX` and `MainTagRead` are `tag-client`. `PlatformClient` is `record-sync`. `boundAwait` is `lws-relations` and `vaultOriginOf` is `vault-origin-rule`. `entityDisplayName` of `entity-name` and `refDisplayName` of `entity-ref` are not equal to the app's functions (searched by name over every `units/*/src`); `namespaceFromVaultEntity` of `vault-namespace` is not `vaultOfEntity` (it returns the root for an address with a query or a deeper path, and does not trim).

Tests (`src/*.test.*`; a fake `fetch` stubbed on the global, a fake signing session set with `setLwsAuth`, the origins set as `vault-origin-rule`'s tests set them, a fresh `QueryClient` per test, fake timers for the time bound; no network, no wall-clock wait). Ported from the app's `src/components/records/TagsEverywhere.ta2.test.tsx`, by test: "30 rows with no name make exactly ONE call carrying all 30; rows with a name are not asked", "120 rows make 3 calls (50, 50, 20), not 120" and "the search's batch (a hit list, not a component) is the same one call per 50, through the same cache" (here as "60 rows make 2 calls (50, 10), and the same rows asked again are served from the cache"); the app's file mocks the app's `dpop` module, here replaced by `setLwsAuth` and the fake `fetch`. Left out: "every site shows the main tag, and ALL of them change when Make main changes it" (it renders the Tags section, the write path, which stays in the app; re-expressed here as the tests of `qc.invalidateQueries` on the two heads); "a record that holds a name asks nothing and keeps its name" and "a Plan record WITHOUT a unitTag falls back to its main tag" (they render the reference chip and the name readers, which belong to `entity-ref-value`, `record-cache-kit` and `plan-stakeholder-io`; the part of the first that is this unit's, that a named record asks nothing, is the `needsMainTag` and `rowsNeedingMainTag` tables). New: `needsMainTag`, `vaultOfEntity` and `rowsNeedingMainTag` tables, the keys and options, the disabled cases, a record missing from the answer, grouping by vault, the origin and headers of every request, a foreign host never asked, the failed group, the bound, the batch limit of `readMasterTags`, and the invalidation of both heads.
