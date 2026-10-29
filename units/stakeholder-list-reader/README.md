# stakeholder-list-reader

Reads a holder's stakeholders, records and online people together, into one deduplicated list with names and photos, within a request budget.

## What this is

Reads a holder's stakeholders, records and online people together, into one deduplicated list with names and photos, within a request budget.

Plain functions and types, no React, no credential and no route of its own. Every read goes through a door the host hands in (`StakeholderListDeps`): the host owns the token, which node holds a vault, and its session caches. The list has one row per person: the holder's own card first, then people who are both placed and held as a record, then records, then placed people with no record. A record joins a placed person only through its resolved link (`a:sameAs`), never by name or title.

- `createStakeholderListReader(deps, options?)`: a reader for one holder's session, with `read()` (the first page of every held vault), `more()` (the next page of every vault that has one, and a failed vault again), `refresh()` (draw again; link and resolver answers are kept) and `names(keys)` (the names of the rows in the visible window). A draw runs in three steps: the first rows at once (`options.onRows`), then the joined rows once links are known, then the settled rows once the spellings are checked. `settling` says whether a later list will follow.
- `readStakeholderList(deps, options?)`: one settled draw, for a caller that keeps no reader.
- `mergeStakeholderRows(input)`: the pure merge, for a caller that gathers its own inputs. `entityKey(id)`: the key that names one entity in either address form (`/lws/r/<id>` or `/<segment>/e/<id>`), the host kept.
- `StakeholderList`: `rows`, `connections`, `vaults`, `links` (`unchecked`, `linking`), `complete`, `spellings`, `settling`, `partial`. Something that could not be read is a state, never a silent gap: `partial` is true whenever one input failed.
- The request budget. One draw reads the connections once, one page of at most its share of 20 records per held vault (`reachShares`, `pageLimitFor`, `pageLimitOfVault`, `STAKEHOLDER_LIST_REACH_CAP` = 20), which vaults' records carry a link, the links and resolves of the records on the loaded pages, the up-front linked read for at most `LINKED_LOOKUP_CAP` (8) placed people with what the screen has left of `FIRST_SCREEN_REQUESTS` (40), and spelling checks only when needed. At once, for the whole reader: `LINK_READ_CONCURRENCY` (3) link reads, `RESOLVE_CONCURRENCY` (3) resolves, `NAME_READ_CONCURRENCY` (3) name reads. A resolver 429 waits the server's `retry-after` (`BUSY_DEFAULT_WAIT_MS` = 2000 when it names none) plus up to half again, outside its slot, at most `BUSY_RETRIES` (2) times; then the record is `unchecked`.
- A name is read only when the list asks for a window of rows, for the placed-only rows in it (and, with the option `linkedNames: true`, the linked rows too). The answer may carry a photo address and a caption. A sign-in failure on a name read (`isCredentialSurfaceError`: five exact error names) makes `names()` reject with the door's own error, so the host can say it is signed out.

## What this is not

- Not a component. There is nothing to draw here; the host draws the rows.
- Not the doors. How a host reads a vault's records page, which records carry a link, the records linked to given people, the connections and a person's name is the host's wiring (the `StakeholderListDeps` below). A host wiring of these doors is a later unit.
- Not the connections reader or the canonicaliser (`person-connections`), nor the reader of one record's link (`online-card-link`), nor the sign-in test (`credential-surface`). All three are peers.
- Not a writer: nothing is created, patched or deleted.
- Not a matcher by name. A person is matched only on a resolved link and a canonical principal.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-list-reader`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-list-reader` prints:

```sh
npm install <path-to-the-library>/units/credential-surface <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/stakeholder-list-reader
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `person-connections` (`^0.1.0`) is a peer: its canonicaliser, its placements and the types of the connections reading come from it. `online-card-link` (`^0.1.0`) is a peer for the `LinkReading` type. `credential-surface` (`^0.1.0`) is a peer for `isCredentialSurfaceError`. `person-connections` itself needs `record-sync` (`^0.3.0`).

## Examples

```ts
import { createStakeholderListReader, type StakeholderListDeps } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";

const deps: StakeholderListDeps = {
  holder: "https://id.platform.example.test/p/ann",
  vaults: ["https://ann.example.test/vault", "https://work.example.test/vault"],
  holderVault: "https://ann.example.test/vault",
  ownCardIds: ["https://ann.example.test/vault/e/ann"],
  connections: () => readConnectionsOnce(), // yours: the session's read of the holder's connections
  listRecords: (vaultId, offset, limit) => yourRecordsPage(vaultId, offset, limit), // one page: { records, next }
  readLink: (recordId) => yourReadLink(recordId),
  resolve: (recordId) => yourResolve(recordId),
  readName: (principal) => yourReadName(principal),
};

const reader = createStakeholderListReader(deps, { onRows: (list) => draw(list.rows) });
const list = await reader.read(); // settled
const names = await reader.names(list.rows.slice(0, 20).map((r) => r.key)); // the visible window
const more = await reader.more(); // the next page of every vault that has one
```

## What the host must supply

`StakeholderListDeps`, every member. Each is the host's own door; the unit calls it with the arguments shown and holds nothing else of the host. Source: `read.ts` lines 168-223 of the package at the commit named below.

| Member | What it is | Required |
|---|---|---|
| `holder: string` | the holder's principal, used for the self row when the connections cannot be read | yes |
| `vaults: readonly string[]` | the vaults the holder holds, the holder's own first; each is listed | yes |
| `holderVault?: string` | the vault the connections are read for; an answer naming another vault is read as a failure | no |
| `ownCardIds: readonly string[]` | the holder's own card ids (the card first, then the others), in either address form | yes |
| `connections(): Promise<ConnectionsReading>` | the session's read of the holder's connections, kept by the host (its cache usually answers: 0 requests) | yes |
| `listRecords(vaultId, offset, limit?): Promise<RecordsPage>` | one page of a vault's stakeholder records from `offset`, at most `limit` (`?limit=`); the reader always passes `limit`, its vault's share of the reach; a door that ignores it still works at its own page size | yes |
| `linkedRecordIds?(vaultId): Promise<readonly string[]>` | which of the vault's records carry a link, in one request; without it (or when it fails) every record on a loaded page is read for its link | no |
| `linkedRecordsOf?(members, budget?): Promise<readonly { vaultId; record }[]>` | the records in the held vaults linked to any of these placed people, asked once per draw (`read`, `refresh`, never `more`) for at most `LINKED_LOOKUP_CAP` people, with `budget` the requests the screen has left | no |
| `requestsSoFar?(): number` | how many requests this screen has sent since it opened, counted by the host; gives `linkedRecordsOf` its `budget` | no |
| `readLink(recordId): Promise<LinkReading>` | one record's link, from the whole record | yes |
| `resolve(recordId): Promise<ResolveOutcome>` | the resolver for one record (`online-card-anchor` of `person-connections`' `resolveOnlineCard`) | yes |
| `canonical?: PrincipalCanonicaliser` | the session's canonicaliser (`createPrincipalCanonicaliser` of `person-connections`); without it principals are compared as stored, and `spellings` is `unresolved` for the members that would have been asked | no |
| `readName(principal): Promise<NameAnswer>` | one person's name (and photo address, caption) at the viewer's rung; throws the host's credential error when signed out | yes |
| `selfName?(): NameAnswer \| null` | the self row's answer from the holder's own card as the host already holds it; synchronous on purpose: never a request | no |

Options (`StakeholderListOptions`): `onRows(list)`, `linkedNames` (default false), `wait(ms)` and `random()` (the 429 wait and its jitter; defaults a timer and `Math.random`, injected in tests). The unit uses `setTimeout` for the default wait and nothing else of the platform. No setting and no start-up call.

## Module state

None. The reader holds its session caches (links, resolver answers, names, canonical answers), its limiters and its draws in the closure of one `createStakeholderListReader` call and drops them with it. Nothing is held at module level except constants; nothing runs at import. Two installed copies of this unit do not break each other; `person-connections` and `online-card-link` are not singletons here either (the canonicaliser is the host's, passed in).

## Do not

- Do not join rows by name or title. The merge never does.
- Do not read a name for the whole list: ask `names()` for the visible window.
- Do not treat `partial` as noise: it says an input failed and something may be missing or unjoined.
- Do not add a sixth name to `credential-surface`'s five to make a card screen match; that is a different set.
- Do not pass a door that ignores the `limit` of `listRecords` and expect the cap of 20 per reach to hold.

## Wrong readings

- "`complete` means nothing failed." It means every page of every vault is loaded; a failed vault is `complete: false`.
- "`refresh()` forgets the links." It draws again from the first page (the connections, the pages and the finds are asked again), but link reads and resolver answers are kept.
- "An overtaken `read()` resolves with its own list." It resolves with the newest complete list; an overtaken draw writes nothing into shared state.
- "`pageLimitOfVault` is how the reader pages." Since the shares were introduced it is the static split, kept for a reader that passes no `limit`; the reader passes `reachShares`.
- "`pageLimitFor` with 40 vaults gives each 0." It gives at least 1, so a reach across more than 20 vaults brings more than 20 records.
- A `ListedRecord`'s `type` is shown and decides the picture shape; it never joins rows.
- A name read that throws something that is not one of the five credential names is `unavailable` for that row only, and is asked again next time. A name that throws one of the five is not kept either.
- The source's `credentialError.ts` is not copied; see the next section.

## credential-surface: a false friend, measured

The source's `isCredentialSurfaceError` (`credentialError.ts`) and the unit `credential-surface` look alike but are not diff-equal: the source tests `name === "NotSignedInError" || ...` (a chain of five `===`) after the same `!e || typeof e !== "object" || !("name" in e)` guard; the unit tests `typeof name === "string" && SURFACE_NAMES.has(name)` over a `Set` of the same five strings. Both were run on 66 inputs: the 24 the package's own tests use (the five names as `Error` and as plain objects; `null`, `undefined`, a bare string, a number, `{}`, `{ name: 401 }`, an `Error` whose message is a credential name, `CodeRejectedError`, a plain `Error`, a `TypeError`, `AbortError`, `NotAPersonError`, an `Error` with `status: 401`) and 42 constructed (padded, upper- and lower-case names; `name` null, undefined, an array, an object with `toString`, a `String` object, a `Symbol`, a bigint, a boolean, `NaN`; an inherited `name`; a null-prototype object with and without `name`; a `Proxy` whose `has` and `get` disagree; a getter, which is read once in both; functions, classes, dates, regexes, maps, sets; a trailing NUL or newline; the neighbouring names `PublicCardError` and `PublicCardViewerMismatch`). The answers were identical on all 66, and neither throws on any. So `credential-surface` is imported and `credentialError.ts` is not copied. The `isCredentialSurfaceError` tests of the package (`readSignIn.test.ts`) run against the peer.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script:

- `src/stakeholderList/read.ts` to `src/read.ts`: lines 1-862, the whole file; its header comment is a new, shorter one; its imports (lines 59-66) are replaced as below.
- `src/stakeholderList/mergeRows.ts` to `src/mergeRows.ts`: lines 1-285, the whole file; imports (lines 31-32) replaced.
- `src/stakeholderList/reachCap.ts` to `src/reachCap.ts`: lines 1-61, the whole file.
- `src/stakeholderList/credentialError.ts`: not copied (the peer `credential-surface`, above).

No other file of `src/stakeholderList/` exists, and none of the four is imported by another file of that folder that is outside this unit.

**Merged units compared and taken.** Each imported body was compared with the source, token for token, comments excluded: `person-connections` (0.1.0) holds `CANONICAL_CONCURRENCY`, `isOldWebIdMember`, `membersToAsk`, `opaqueSelf`, `PrincipalCanonicaliser` (`canonical.ts`), `ConnectedPerson` (`compose.ts`), `ConnectionsReading` (`read.ts`), `ATOMIC_PLACEMENTS`, `placementKey`, `AtomicPlacement` (`placements.ts`) and `ResolveOutcome` (`anchorResolver.ts`); `online-card-link` (0.1.0) holds `LinkReading`. All SAME. `credential-surface` is equal by the measurement above.

Named changes, and only these:

1. the imports of `read.ts` are three imports of peers (`person-connections`, `online-card-link`, `credential-surface`) and two of this unit's files (`./reachCap`, `./mergeRows`, no `.ts`); the imports of `mergeRows.ts` are one import of `person-connections`; the code after the imports is the source's, unchanged;
2. the header comment of each file is shorter, and comments that name a cycle, a round, a ruling, a ticket, an agent or an app are reworded; no code changed (checked token by token);
3. no string literal carries a tag or a host.

`src/index.ts` is new. Tests are in `src/*.test.ts`; `test/clock.ts` (not shipped) is a virtual clock for the doors' simulated latency, so no test waits on the wall clock. The hosts are `example.test` hosts and the people Ann, Ben and a few more first names (the order of a few tests depends on the order of the keys, so the names keep the source's order). Ported from `gilb-stakeholders` `test/stakeholderList/` at the same commit, 16 of 17 files, every test: `read.test.ts`, `readGaps.test.ts` (`read.qa-s62`), `readSubscriber.test.ts` (`read.qa-s64`), `readOvertaken.test.ts` (`read.qa-s65`), `readOverlap.test.ts`, `readScaling.test.ts`, `readSignIn.test.ts`, `readLinkedNames.test.ts`, `readNamePhoto.test.ts`, `selfName.test.ts`, `linkedUpFront.test.ts`, `linkedUpFrontBudget.test.ts`, `reachCap.test.ts`, `reachShare.test.ts`, `mergeRows.test.ts` and `mergeRowsAdvisories.test.ts`. Changes: imports to the peers and `./index`; every wait on `setTimeout` or `Date.now` is on the virtual clock; titles and comments lose their tags; hosts and people renamed. Plus 14 tests that `person-connections` left out because they call the list reader: `readOldSpellings.test.ts` (4 of `oldSpellings-s4b`: the merged list) and `readSpellingBudget.test.ts` (10 of `qa-s4b-s74`: T1-T7, T11, T12, T14). Added: `stakeholderListReader.test.ts` (25: the export list, the limits, the shares of a reach, the type a record carries, `entityKey`, the five credential names and their neighbours through `names()`, the optional doors, a connections answer for another vault) and `hostAgnostic.test.ts` (13).

Left out, with the reason: `recordKinds-m3a.test.ts` (10 tests). It reads the stakeholder kinds from a fixture master (`resolveStakeholderKinds`, `masterSource`, `fixtureMaster`) to name the types it puts on records; that needs `stakeholder-kinds`, `vocabulary-source` and a master fixture, none of which this unit takes. What it pins about this code (a record's type reaches its row, blank is null, a type never joins) is pinned in `stakeholderListReader.test.ts` and in `mergeRows.test.ts` with plain type strings. The doors of the host (`listDoors`, `useStakeholderListReader`) are not in the source of this unit.
