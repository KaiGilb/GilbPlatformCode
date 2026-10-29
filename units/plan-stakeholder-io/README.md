# plan-stakeholder-io

The reads and writes behind the Stakeholder, Authority and Resource Owner lines of a Plan card: finding records to link, writing and ending an Authority, the stakeholder kinds the master serves, the person Authorities of a record, a record's relations, and the name a link shows.

## What this is

The reads and writes behind the Stakeholder, Authority and Resource Owner lines of a Plan card: finding records to link, writing and ending an Authority, the stakeholder kinds the master serves, the person Authorities of a record, a record's relations, and the name a link shows.

`plan-stakeholders-model` holds the rules (the relation rows, the tag text, the Authority and person tests) and `plan-stakeholder-lines` draws the lines with a host. This unit is what that host calls: React hooks over one `QueryClient` (the app's `@tanstack/react-query`) and async functions over the platform's interfaces, each through a peer that signs its own request.

- Finds: `findStakeholderRecords(vaultIds, typeNames, text, opts?)`: records whose name matches `text`, of the kinds named, across every held vault (each distinct vault once). With text it is the typed Find of `record-cache-kit`'s `searchVaults` (at most 20 hits read, 6 at a time); with none it lists the first page of the kinds from each vault. `complete` is true only when every vault's page said so and no read was cut or failed; `vaultsMissed` says a vault's search or list failed (the others' hits are kept). No kind name, or no vault, is "did not search": `{ hits: [], complete: false, vaultsMissed: false }`. `findAnyRecords(vaultIds, text, opts?)`: the same for a record of any kind (an Authority's "acts for"), with no kind on the hit. `opts` hands in the search, the read and the list (tests, agents). The type `StakeholderFind`.
- Writes: `writeAuthorityRelation(input)`: one `t:AuthorityOf` (or the `relationType` given: a Resource Owner is `t:ResourceOwnerOf`) with the two roles, `a:relationType: stakeholder` and, only when given, `a:authorityActsFor`; answers the relation as the record's side. `endThenWriteAuthority(endId, input)`: ends a plain stakeholder relation, then writes the Authority (in that order; a failed end writes nothing). `migratedAuthorityRelation(row, vaultId, relations)`: for a record that still has the older `a:authorityHolder` (and `a:authorityActsFor`) keys, writes the relation unless that person is already an Authority; `null` when the record has no such key; the caller retracts the keys.
- Kinds: `STAKEHOLDER_TYPE_SET_QUERY` (the React Query options of the type set: never retried, stale after `KIND_SET_MAX_AGE_MS`), `stakeholderTypeSetQueryKey()` (its key), `readStakeholderTypeSet(fetchImpl?)`, `masterKindReader(fetchImpl?)` (the page's one shared reader of the master, or a memory-only one over a fetch of your own), `toStakeholderTypeSet(set)`, `subscribeStakeholderTypeSet(setTypeSet, reader?)` (keeps the cache in step when a background check finds the master changed), `kindWordOf(set, type)` (the master's word for a type, in any spelling).
- Hooks: `useRelations(id, at)` (the relations a record takes part in, keyed by the door, fresh for 15 s, not read for no id or a `temp:` id), `usePersonAuthorities(record, vaultId)` (`{ people, pending, error }`: the Authorities whose record is a person, once the relations, the kinds and the types are known), `useAuthorityTypes(vaultId, uris)` (`{ typeOf, pending, error }`: the type of each address, from the open vault's list first and one read each otherwise), `useResolvedRefLabel(ref, vaultId)` (the name a link shows: a hit in the vault's loaded list wins; else one read, kept under `["base", "record", id, <origin of the address>]`; a record that cannot be read is named by its address; a record that holds no name, label, `unitTag` or `tag` is named by its MAIN tag, which `main-tag`'s `useMainTag` reads from the platform, and only such a record asks).

## Changes in 0.2.0

- `useResolvedRefLabel` names a record that holds no name, label, `unitTag` or `tag` by its MAIN tag, as the app now does (one tag rule, the platform's): after the record read it calls `useMainTag` of `main-tag` for that record's address and passes the tag on to `refDisplayName`, which puts it after the `unitTag` / `tag` step. A record that holds a name asks nothing.
- New peer: `main-tag` ^0.1.0 (imported directly: `useMainTag`, `needsMainTag`). It signs its reads with `setLwsAuth` and finds the record's own origin through `vault-origin-rule`, so the app must have run `setLwsAuth` and the origin settings (see "What the host must supply"). Peers raised: `plan-stakeholders-model` ^0.2.0 (`handleFromFacts` is gone there), `entity-ref-value` ^0.2.0, `record-cache-kit` ^0.3.0, `plan-record-hooks` ^0.2.0.
- Two queries now sit in the cache for each link: the record read and `["main-tag", address]` (disabled when the record needs no tag).
- Re-synced from KaiGilb/GilbApp @ `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`; the range of `useResolvedRefLabel` moved from 16-38 to 18-46.

## What this is not

- Not the lines, nor the rules over the relation rows: `plan-stakeholder-lines` and `plan-stakeholders-model`.
- Not the list of the vault's records: `useRecords` is `plan-record-hooks` (3,162 symbol-lines for `usePersonAuthorities` alone). It is a peer; it is not copied.
- Not the kind reader: `stakeholder-kinds` is (and its shared reader is module state there, not here).
- Not the host: three members of the lines' host are written from the call site, not from a function (the record read, the relation document and the held vaults), and are the host's.
- Not the app's own-card finding or the source stamp: `plan-self-source`.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-stakeholder-io`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/plan-stakeholder-io` prints:

```sh
npm install <path-to-the-library>/units/plan-stakeholder-io
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. `@tanstack/react-query` and `react` are peers at run time: the hooks and the lists must see ONE copy of each.

## Examples

The members of `plan-stakeholder-lines`' host this unit serves (the same code is type-checked against that host in `src/hostFit.test.tsx`):

```tsx
import { useQuery } from "@tanstack/react-query";
import type { StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { endRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  STAKEHOLDER_TYPE_SET_QUERY, findAnyRecords, findStakeholderRecords, useRelations, usePersonAuthorities, writeAuthorityRelation,
} from "@kaigilb/gilbplatformcode-plan-stakeholder-io";

export const served = {
  useRecords: (vaultId) => useRecords(vaultId),
  useRelations: (recordId, recordUri) => useRelations(recordId, recordUri),
  useStakeholderKinds: (enabled) => useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled }),
  usePersonAuthorities,
  findStakeholders: (vaults, names, text) => findStakeholderRecords(vaults, names, text),
  findAnyRecords: (vaults, text) => findAnyRecords(vaults, text),
  writeAuthorityRelation,
  endRelation,
} satisfies Partial<StakeholderLinesHost>;
```

## What the host must supply

- The settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (`base-origin`); `setTermOrigin(...)` (`term-origin`; the master the kinds are read from is `termOrigin()` when the options or the key are used, not when this module loads); `setLwsAuth(host)` (`lws-session-bridge`; since 0.2.0 it also signs the main-tag reads of `useResolvedRefLabel`, so a host that does not sign gets no main tags and the names fall back); `setTypeKey(typeFacetKey)` (`type-key`, from `plan-record-hooks`).
- One `QueryClient` per app, given to a `QueryClientProvider`, and the same one `plan-record-hooks` uses.
- The members of the lines' host that are not here (see "What this is not").

## Module state

None of its own. The shared kind reader of the master is kept by `stakeholder-kinds` (one per origin and role); an app must have ONE copy of that unit and of `plan-record-hooks`.

## Do not

- Do not read `STAKEHOLDER_TYPE_SET_QUERY.queryKey` (or spread the options) before `setTermOrigin`: it throws. Use it from a hook, as above.
- Do not give `findStakeholderRecords` an empty kind list expecting "all": it is "did not search". Use `findAnyRecords`.
- Do not write a plain stakeholder and an Authority for one person to "upgrade" one: use `endThenWriteAuthority`, which ends the plain relation first.
- Do not send `usePersonAuthorities` a record whose address you do not hold: its relations are read at `null`, the app's default origin, and reach only the vault that origin names.

## Wrong readings

- "A found record with no name is dropped." Only a record with no address and no name is. A record whose facts name nothing is shown by the tail of its address (its id).
- "`usePersonAuthorities` fails when a type cannot be read." A record that cannot be read is an unknown type, which is not a person; `error` is the relations' failure. (The types' query cannot reject: each read is caught inside it.)
- "`complete` is the page's `complete`." For a search it is: no next cursor, no id past the cap of 20, and every kept id read. A hit whose read failed makes the answer not complete, though it adds no hit.
- "`findStakeholderRecords` with text lists." It searches. With no text it lists, from each vault's first page only.
- "The Note a search returns is a stakeholder." A hit whose kind is not one of the names is dropped.
- "`useAuthorityTypes` is pending while its query is disabled." A disabled query (nothing missing) is not pending.
- "A record with a `title` and no name is not asked for its tag." It is: the test that decides (`needsMainTag`) looks only at `name`, `label`, `unitTag` and `tag`, not at `title`; the request is made, and then the label still shows the `title`, because `refDisplayName` puts `title` before the tags. The request is wasted.
- "The main tag is asked for every link." Only when the facts of the record are known (the loaded list or the one read) and hold no name, label, `unitTag` or `tag`: a record not in the loaded list costs two round trips in series, the read of the record and then the tag call.
- "The type set key is a constant." It was one in the app, evaluated when the module loaded, before an app can set the term origin; it is the function `stakeholderTypeSetQueryKey()` here and the options carry a getter.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/planStakeholders.ts` to `src/planStakeholdersIo.ts`: lines 228-427 (`authorityFacts`, `writeAuthorityRelation`, `endThenWriteAuthority`, `migratedAuthorityRelation`, `ReadFn`, `StakeholderFind`, `orgHit`, `asOrgHits`, `findStakeholderRecords`, `findAnyRecords`; the constants, the pure functions and `AuthorityWrite` of lines 21-226 are `plan-stakeholders-model`'s; the app's `handleFromFacts` (old 429-436) is gone from the source and the model);
- `src/lib/base/stakeholderKinds.ts` to `src/stakeholderKinds.ts`: lines 59-137 (`STAKEHOLDER_TYPE_SET_QUERY_KEY`, `masterKindReader`, `toStakeholderTypeSet`, `STAKEHOLDER_TYPE_SET_QUERY`, `subscribeStakeholderTypeSet`, `kindWordOf`, `readStakeholderTypeSet`; not taken: `GILBVEDA_MASTER_ORIGIN` (line 39) and the type `StakeholderTypeSet` (41-57, `plan-stakeholders-model`'s));
- `src/components/records/useConstraintPeople.ts` to `src/useConstraintPeople.ts`: lines 12-89 (`listedType`, `useAuthorityTypes`, `usePersonAuthorities`);
- `src/lib/base/relationHooks.ts` to `src/relationHooks.ts`: lines 13-24 (`useRelations`);
- `src/components/records/EntityRefValue.tsx` to `src/useResolvedRefLabel.ts`: lines 18-46 (`useResolvedRefLabel`, the hook the component of `entity-ref-value` receives as `useRefLabel`; not taken: the component (that unit's), `childrenPointingAt` (unused there)).

Named changes, and only these:

1. the imports are replaced by imports of the peers `entity-ref` (`entityRefFromFact`), `entity-ref-value` (`refDisplayName`), `main-tag` (`useMainTag`, `needsMainTag`: the app's `../../lib/base/recordTags` and `../../lib/base/entityDisplayName`; this unit reads the record's main tag directly), `lws-records` (`readRecord`, `BaseRecord`), `lws-relations` (`endRelation`, `memberEntityUri`, `writePairRelation`, `readRelations`, `relationsKey`), `lws-vault-sets` (`listVaultRecordsPage`, `searchEntities`, `typeLocalName`), `plan-record-hooks` (`useRecords`), `plan-stakeholders-model` (the constants, `authoritiesOf`, `legacyAuthorityOf`, `personAuthorities`, `sameRecord`, `AuthorityWrite`, `StakeholderTypeSet`), `record-cache-kit` (`entityDisplayName`, `searchVaults`, `PlanSearchHit`, `isTempId`), `record-picker` (the type `OrgRecordHit`), `relation-role` (the type `RecordRelation`), `stakeholder-kinds` (the reader and its types, for `gilb-stakeholders`'), `term-origin` (`termOrigin`), `vault-origin-rule` (`vaultOriginOf`), `vocabulary-source` (`masterSource`, `TermFetch`), `@tanstack/react-query` and `react`, and of this unit's own files;
2. in `stakeholderKinds.ts` the constant `GILBVEDA_MASTER_ORIGIN` (line 39, `TYPE_TERM_ORIGIN` of the app, evaluated when the module loaded) is not copied; its three uses (lines 69, 71, 72) are `termOrigin()`, read when the reader is asked for; `export const STAKEHOLDER_TYPE_SET_QUERY_KEY = [...]` (line 59) is `export function stakeholderTypeSetQueryKey() { return [...] as const; }` and `queryKey: STAKEHOLDER_TYPE_SET_QUERY_KEY,` (line 100) is a getter `get queryKey() { return stakeholderTypeSetQueryKey(); },`, so that the key names the term origin as it is when the options are used, not as it was when the module loaded (the app set it from the build, before any module ran; an app on this library sets it at start-up). The doc comment that named the constant names the function;
3. `function useResolvedRefLabel(` (`EntityRefValue.tsx` line 18) is `export function useResolvedRefLabel(`: private in the app, where the component beside it called it; the component of `entity-ref-value` takes it through its `RefLabelContext`;
4. comments: the long headers of the files are new and shorter; internal cycle, ticket and agent tags, rulings and names are removed from the others (two comments are reworded, where a tag stood in the middle of a sentence); no code changed.

`src/index.ts` is new. **Non-GET `bearerHeaderFor` calls in the files taken: none** (the writes go through `lws-relations` and `lws-records`, which pass their method). **Dynamic imports in the files taken: none** (`grep "import("` of `planStakeholders.ts`, `stakeholderKinds.ts`, `useConstraintPeople.ts`, `relationHooks.ts` and `EntityRefValue.tsx`).

**Merged units compared with the app's functions (each reached symbol, comments stripped).** `plan-stakeholders-model`: every constant, type and function of `planStakeholders.ts` from line 21 to 226, all of `planConstraint.ts` and `StakeholderTypeSet` (`stakeholderKinds.ts` 41-57) are equal; the unit takes them as a peer and copies none. The symbols the model reaches (`plan-card-facts`' `memberValue` is the one the tag text uses) are not this unit's. `entity-ref-value`: `refDisplayName` is equal; `UseRefLabel` is the type of `useResolvedRefLabel`. `record-cache-kit` (0.3.0): `searchVaults`, `PlanSearchHit`, `entityDisplayName`, `recordsKey`, `isTempId` are equal. `lws-vault-sets`: `listVaultRecordsPage`, `searchEntities`, `typeLocalName` are equal. `lws-records` (0.3.0): `readRecord` is equal. `lws-relations`: `readRelations`, `relationsKey`, `writePairRelation` are equal; `memberEntityUri` and `endRelation` differ only in the named changes of that unit (`baseOrigin()`; the method at the bearer fallback). `record-picker`: `OrgRecordHit` differs only in the type of `row` (`PickerRow` for `BaseRecord`); no hit built here carries a row. `vault-origin-rule`: `vaultOriginOf` differs only in `baseOrigin()` for `BASE_ORIGIN`. `entity-ref`: `entityRefFromFact` is the same but for guards against an undefined group of the match. `stakeholder-kinds` and `vocabulary-source`: the package's `stakeholderKindReader`, `createStakeholderKindReader`, `masterSource`, `KIND_SET_MAX_AGE_MS`, `kindLabelOf` and `TermFetch` are those units' (inlined from the private package at the pin they cite).

Tests (`src/*.test.ts` and `.tsx`; shared set-up in `test/support.ts`, `test/wire.ts`, `test/authorityWire.ts` and `test/masterFixture.ts`, not shipped; the last is the served master of `stakeholder-kinds`' tests):

| Source | Ported / left out |
|---|---|
| `lib/base/planStakeholders.vaultit.test.ts`: `writeAuthorityRelation` (3 cases) and `migratedAuthorityRelation` (1 case) | Ported to `src/planStakeholdersIo.authority.test.ts`: the same inputs and expectations; the app's mocks of its signing and token manager are the fake host of the auth seam, and the hosts are example.test hosts. |
| `planStakeholders.vaultit.test.ts`: `authoritiesOf / stakeholdersOf` (2), `legacyAuthorityOf` (1), `actsForOnRelation` (1) | Left out: they test the pure functions, which are `plan-stakeholders-model`'s. |
| `lib/base/planQaTester2.vaultit.test.ts`: the two `findStakeholderRecords` cases | Ported to `src/planStakeholdersIo.finds.test.ts`. |
| `planQaTester2.vaultit.test.ts`: the other five (list writers, the Part of loop guard, `searchPlanRecords`) | Left out: other units' functions. |
| `lib/base/planConstraint.vaultit.test.ts` | Left out: `planConstraint.ts` is `plan-stakeholders-model`'s. |
| `components/records/RecordDetail.planStakeholders.vaultit.test.tsx` and the other tests that render the app's cards through these hooks | Left out: they go through the app's whole card, its shell and its router. |

New: `src/planStakeholdersIo.finds.behaviour.test.ts`, `src/planStakeholdersIo.authority.behaviour.test.ts`, `src/stakeholderKinds.test.ts` (the lazy key, the options, the set read from a served master, the reader's change reaching the cache), `src/relationHooks.test.tsx`, `src/useConstraintPeople.test.tsx`, `src/useResolvedRefLabel.test.tsx` (since 0.2.0 with the main-tag cases of the app's TagsEverywhere (2) and (3): a record with a name asks nothing, a `unitTag` is kept, a Plan record without a `unitTag` shows its main tag; and the hook order, the `title`-only record and an unknown tag), `src/hostFit.test.tsx` (the example above, type-checked against the lines' host), `src/exports.test.ts` and `src/hostAgnostic.test.ts` (the same host-agnostic check test as the other units). Mutation checks: 98 mutants of the five source files (`pilot/b3c/tools/specs/m10-plan-stakeholder-io.result.txt`): 90 killed. The eight that survive are equivalent or not observable from outside: the three explicit tests that a value is an address before `memberEntityUri` in `writeAuthorityRelation` (that function returns an address it is given unchanged, so removing the test changes nothing); the empty-label test in `orgHit` (the display name of an address is never empty: an address with an empty tail is named `e`); the deferred background check and the origin handed to a reader made over a fetch of its own (the reader keeps no store, so there is no warm answer to check and no key to name); the order of the list and the read in `useAuthorityTypes` (an address is in one or the other, never both); and the `types.error` half of `usePersonAuthorities`'s `error` (the types' query catches every read inside itself and cannot reject)..
