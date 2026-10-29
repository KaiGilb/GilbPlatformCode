# person-create

Makes a person record in a named vault, finds candidate people first, and refreshes the lists afterwards.

## What this is

Makes a person record in a named vault, finds candidate people first, and refreshes the lists afterwards.

Plain async functions and types, no React, no credential of its own. The mechanism of the create (the find, the duplicate guard, the tag, the fields) is that of `pick-or-create`; this unit hands it the vault, the holder, the writer and what the person typed, says plainly what was and was not written when a later step fails, and marks the lists to be read again afterwards. No kind and no field is named: the kinds offered are the kinds the master lists that offer a name, and the boxes are the text fields the master offers on the chosen kind (and on a record a field of it holds).

Recording (`recordPerson.ts`):

- `recordPerson(host, deps, input)`: refuses first, before any host call and before any request, in a vault the person may not write (`NotTheHolderError`, "you may not write to this vault, so a person cannot be recorded in it"); then asks the host for the adder's card (their own card in their own landing vault, never the card of the vault written to); then makes the record with the package's `createRecord`. The name is written under the name predicate's write spelling only (no label, no title). `deps` is `{ reading, fetchImpl?, queryClient?, email? }`. When the platform has no tag routes the record is kept and the answer is `{ created: true, tag: null, tagHandle: null, held }`: data is never deleted because a tag is missing. Any other error is thrown as it is.
- `afterRecordPerson(host, qc, made)`: asks the host to remember the vault the create wrote into (for a card opened before any list holds the record), marks the vault's own list and every snapshot list to be read again, and answers when that is marked.
- `findPeople(reading, vaultId, text, fetchImpl?)`: the holder's records in the vault whose name holds the text (the package's `findCandidates`).
- `isHeldVault(vault, vaults)`: the person may write it and it is their landing vault or is nested under it (the parent chain reaches the landing vault; a cycle or a missing parent ends the walk as not held).
- `recordableKinds(fieldSets)`: the kinds whose set offers the name predicate, ordered by label (the bare name when there is none). `personBoxes(fieldSets, kind)`: the text boxes of a kind, the name excluded: a field of `inline-literal:text`, and a text sub-field of a record a field holds (keyed `field/sub`; a record that publishes no type name gets none). `fieldsFromBoxes(boxes, values)`: the `fields` the create takes (trimmed; empty boxes send nothing; the sub-fields of one held record are grouped). `heldLabelsWritten(boxes, values, writtenCount)`: the labels of the boxes whose held record was written before a failure, or `null` when that cannot be told. Type: `PersonBox`.
- `pickerReadingQuery(fieldSets)` and `pickerReadingQueryKey()`: the query options for the picker reading (the grammar and the stater's spelling, read once per session): `staleTime: Infinity`, `gcTime: Infinity`, `retry: false`, `retryOnMount: false`; with null field sets the function is React Query's `skipToken` and nothing is fetched. The key is a function because it names the ontology origin (see "What the host must supply").
- `readHolderSelfCard(vaultId, read?)`, `holderSelfCard(vaultId, read?, ensure?)`, `EnsureCard`: the vault's own self card, read at the address derived from the vault root (`self-card`), or made through a door you pass. Nothing in the app calls them any more; they are exported because a rig test of the app does.
- `__setFindPeopleForTest(fn | null)`: a hook for tests, never called by product code (see "Module state").
- Types: `PersonCreateHost`, `RecordPersonInput`, `NotTheHolderError`.

The quick list and the error text (`stakeholderCreate.ts`), pure:

- `stakeholderTypeOptions(fieldSets)`: the recordable kinds as type options (`veda:<Name>` ids), `stakeholderTypeSearch(options, noun)`: a search over exactly those options, never asking the network. `isStakeholderKindOption(option, options)`.
- `heldVaults(vaults)`: the vaults the person holds, in the order given (an absent list is none); `defaultHeldVaultId(held, readVaultId)`: the open vault if held, else the landing vault, else the first held, else `null`.
- `stakeholderErrorText(err, where?, name?, left?, saved?)`: a failed create or find in the package's words, never an address or a class name: a partial create first (it may be a bound, and a bound must not claim nothing was written), the person, the kind and the link each named only when that is what was stored; a lookup names the step and does not tell the person to create. `stepsNotWrittenSentence(left)`, `answeredNoTag(err)` ("It has no tag" is said only when the platform refused with a 4xx to make one), `STAKEHOLDER_FIND_DEBOUNCE_MS` (300), `STAKEHOLDER_FIND_MIN_CHARS` (2). Types: `StakeholderErrorWhere`, `PartialStepsLeft`.

## What this is not

- Not the adder's card and not the vault's memory of where a create wrote: those are the two host members.
- Not the find-before-create dialog, the type chooser, or the lists: it returns data and strings.
- Not the pick-or-create mechanism itself (`pick-or-create`), the tag routes (`tag-client`) or the vault list.

## How to take it

Package: `@kaigilb/gilbplatformcode-person-create`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/person-create` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create
```

Of those, this unit imports from sixteen: `pick-or-create` (`createRecord`, `findCandidates`, `readPickerVocabulary`, `CreateRefusedError`, `PartialCreateError` and the types), `tag-client` (`NoTagRoutesError`), `record-sync` (`PlatformError`), `vocabulary-source` (`VocabularyUnavailableError`), `stakeholder-field-sets` (the types), `vault-origin-rule` (`vaultOriginOf`), `record-cache-kit` (`recordsKey`), `plan-record-hooks` (`refreshMultiVaultLists`, the type `ReachableVault`), `lws-records` (`readRecord`), `term-origin` (`termOrigin`), `stakeholder-card-vocabulary` (`cardMasterSource`), `platform-fetch` (`platformFetch`), `plan-self-source` (`vaultRootOf`), `self-card` (`selfCardEntityUri`), `lws-relations` (`BoundTimeoutError`) and `ontology-reads` (`VEDA_ID_PREFIX` and the types `TypeOption`, `TypeSearchFn`); and from the third-party `@tanstack/react-query` (`QueryClient`, `skipToken`). The install line is long because those units have peers of their own.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { QueryClient } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { afterRecordPerson, findPeople, recordPerson, type PersonCreateHost } from "@kaigilb/gilbplatformcode-person-create";

setBaseOrigin("https://platform.example.test"); // once, at start-up
setTermOrigin("https://ontology.platform.example.test"); // once, at start-up

const host: PersonCreateHost = { adderCardOf: yourAdderCard, rememberCreatedIn: yourRememberCreatedIn };
const qc = new QueryClient();

const found = await findPeople(reading, vault.vaultId, "ann");              // candidates first
const made = await recordPerson(host, { reading, queryClient: qc }, { vault, vaults, agent, kind, name: "Ann Lee", boxes, values });
await afterRecordPerson(host, qc, made);                                    // the lists show it at once
```

## What the host must supply

- The platform's origin: `setBaseOrigin(origin)` of `base-origin`, once at start-up (`vaultOriginOf` reads it when a call is made). The ontology origin: `setTermOrigin(origin)` of `term-origin`, once at start-up. The app's `GILBVEDA_MASTER_ORIGIN` that built `PICKER_READING_QUERY_KEY` when the module loaded is `termOrigin()` in the function `pickerReadingQueryKey()`.
- `PersonCreateHost`, passed as the first argument of `recordPerson` and `afterRecordPerson` (both members are required):
  - `adderCardOf(vaults, qc, { email })`: the entity address of the card of the person adding the record, their own card in their landing vault (made basic first when they have none). Replaces `adderCardOf`, GilbApp `src/lib/base/adderCard.ts` line 98, called at `src/lib/base/recordPerson.ts` line 296. Called once per `recordPerson`, after the write check and before any write, with the list the caller gave, `deps.queryClient ?? fallbackQueryClient` and `{ email: deps.email }`. It rejects when the list holds no landing vault; the rejection stops the create with nothing written. The app reads the card through the query client it is given, one read per session.
  - `rememberCreatedIn(qc, recordId, vaultId)`: keeps for the session the vault a create wrote into, for a card opened before any list holds the record. Replaces `rememberCreatedIn`, GilbApp `src/lib/base/recordHooks.ts` line 2842 (re-exported by `src/lib/base/recordVault.ts`), called at `recordPerson.ts` line 325 with the record's short id (the part after its last `/`). Called once per `afterRecordPerson`, first, before the lists are marked.
- What `lws-records` (`readRecord`), `platform-fetch` and `lws-session-bridge` need: the signed-in session and its credential (see their READMEs). The query client of the app is passed in `deps.queryClient` and `afterRecordPerson`'s `qc`.
- A fetch for the master reads (the global `fetch`).

## Module state

- `fallbackQueryClient` (`recordPerson.ts` line 50): a **second** `QueryClient`, made when the module loads. It exists for a caller with no query cache of its own: `recordPerson` hands it to the host's `adderCardOf` when `deps.queryClient` is absent, so the own-card finding is then read once per process, not once per session. It is a cache outside the app's. Pass `deps.queryClient` and it is never used. Kept as the source has it.
- `findPeopleForTest` (`recordPerson.ts` line 199): the hook set by `__setFindPeopleForTest`, `null` by default. A hook that already imported `findPeople` does not see a spy on the export, so tests set this. Product code never sets it; `__setFindPeopleForTest(null)` restores the package's find.

Two installed copies of this unit would each keep their own `fallbackQueryClient` and hook. The units it reads also hold state and must exist once in an app: `term-origin`, `base-origin`, and `lws-relations` (whose `BoundTimeoutError` class `stakeholderErrorText` tests with `instanceof`, so the class that throws and the class that is tested must be the same).

## Do not

- Do not give the written vault's own card, or the principal, as the source: the source is the adder's card, which the host finds. The create makes no card for the vault written to.
- Do not add a fact to the create: the name goes under the name predicate's write spelling only.
- Do not give a box to a token field, a reference, or a record that publishes no type name: a token's value must be a member of its term's value set.
- Do not delete, retract or roll back a record because its tag is missing.
- Do not call `__setFindPeopleForTest` from product code.
- Do not keep the picker key in a module constant: it depends on the ontology origin, which is set after this module loads.
- Do not install a second copy of this unit, of `term-origin`, of `base-origin` or of `lws-relations`.

## Wrong readings

- "`recordPerson` needs a query client." It does not: without `deps.queryClient` it uses the module's own second client, and the adder's card is then read once per process.
- "A vault the person can write is a vault they hold." A vault shared with write is recordable but not held; `isHeldVault` is for the default of the "Create in" choice.
- "`pickerReadingQuery` fetches when the field sets are not known." With null field sets the query function is `skipToken`; nothing is fetched.
- "A box is made for every field." Only a free-text field, and a free-text sub-field of a record the field holds, gets a box; the number of boxes is not the number of fields.
- "`stakeholderErrorText` says nothing was created whenever a step timed out." It says so only when no record id is known; a timeout after the record was written says the record was created and not to create it again.
- "`answeredNoTag` is true for any failure of the tag." Only for a 4xx answer of the tag ensure route; a 5xx, a timeout or a failed master read says nothing about the tag.
- "`canWriteVault` here is the vault list's." The vault list's tolerates a vault with no `modes` and says false; this one is the app's, which reads `modes` directly and throws on a vault with none. It is private to the unit.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/recordPerson.ts` (whole, 328 lines) to `src/recordPerson.ts`;
- `src/lib/base/stakeholderCreate.ts` (whole, 260 lines) to `src/stakeholderCreate.ts`;
- `src/lib/base/types.ts` lines 213-217 (`canWriteVault`) to `src/canWriteVault.ts`, and `src/lib/base/boundAwait.ts` lines 9-12 (`plainBoundStep`) to `src/plainBoundStep.ts`: two pure functions no merged unit holds, each with its doc comment. Neither is exported from the unit's entry.

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded).
- `pick-or-create` (`createRecord`, `findCandidates`, `readPickerVocabulary`, `CreateRefusedError`, `PartialCreateError`, `CreateResult`, `FieldValue`, `FindResult`, `PickerReading`), `tag-client` (`NoTagRoutesError`), `record-sync` (`PlatformError`), `vocabulary-source` (`VocabularyUnavailableError`) and `stakeholder-field-sets` (`KindFieldSet`, `StakeholderFieldSets`): every declaration is the same as `gilb-stakeholders` at `0a261488be7c98d1ac5d79887c966a445b8928bd`.
- `lws-records` (`readRecord`) and `platform-fetch` (`platformFetch`): the same as the app's `records.ts` and `stakeholderCard.ts`; `record-cache-kit` (`recordsKey`) and `plan-record-hooks` (`refreshMultiVaultLists`, `ReachableVault`, `ReachableVaultParent`): the same as the app's `recordHooks.ts` and `types.ts`; `plan-self-source` (`vaultRootOf`): the same as `vaultProfilePhoto.ts`; `lws-relations` (`BoundTimeoutError`): the same as `boundAwait.ts`; `ontology-reads` (`VEDA_ID_PREFIX`, `TypeOption`, `TypeSearchFn`): the same as `typeSearch.ts`.
- `vault-origin-rule` (`vaultOriginOf`) and `stakeholder-card-vocabulary` (`cardMasterSource`): the same as the app's `config.ts` and `stakeholderCard.ts` except for the settings seam (`baseOrigin()` where the app read `BASE_ORIGIN`, `termOrigin()` where it read `GILBVEDA_MASTER_ORIGIN`).
- **Not taken, false friends.** `vault-list`'s `canWriteVault` takes `{ modes?: readonly string[] }` and says false for a vault with no `modes`; the app's reads `vault.modes.includes("write")`. They agree on every vault with a `modes` list, so the app's is copied rather than a new peer taken for a behaviour that differs on a malformed vault. `type-chooser`'s `TypeOption` is a structural subset (`spec: { id: string } | null`) of the app's.
- **A function the unit lacks.** `lws-relations`' `boundAwait.ts` holds `BoundTimeoutError`, `isBoundTimeout` and `boundAwait` but not `plainBoundStep`; that one function is copied (above).
- **A private package.** The app takes `selfCardEntityUri` from `gilb-photo`, a private package (`file:../gilb-photo` in the app's `package.json`; no commit is pinned). The unit `self-card` was cut from it. Compared with `gilb-photo` at `bf56ec7d8bfeb573b338d7248f953fe8e0fdd827` (its latest; the bodies of `selfCardIdForVault` and `selfCardEntityUri` are the same in all four commits that touched `selfCard.ts`, `ce354f0` to `bf56ec7`): through the app's `vaultRootOf` and the unit's, over 2,409 inputs (2,310 addresses found in the app's source and tests, and 99 built: schemes, ports, upper case, trailing slashes, other segments, empty, not a URL) the roots were the same and the card addresses were the same, with no difference. They differ only for a root that ends in `/`: `gilb-photo` hashes the root with the slash and trims it in the address, the unit throws. `vaultRootOf` never returns such a root (the segment is `/base` or `/vault`), so this unit cannot reach the difference.

Named changes, and only these:

1. the imports are the peers above and the third-party `@tanstack/react-query`; `./canWriteVault` and `./plainBoundStep` are the unit's own;
2. the interface `PersonCreateHost` is added and exported; `recordPerson(deps, input)` is `recordPerson(host, deps, input)` and `adderCardOf(` is `host.adderCardOf(` with the same arguments; `afterRecordPerson(qc, made)` is `afterRecordPerson(host, qc, made)` and `rememberCreatedIn(` is `host.rememberCreatedIn(` with the same arguments;
3. `export const PICKER_READING_QUERY_KEY = ["gilb-stakeholders", "picker-reading", GILBVEDA_MASTER_ORIGIN] as const;` (built when the module loaded) is `export function pickerReadingQueryKey() { return ["gilb-stakeholders", "picker-reading", termOrigin()] as const; }`; its use in the options is `queryKey: pickerReadingQueryKey()`, and the two overload types `typeof PICKER_READING_QUERY_KEY` are `ReturnType<typeof pickerReadingQueryKey>`. The strings are kept;
4. comments that name a cycle, a ticket, an agent, a person, a ruling or the host app are reworded; no code changed. No string literal carries a tag.

`stakeholderCreate.ts` has no code change at all, only its imports. No test seam was added: the source already has `__setFindPeopleForTest`.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/support.ts`, `test/fixturePlatform.ts`, `test/fixtureTag.ts` and `test/fixtureReference.ts` are the same files as in `pick-or-create`; `test/writableFields.ts` is the app's `c214gapp31b.fixture.ts`; `test/fakeHost.ts` is new (a recording fake of the host). Ported from GilbApp `src/lib/base/` at the same commit: `recordPerson.c214gapp31b.test.ts` 13 of 15 (here `recordPerson.test.ts`; the three `vi.mock` of the signer and the token are gone, the app's own-card finding being the fake host's `adderCardOf`), one test of `recordPerson.c214gapp42.test.ts` (`pickerReadingQuery.test.ts`), and `stakeholderCreate*.test.ts` 28 of 28 (here `stakeholderCreate.test.ts`, `.bound`, `.partial`, `.refusals` and `.heldLabels`). New: `recordPersonPinned.test.ts` (32) and `stakeholderCreatePinned.test.ts` (21). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units (13). Total 108 tests. No test waits on the clock.

Left out, with reasons (17 of the 31 `recordPerson*.test.ts` tests):

- `recordPerson.c214gapp31b.test.ts`, 2 tests: the nested vault's holding vault and the vault a create wrote into. They read the app's `holdingVaultOf` and snapshot keys (the app's memory of where a record is held). What `afterRecordPerson` does is pinned in `recordPersonPinned.test.ts` against the fake host.
- `recordPerson.c214gapp42.test.ts`, 7 tests (the self-card door: a basic card made in the landing vault, named from the email, adopted, refused, unreadable, landing-only): they exercise the app's `adderCardOf` through `recordPerson`, and that function is a host member, not this unit's code. The tests of `readHolderSelfCard` and `holderSelfCard` that remain in the unit are in `recordPersonPinned.test.ts`.
- `recordPerson.c214gapp31b.live.test.ts`, 8 tests: they run against the platform's rig process and a scratch database (`C214_RIG=1`) and the app's own vault list and snapshots; the app's `npm test` does not run them either.
