# stakeholder-find

Looks up the holder's existing records of a name as they type, before a new one is made.

## What this is

Looks up the holder's existing records of a name as they type, before a new one is made.

A React hook and a list for the "already in this vault" step of a create dialog for a stakeholder (a person or an organization). It holds no dialog and draws no form; it is the part of the dialog that watches the name, asks the vault for records of that name once typing has settled, drops the record the dialog started from, and offers the found ones in a list so the person opens or links one instead of making a second.

The hook (`useStakeholderCreate.ts`):

- `useStakeholderCreate(args)`: one call for the dialog, made above its closed-dialog return (it still runs while the dialog is closed). It reads the master's stakeholder vocabulary (the noun, the kinds, the field sets), puts the shortcuts first, keeps the chosen option on a stakeholder kind, corrects a vault that can no longer be written, settles the typed name, asks `findPeople` for it, and answers `{ noun, kindSearch, stakeholderKind, stakeholderGateOk, vaultChoices, kindNotReady, found, shortcuts, kindOptions, moreSearch, kindsStandIn, extraFieldsFromBoxes, linkKeep, createStakeholder, heldSaved }`. `found` is `{ data, error }`, the answer with the source record left out. `createStakeholder()` makes the record through `person-create` and refreshes its lists.
- The find: the name is looked up `300 ms` after the last key (`STAKEHOLDER_FIND_DEBOUNCE_MS`), only from `2` characters (`STAKEHOLDER_FIND_MIN_CHARS`), only with the dialog open, a stakeholder kind chosen, the picker reading in hand and a vault chosen. The query keeps its answer for 5 s (`staleTime: 5_000`) and does not retry (`retry: false`). Both constants are those of `person-create`, kept as the source has them.
- `STAKEHOLDER_FIND_KEY_PREFIX` (`["gilb-stakeholders", "find"]`) and `refreshStakeholderFinds(qc)`: after a record is written, cancel the finds in flight and drop the cached answers, so an active search is asked again.
- `StakeholderCreateGuardError`: thrown by the two checks before the package is asked (no writable vault chosen; not signed in or the form not read).
- Types: `UseStakeholderCreateArgs`, `StakeholderFindHost`, `StakeholderFindSession`, `StakeholderFindResult`, `KindsStandInDecision`, `CreateMode`.

The list (`StakeholderMatches.tsx`): `StakeholderMatches({ found, linking, busy, onPick })` draws "Already in this vault - open this one instead of making a new one:" (or "link this one" while linking), one button per candidate (the label; with the id tail after it when two rows carry the same label; the bare address when a row has no label), "Not every record was read; there may be more." when the find was not complete, and the error in the package's words when the find failed.

Private to the unit: `stakeholderNoun.ts` (`useStakeholderNoun`), `sameLabel.ts` (`shortIdTail`, `labelsSeenTwice`) and `IdTail.tsx` (copies of three small app files, see "Where it came from").

## What this is not

- Not the dialog, the type chooser, the first step (`StakeholderStart`), the connect-existing panel or the form's fields.
- Not the find itself or the create: `findPeople`, `recordPerson` and `afterRecordPerson` are `person-create`'s.
- Not a read-only list: `createStakeholder` writes. A host that must not write does not call it (the hook's other results are reads), but the unit is installed with the write layer of `person-create`.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-find`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-find` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/stakeholder-find

```

Of those, this unit imports from nine: `person-create` (`findPeople`, `recordPerson`, `afterRecordPerson`, `recordableKinds`, `personBoxes`, `heldLabelsWritten`, `pickerReadingQuery`, `isStakeholderKindOption`, `stakeholderTypeOptions`, `stakeholderTypeSearch`, `stakeholderErrorText`, the two find constants and the type `PersonCreateHost`), `stakeholder-card-vocabulary` (`stakeholderCardVocabularyQuery`, the type `CardVocabularyHost`), `stakeholder-card-model` (`isListedKind`), `contact-kind-model` (`startShortcuts`, `orderByShortcuts`, `moreTypeOptions`), `ontology-reads` (the types `TypeOption`, `TypeSearchFn`), `pick-or-create` (the types `FindResult`, `Candidate`), `plan-record-hooks` (the type `ReachableVault`), `record-types` (the type `FieldSpec`) and `id-tail` (`idFromEntityUri`); and from the third-party `@tanstack/react-query` and `react`. The install line is long because those units have peers of their own.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { StakeholderMatches, useStakeholderCreate, type StakeholderFindHost, type UseStakeholderCreateArgs } from "@kaigilb/gilbplatformcode-stakeholder-find";

setBaseOrigin("https://platform.example.test"); // once, at start-up
setTermOrigin("https://ontology.platform.example.test"); // once, at start-up

const host: StakeholderFindHost = { defaultWriteVaultId: yourDefaultWriteVaultId, vocabulary: yourCardVocabularyHost, person: yourPersonCreateHost };

function Step(props: Omit<UseStakeholderCreateArgs, "host">) {
  const s = useStakeholderCreate({ ...props, host });
  return <StakeholderMatches found={s.found} linking={false} busy={false} onPick={(c) => openOrLink(c.record)} />;
}
```

## What the host must supply

- The origins: `setBaseOrigin(origin)` of `base-origin` and `setTermOrigin(origin)` of `term-origin`, once at start-up.
- `StakeholderFindHost`, passed as `host` in the hook's arguments. Keep the object the same between renders: the hook's effects do not list it in their dependencies, as the source's effects did not list the functions they called.
  - `defaultWriteVaultId(vaults, viewedVaultId)`: the vault on screen when it can be written, else the landing vault, else the first writable one, else `null`. Replaces `defaultWriteVaultId`, GilbApp `src/lib/base/writableVaults.ts` line 61, called at `useStakeholderCreate.ts` line 174 with the dialog's writable list and `contentScope.readVaultId`. The vault list's own function of that name takes another row type (`isLanding` where this takes `isLandingVault`), so it is not taken as it is. Called only when the chosen vault is not in the writable list, to correct it.
  - `vocabulary`: the `CardVocabularyHost` of `stakeholder-card-vocabulary` (its `masterKindReader`, and `persistVocabulary` when wanted). Passed to `stakeholderCardVocabularyQuery(host.vocabulary)` twice: by the hook and by the noun. The app called `stakeholderCardVocabularyQuery()` with no argument.
  - `person`: the `PersonCreateHost` of `person-create` (`adderCardOf`, `rememberCreatedIn`). Passed to `recordPerson(host.person, ...)` and `afterRecordPerson(host.person, ...)` inside `createStakeholder()`. The app called them with no host.
- The hook's arguments, as the dialog holds them: `inStakeholders`, `open`, `mode`, `option`/`setOption`, `vaultId`/`setVaultId`, `displayName` (already trimmed), `values`, `source`, `contentScope.readVaultId`, `vaults`, `writable`, `session` (only `principal` is read) and the `queryClient`. All of them are the caller's: the unit keeps no state of its own across calls except the typed name it settles.
- A React Query `QueryClientProvider` above the hook.
- Styles: the unit has no stylesheet. Its classes are Tailwind v4 utilities with arbitrary values, so the host runs Tailwind with `@source "<path>/units/stakeholder-find/src";`. The CSS variables it uses are `--r-md`, `--sel` (the list's buttons, `StakeholderMatches.tsx`) and `--ink-ghost` (the id tail, `IdTail.tsx`). Two `data-testid` values: `connected-create-matches` and `connected-create-match-<id of the record>`.

## Module state

None. The unit holds no module-level variable. The state it relies on is in the units it reads (`person-create`'s `fallbackQueryClient` and find test hook, `term-origin`, `base-origin`), each of which must exist once in an app.

## Do not

- Do not change the settle (300 ms), the shortest name (2) or the query's `staleTime: 5_000` and `retry: false`: they are the behaviour the dialog was measured with.
- Do not ask the find for a name in a vault the person did not choose, or with the dialog closed.
- Do not offer the record the dialog started from as a match for itself.
- Do not install a second copy of this unit's peers that hold state (see "Module state").

## Wrong readings

- "The list shows every record of that name." It shows the holder's records the vault answers with; when the read was not whole it says there may be more.
- "The hook creates nothing until `createStakeholder()` is called." True, and it is called by the dialog's button; the find itself is a read.
- "The host's `defaultWriteVaultId` picks the vault on every render." It is asked only when the chosen vault has left the writable list; a choice the person made is never moved.
- "`StakeholderMatches` fetches." It draws what `found` holds.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/useStakeholderCreate.ts` (whole, 360 lines) to `src/useStakeholderCreate.ts`;
- `src/components/records/StakeholderMatches.tsx` (whole, 66 lines) to `src/StakeholderMatches.tsx`;
- `src/lib/base/stakeholderNoun.ts` (whole, 15 lines) to `src/stakeholderNoun.ts`, `src/lib/base/sameLabel.ts` (whole, 22 lines) to `src/sameLabel.ts` and `src/components/records/IdTail.tsx` (whole, 6 lines) to `src/IdTail.tsx`: no merged unit holds them (`id-tail` holds the id-tail functions, not the `IdTail` component).

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded).
- `isListedKind` (`stakeholder-card-model`) is the same as `stakeholderCard.ts`; `FieldSpec` (`record-types`), `TypeOption`, `TypeSearchFn` (`ontology-reads`), `startShortcuts`, `orderByShortcuts`, `moreTypeOptions` (`contact-kind-model`) and `ReachableVault` (`plan-record-hooks`) are the same as the app's. `idFromEntityUri` (`id-tail`) is the same function as `search.ts`'s (`slashTail`: the text after the last `/`, the whole text when there is none).
- `stakeholderCardVocabularyQuery` (`stakeholder-card-vocabulary`) takes the vocabulary host as its first argument (named change 3).
- `defaultWriteVaultId` of `vault-list` is not the same (another row type), so it is a host member.

Named changes, and only these:

1. the imports are the peers above; `./stakeholderNoun`, `./sameLabel`, `./IdTail` and `./useStakeholderCreate` stay the unit's own;
2. `import type { CreateMode } from "./CreateModeChooser"` is the type `CreateMode` written in the unit, the same five strings (a structural copy: the dialog's own type is accepted as it is); `FOLDER_TYPE_ID` (`"folder"`, from `folderTypeId.ts`) is a private constant in the unit; `BaseSession` is the exported interface `StakeholderFindSession` (`principal: string`), the only member the hook reads;
3. the interface `StakeholderFindHost` is added and exported, and `UseStakeholderCreateArgs` gets `host: StakeholderFindHost` (also destructured); `useStakeholderNoun(inStakeholders && open)` is `useStakeholderNoun(host.vocabulary, inStakeholders && open)` (the unit's copy takes the vocabulary host first, and passes it to `stakeholderCardVocabularyQuery(host)`); `stakeholderCardVocabularyQuery()` is `stakeholderCardVocabularyQuery(host.vocabulary)`; `defaultWriteVaultId(writable, contentScope.readVaultId)` is `host.defaultWriteVaultId(writable, contentScope.readVaultId)`; `recordPerson({ reading: reading.data, queryClient }, {...})` is `recordPerson(host.person, { reading: reading.data, queryClient }, {...})`; `afterRecordPerson(queryClient, made)` is `afterRecordPerson(host.person, queryClient, made)`;
4. comments that name a cycle, a ticket, a person, a ruling or the host app are reworded; no code changed. `StakeholderMatches.tsx`, `sameLabel.ts` and `IdTail.tsx` are otherwise the source (identical tokens).

`src/index.ts` is new. No test seam was added.

## Tests

`src/*.test.ts*` (shared set-up in `test/`, not shipped; `test-setup.ts` loads `jest-dom` and cleans up after each test, as `claude-code-connect`'s does). Hosts are `example.test` hosts, the people Ann and Ben.

- Ported from GilbApp `src/components/records/StakeholderMatches.c214b05d.test.tsx`: 7 of 7 (`StakeholderMatches.test.tsx`). Only the import of `Candidate` and the example hosts changed.
- New: `useStakeholderCreate.test.tsx` (22) against a fake host (`test/fakeHost.ts`) and a query client seeded with the vocabulary and the picker reading, `person-create`'s find hook standing for the vault. Fake timers, no sleeps. It pins the constants and the key prefix; the 300 ms settle (nothing before 300 ms, one ask with the settled name, a restart on a new key, nothing with the dialog closed, a closing dialog, no stakeholder kind); the 2-character floor, an emptied name, no vault; the 5 s `staleTime` (a name asked again within 5 s is answered from the cache, after 5 s it is asked again), the same name in another vault, no retry of a failed find, and `refreshStakeholderFinds`; the source record left out by id, by an address given as the id and by its address, and the answer handed on as it is with no source; the host (`defaultWriteVaultId` called with the writable list and the vault on screen only when the choice has left the list, the noun, the vocabulary asked of the host's reader); the guards of `createStakeholder` and the gate.
- `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: the hook has no test of its own in the app (it is tested only inside the `ConnectedCreateDialog` page suites, 334 cases, which need the whole dialog); those are not ported. The success path of `createStakeholder` (the call of `recordPerson` and `afterRecordPerson` with `host.person`) is not pinned here: it needs a served master and the tag routes, which `person-create`'s own tests hold.
