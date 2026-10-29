# stakeholder-list-doors

Wires the stakeholder list reader to the platform: each holder's records, the person's linked records, and deleted and ended records left out.

## What this is

Wires the stakeholder list reader to the platform: each holder's records, the person's linked records, and deleted and ended records left out.

The doors of `stakeholder-list-reader` (its `StakeholderListDeps`), made from the platform's own reads, plus the one React hook that makes a reader per holder. The reader's rules (one row per person, the holder's own card first, a record joins a placed person only through its resolved link, never by name) are the reader's; this unit only says WHICH reads do the reader's I/O.

- `stakeholderListDeps(host, args)`: the reader's doors for one holder. `listRecords` asks one records page per held vault for every stakeholder kind the master names (`?type=` once per kind, with the records' bodies `?include=body`, so the links come with the page: one request per vault per page, no find and no per-record read), cut to the reader's share of the reach (20 records across all held vaults). `connections` is the session's read of the holder's connections. `readLink` reads the whole record. `linkedRecordsOf` reads the records linked to the placed people up front. `resolve` asks the anchor resolver for one record, shared while in flight. `canonical` is the holder's one canonicaliser. `readName` reads the `public-card` at the viewer's rung. `requestsSoFar` is the screen's request count since its start. `args` is `StakeholderListDoorsArgs`: the query client, the holder, the held vaults (own first), the own vault, the kind names, the own card ids, and optionally `screenStartedAt`, `screenPages`, `screenLinks` and `held`.
- `linkedRecordsOf(host, holder, vaults, members, budget?, seen?, fromScreen?)`: the records in the held vaults linked to any of these placed people, each with its vault and as the records door lists it. One `find-by-attribute a:sameAs` per member per STORE of the held vaults (not per vault host), then one read of each record found, within `budget` requests (a new member costs one find per store plus a read and a resolve per new record). The answers are kept in `stakeholder-list-state` for the session. A record deleted in the session is never returned, and neither is a kept record whose resolve answered 404 and that no page of the reader listed. Throws when a find or a read fails: the reader then keeps page order for the draw, never "nobody is linked".
- `masterTypeAddress(typeUri)`, `listedRecordsPage(page)`, `nameAnswerOf(read)`, `heldVaultsOwnFirst(vaults, ownVaultId)`, `CredentialRefusedError`, `ReaderSeen`, `forgetLinkedRecords`: the type address as the master spells it (read from the ontology origin of the moment), a records page as the reader takes it, a name read as the list may draw it (a 401 throws `CredentialRefusedError`, which the reader names "signed out"), the held vaults once each with the own vault first, and the sign-out reset of the shared state.
- `useStakeholderListReader(args | null, options?)`: one reader per holder, a NEW reader when the holder, vaults, own vault, kinds, own cards or the presence of the screen's functions change. Returns `{ list, error, names, more, refresh, identity }`. A record deleted anywhere in the app leaves the list at once, and comes back if the delete is refused; a record taken as ended leaves the same way and comes back if a page lists it again. Nothing is read until `args` is given.
- `personCard.ts`: `personCardPlatform()` (the identity node with the DPoP fetch), `connectionsKey`, `readHolderConnections`, `sessionConnections(qc, holder, ownVaultId)` (the holder's connections read ONCE per holder per session, a failure not kept), `canonicaliserFor(holder)`, the anchor share of an open card (`AnchorShare`, `bindAnchorShare`, `anchorShareOf`, `sharedAnchor`, `forgetAnchor`), `resolveRecordPersonCard` and `__resetPersonCardSession`.
- `onlineCardWiring.ts`: `identityFetch` (a fetch signed for its own url and method; a 401 drops the held token and is still the answer) and `onlineCardDeps(args)` (the online-card controller's dependencies; the link is written by a merge patch of the holder's own record).
- `StakeholderListDoorsHost` and `StakeholderListDoorsHostContext`: the host seam, below.

Read only: nothing here writes a record, a link, a placement or a claim except `onlineCardDeps`'s `writeLink`, the controller's one write (a merge patch of the holder's own record carrying only the link's patch), through `patchRecord` of `lws-records`.

## What this is not

- Not the reader: the rules and the merge are `stakeholder-list-reader`.
- Not the shared state: the kept answers, the deleted and ended ids and the screen's links are `stakeholder-list-state`, a peer. This unit reads and writes them; it holds none of them.
- Not a component: there is no markup. The list the doors feed is drawn by the app (rows of its records grid); the app's grid, its row component and its record pane are in no unit.
- Not the app's request meter, its record cache or its delete list: those are the host's four members.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-list-doors`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/stakeholder-list-doors` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/stakeholder-list-doors
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. Third-party peers: `@tanstack/react-query` (`^5.101.2`) and `react` (`^19.0.0`). The unit has a heavy install (42 units with itself): `plan-record-hooks` brings its own, and `stakeholder-list-state` is a singleton peer (see Module state). The settings of `base-origin` and `term-origin` must be set once at start-up, and `lws-session-bridge` needs its host (`setLwsAuth`): the doors read them at the call, and throw a sentence that names the missing one.

## Examples

```tsx
import { StakeholderListDoorsHostContext, useStakeholderListReader, type StakeholderListDoorsHost } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";

const host: StakeholderListDoorsHost = {
  requestsSent: () => yourRequestMeter.sent(), // the screen's budget is counted from this
  heldRecordFreshMs: 15_000,
  heldRecordOf: (qc, id, entityUri) => yourRecordCacheRead(qc, id, entityUri), // a read of your cache, now
  useRecordsBeingDeleted: () => yourDeletedIds(), // a hook; the SAME set until it changes
};

function Stakeholders({ args }: { args: StakeholderListReaderArgs | null }) {
  const { list, error, names, more, refresh } = useStakeholderListReader(args);
  return list ? <Rows rows={list.rows} names={names} more={more} /> : <p>{error ?? "Reading"}</p>;
}

// Provide the host once, above the list:
// <StakeholderListDoorsHostContext.Provider value={host}><Stakeholders args={args} /></StakeholderListDoorsHostContext.Provider>
```

## What the host must supply

`StakeholderListDoorsHost`, every member (the context has no default; with no provider `useStakeholderListReader` throws an error that names `StakeholderListDoorsHostContext`, and the plain functions take the host as their first argument). No writer is a member.

| Member | What it is | App call it replaces |
|---|---|---|
| `requestsSent(): number` | how many requests the page has sent so far (0 when nothing counts them). Sync. Read when a reader is made, when its identity changes, and each time the reader asks how many the screen has used | `requestsSent()`, `lib/base/requestMeter.ts:39`, called at `listDoors.ts:272` and `useStakeholderListReader.ts:116`, `:120` |
| `heldRecordFreshMs: number` | how long a record the app's record cache holds is taken as fresh; an answer from a page's document is kept only that long (15000 in the app) | `HELD_RECORD_FRESH_MS`, `lib/base/recordHooks.ts:449`, read at `listDoors.ts:435` |
| `heldRecordOf(qc, id, entityUri)` | the record the cache holds for this row, or null (not held, or held for longer than the freshness). A call at the moment the reader asks for a found record, never a snapshot taken at render | `heldRecordOf(qc, id, uri)`, `lib/base/recordHooks.ts:456`, called at `useStakeholderListReader.ts:131` |
| `useRecordsBeingDeleted(): ReadonlySet<string>` | a HOOK: the ids of the records being deleted or deleted in this session. Called on every render of the hook, at the place the source called it, never conditionally. The host must return the SAME set until it changes (the list is memoised on it) | `useRecordsBeingDeleted()`, `lib/base/recordHooks.ts:2609`, called at `useStakeholderListReader.ts:100` |

Options the app used: `heldRecordFreshMs: 15_000`; the sets from `useRecordsBeingDeleted` are the delete watcher's pending ids (`watchRecordDeletes` of `plan-record-hooks`) joined with the session's deleted ids (`stakeholder-list-state`). `heldRecordOf` and `useRecordsBeingDeleted` stay in the host because their source functions are in no unit (they read the app's record cache and its delete watcher); `heldRecordFreshMs` stays in the host because `plan-record-hooks` holds the constant but does not export it.

## Module state

The unit holds module state of its own, and an app must have ONE copy of it:

- `personCard.ts`: `canonicalisers` (a Map from a holder to its canonicaliser, for the session) and `shares` (a WeakMap from an open card's controller to its anchor share). `__resetPersonCardSession` empties the first.
- `useStakeholderListReader.ts`: `readers` (a WeakMap from a reader to whether its hook is still the current one).

Two installed copies would each keep their own canonicalisers and shares, and a reader made by one copy would not be seen as current by the other. The kept answers, the deleted and ended ids and the screen's links are NOT here: they are module state of `stakeholder-list-state`, which is a peer, and two copies of THAT break the list (a delete made through one is not seen through the other).

## Do not

- Do not install a second copy of this unit or of `stakeholder-list-state`.
- Do not give `useRecordsBeingDeleted` a host that returns a new set on every render: the list is memoised on it and would redraw each time.
- Do not call `stakeholderListDeps` or `linkedRecordsOf` without the host as the first argument (the app's functions took none).
- Do not read `heldRecordOf` at render and hand the doors the answer: the doors call it when they ask for a found record.
- Do not ask for a name before `args` is given: nothing is read until then.

## Wrong readings

- "`stakeholderListDeps` starts reading." It is pure construction: nothing is requested until the reader reads.
- "`CredentialRefusedError` is any failure of the names door." Only a 401. Another status is "unavailable".
- "A 404 from the resolver means the record ended." It means so only for a record kept as read, that this reader's pages never listed, that this session saw joined to a person before, and that is on the holder's own vault (the platform answers the same 404 for "no link", "not a card" and "record not on the caller's own vault"). A page that lists the record takes it back.
- "A link write forgets everything the doors kept." It forgets the kept finds and reads (`forgetLinkedFinds`); what the session knows was deleted or ended is kept. Only sign-out (`forgetLinkedRecords`) forgets that too.
- "The anchor ask is kept after it answers." `keptResolve` shares it only while it is in flight.
- "`masterTypeAddress` is fixed at load." It reads the ontology origin at each call.
- "The photo address needs a second request." It comes with the name in the same `public-card` read.
- Kept as the app has it: a find that names more than 20 records for one member is cut at 20 (`LINK_FIND_LIMIT`), never paged; the records page for a vault past 20 held vaults still asks one record each (the reader's "known edge").

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, each file whole, copied by script:

- `src/lib/base/stakeholderList/listDoors.ts` lines 1-544 to `src/listDoors.ts`;
- `src/components/stakeholders/useStakeholderListReader.ts` lines 1-228 to `src/useStakeholderListReader.ts`;
- `src/lib/base/onlineCard/personCard.ts` lines 1-137 to `src/personCard.ts`;
- `src/lib/base/onlineCard/onlineCardWiring.ts` lines 1-55 to `src/onlineCardWiring.ts`.

`linkedAnswers.ts` and `pageLinks.ts` of the same folder are in `stakeholder-list-state` 0.2.0.

**What every import became** (the body of each symbol compared with the app's, token streams per declaration, comments excluded; the others are unit-equal except the named seams):

| Import in the source | Became | Evidence |
|---|---|---|
| `gilb-stakeholders`: `pageLimitOfVault`, `ListedRecord`, `NameAnswer`, `RecordsPage`, `StakeholderListDeps`, `createStakeholderListReader`, `NameState`, `StakeholderList`, `StakeholderListRow`, `StakeholderListReader` | `stakeholder-list-reader` (peer) | equal to the package at the pin |
| `gilb-stakeholders`: `cardName`, `readOnlineCard`, `OnlineCardRead`, `LinkWrite`, `ControllerDeps` | `online-card` (peer) | equal |
| `gilb-stakeholders`: `readLink`, `LinkReading` | `online-card-link` (peer) | equal |
| `gilb-stakeholders`: `resolveOnlineCard`, `ResolveOutcome`, `createPrincipalCanonicaliser`, `PrincipalCanonicaliser`, `readConnections`, `ConnectionsReading`, `resolvePersonCard`, `PersonCard` | `person-connections` (peer) | equal |
| `gilb-stakeholders`: `PlatformClient` | `record-sync` (peer) | equal |
| `../attributeFind`: `findByAttribute` | `lws-vault-sets` (peer) | differs only in the default of `origin`, `BASE_ORIGIN` against `baseOrigin()` (the setting); this unit always passes the origin |
| `../vaultSets`: `idFromUri`, `listVaultRecordsPage`, `VaultRecordRef`, `VaultRecordsPage` | `lws-vault-sets` (peer) | equal |
| `../records`: `readRecord`, `BaseRecord` | `lws-records` (peer) | equal |
| `../records`: `patchRecord` | `lws-records` (peer) | differs only in the argument `"PATCH"` to `authHeader` (the auth seam of that unit) |
| `../config`: `vaultOriginOf`, `storeOfOrigin` | `vault-origin-rule` (peer) | differs only in `BASE_ORIGIN` against `baseOrigin()` |
| `../config`: `BASE_ORIGIN` | `base-origin` setting, `baseOrigin()` at the call (named change) | the setting unit |
| `../dpop`: `dpopReadAuth`, `invalidateDpop` | `lws-session-bridge` (peer) | the auth seam every `lws-*` unit uses |
| `../stakeholderKinds`: `GILBVEDA_MASTER_ORIGIN` | `term-origin` setting, `termOrigin()` at the call (named change) | the setting unit |
| `../workingSetLoadVaults`: `heldVaultIds`; `../types`: `ReachableVault` | `plan-record-hooks` (peer) | equal |
| `../recordHooks`: `watchRecordDeletes` | `plan-record-hooks` (peer) | equal |
| `../recordHooks`: `HELD_RECORD_FRESH_MS` | host member `heldRecordFreshMs` | the unit holds the constant (equal, 15000) but does not export it |
| `../recordHooks`: `heldRecordOf`, `useRecordsBeingDeleted` | host members | in no unit |
| `../requestMeter`: `requestsSent` | host member | app state |
| `./linkedAnswers`, `./pageLinks` | `stakeholder-list-state` (peer) | the same files, whole |
| `@tanstack/react-query`: `QueryClient`, `useQueryClient` | third-party, `^5.101.2` | |

Named changes, and only these: see `unit.json` `namedChanges` (the `host` argument of `stakeholderListDeps` and `linkedRecordsOf`; `termOrigin()` in `masterTypeAddress`; `baseOrigin()` in `personCard.ts` and `onlineCardWiring.ts`; `host.heldRecordFreshMs`; the host read and its error at the top of the hook, and `host.useRecordsBeingDeleted()`, `host.requestsSent()` twice, `stakeholderListDeps(host, ...)` and `host.heldRecordOf(...)` in it; the declaration of `LinkedFound` moved to `stakeholder-list-state`). The token diff against the source shows nothing else.

**Tests.** 96 of the app's 99 tests belong here (the other three, of `linkedAnswers`, are in `stakeholder-list-state`); 80 are ported, same inputs and expectations, hosts `example.test`, people Ann and Ben, the app's two auth modules replaced by the fake auth host of `test/support.ts` and its request meter a copy of the app's counting wrapper. The names of the files do not carry the app's tags: `listDoors` (the app's `m3c`) 12, `linkedDoor` (`m3c4`) 3, `linkedBudget` (`m3c5`) 9, `nameAndScreenPages` (`m3f`) 3, `joinedSeen` (`d51`) 3, `endedRecords` (`r8`) 15, `keptCostsNothing` (`s1`) 5, `deleteMends` (`r7delete`) 5, `partialAnswer` (`r7partial`) 3, `deletedNotBack` (`s102deleted`) 1, `budgetGaps` (`s102gaps`) 2, `deletedElsewhere` (`s107`) 3, `nonHomeVault` (`s109`) 3, `listedKinds` (`s99`) 1, `personCard` 4, `onlineCardWiring` 4, `useStakeholderListReader.deletes` 3 and `.screenStart` 1. The two hook files mock the unit's own `./listDoors` and the reader unit's `createStakeholderListReader` with stand-ins, as the app's did. The ones through delete flows use the real `useDeleteRecord` and `watchRecordDeletes` of `plan-record-hooks`.

**Left out (16), and why:**

- `listDoors.f5.sp1r3.test.ts` (3), `listDoors.s127.test.ts` (8), `listDoors.s129.test.ts` (2): they read the app's record cache and grid through `__hydrateRecordsPageForTest`, `seedRecordReads`, `heldRecordOf` and `LIST_FRESH_MS` of `recordHooks`, `loadedLinksFor` of the records grid, and `photoOfRecord`; none is in a unit. The behaviours they pin that this unit holds (the screen's links answer a member; the answer lapses `heldRecordFreshMs` after the list's read; `held` hands a record over) are pinned with a fake host in `doorsPins.test.ts` and `useStakeholderListReader.host.test.tsx`.
- `listDoors.m3c.test.ts` "a listed record can be opened from the shell" (1) and `listDoors.s99linkedDoor.agenttester.test.ts` "after the door, the record pane's lookup knows the record's address" (1): they read the cache through the app's `findKnownRecordInCache`. The rows that lookup scans are asserted directly in `listedCache.test.ts` (2 new tests).
- `listDoors.m3c4.test.ts` "findOwnCard's read of the card also gives its name" (1): it calls the app's `ownCardFindingQuery`, in no unit.
- In `onlineCardWiring.s13online.test.ts` the last test also asserted that three app modules (`mynet/place/lws`, `mynet/heldnote/heldNote`) were never called; they are not in the unit, so those three lines are not ported (the test keeps its check that the dependencies carry no copy path).

New tests (58 of the 138): `doorsPins.test.ts` 18, `wiringPins.test.ts` 8, `endedPins.test.ts` 2, `sharedAnchor.test.ts` 3, `useStakeholderListReader.host.test.tsx` 4, `useStakeholderListReader.rows.test.tsx` 4, `listedCache.test.ts` 2, `exports.test.ts` 3, the missing-provider test in `useStakeholderListReader.deletes.test.tsx` 1, and the host-agnostic check test 13. No test waits on the wall clock: the one the app let pass 50 ms for is let run its microtasks.
