# org-employees

Lists an organization's employees inline and in a searchable sheet.

## What this is

Lists an organization's employees inline and in a searchable sheet.

The Employees group of an organization card: the reader that finds the people, and the components that draw them.

- `OrgEmployeesSection({ orgUri, vaultId, onOpen })`: the card group "Employees". It draws at most `INLINE_EMPLOYEES` (10) rows, a count in the group's aside, and, when there are more, the button that opens the full list in a sheet. Reading and failed states are said in words; a failed read is never shown as "none".
- `OrgShortList`, `OrgListSheet`, `OrgEmployeeRow`, `useOrgEmployees`: its parts. `OrgShortList` and `OrgListSheet` take any item type that has an `id` and a `name` (`ListItem`), with the words in `ListLabels`; they are not tied to employees.
- `readOrgEmployeesPage(host, org, vaultId, page, deps?)`: one page of the list. The people come from two sources, the employment records whose `a:employer` names the organization and the people whose own `a:memberOf` names it; a person in both is one row with every title. The read is the viewer's own authorised read: a person the viewer may not read is neither listed nor counted. A member-of hit is listed only when it reads as a person (the card's person kinds). Every find is asked at the vault's own origin.
- `searchScopeSentence`, `noMatchSentence`, `stillLoadingSentence`, `groupCountText`, `filterEmployeesByName`, `foldName`, `SEARCH_DEBOUNCE_MS` (250), `FULL_LIST_STEP` (50), `INLINE_EMPLOYEES` (10), `EMPLOYEES_PAGE` (50): the search over the loaded list and the words that say what was searched.
- `pagedFindBothSpellings`: one page across the two address spellings of a record (`/base/e/` and `/vault/e/`) as one list.
- `orgSectionOrder`: the order of the organization card's sections.
- `subjectSpellings`, `inVault`: pure helpers, copied from the app (see "Where it came from"); `org-hierarchy` takes them from here.
- `refsOf`, `servedValue` and the type `EmploymentLinkVocab`: re-exported from `org-terms`, as in 0.1.0 (see "Changes in 0.2.0").
- `OrgEmployeesHostContext`, `useOrgEmployeesHost`, and the types `OrgEmployeesHost`, `ReadResource`, `RecordFaceProps`: how the host gives the group what no unit holds.
- `__resetPersonKinds()`: a test seam, never called by product code (see "Module state").

Test ids: `org-employees-section`, `org-employees-count`, `org-employees-error`, `org-employees-textonly`, `org-employees-sheet`, `org-employee`, `org-employee-name`, `org-employee-title`, and the sheet's own (27 in all in the source).

## What this is not

- Not the organization card: the group only. The card, the other groups and the order they are placed in are the caller's (`orgSectionOrder` is the one helper for that).
- Not a store: it holds no list of its own. The caller's `QueryClient` caches the pages (`useInfiniteQuery`).
- Not the person's card: a tap calls `onOpen(personId)` and the caller opens it.

## How to take it

Package: `@kaigilb/gilbplatformcode-org-employees`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/org-employees` prints. That command prints the full install line (it is long because the peers have peers of their own). Of those, this unit imports from thirteen: `card-group` (`CardGroup`), `lws-records` (`readRecord`), `lws-vault-sets` (`findByAttribute`, `AttributeFindResult`, `mapWithConcurrency`, `MAX_PARALLEL_DEREFERENCES`, `typeLocalName`), `open-popups` (`eventTargetInTopDialog`, `modalIsOpen`), `org-terms` (`refsOf`, `servedValue`, `resolveEmploymentLinkVocab`, the type `EmploymentLinkVocab`), `photo-term` (`photoRefFromFacts`), `plan-stakeholder-io` (`masterKindReader`), `record-picker` (`useDebouncedValue`), `resource-id` (`idFromResourceUri`), `stakeholder-card-model` (`partyNameOf`, `personKindNamesOf`), `stakeholder-card-vocabulary` (`cardMasterSource`, `readStakeholderCardVocabulary`, `readStoredCardVocabulary`), `term-slots` (`attributeSpelling`) and `vault-origin-rule` (`vaultOriginOf`); and from the third-party `@tanstack/react-query` (`useInfiniteQuery`), `react` and `react-dom` (`createPortal`).

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { OrgEmployeesHostContext, OrgEmployeesSection, type OrgEmployeesHost } from "@kaigilb/gilbplatformcode-org-employees";

const host: OrgEmployeesHost = {
  readResources: yourReadResources,                 // (uris, vaultId) => Promise<ReadResource[]>
  photoReadKeys: yourPhotoReadKeys,                 // () => Promise<readonly string[]>
  RecordFace: YourRecordFace,                       // optional
  useSheetHistory: yourUseSheetHistory,             // a hook
  dropStaleSheetEntry: yourDropStaleSheetEntry,
};

<OrgEmployeesHostContext.Provider value={host}>
  <OrgEmployeesSection orgUri="https://v.example.test/base/e/org1" vaultId="https://v.example.test/base" onOpen={(personId) => openPerson(personId)} />
</OrgEmployeesHostContext.Provider>;
```

## What the host must supply

- The providers the peers need: a `QueryClientProvider` (the group uses `useInfiniteQuery`), a card-mode provider above the `CardGroup` (see `card-group`), `setBaseOrigin` of `base-origin` and `setTermOrigin` of `term-origin` once at start-up (the employment link spellings are read by `org-terms`, through `term-origin`; the host supplies nothing for them), and the signed-in session of `lws-records` and `lws-vault-sets`.
- `OrgEmployeesHostContext.Provider`, above the group, with an `OrgEmployeesHost`. Without it, the group, the row and the reader throw an error that names the provider.
  - `readResources(uris, vaultId)`: reads many records, at most six in flight, in input order. A record the store answered 404 for comes back with `gone: true` and an empty `doc`; any other failed read rejects. Called once per page, with the employment addresses. Replaces `readResources`, GilbApp `src/lib/mynet/place/lws.ts:164` (the default `readEmployments`, `orgEmployees.ts:100`).
  - `photoReadKeys()`: every spelling a stored photo fact may carry, asked once per page; the unit reads the picture with `photoRefFromFacts` of `photo-term` from the keys and the person's facts. A rejection lists the people without pictures. Replaces `photoReadKeys`, GilbApp `src/lib/base/photoTerm.ts:37` (`orgEmployees.ts:107`).
  - `RecordFace` (optional): the face of a record, given `{ photoRef, readRecordFor: null, vaultId, name, className, fallback }`. Absent: no face is drawn (not even the initial); the name and titles still show and the row still opens the person. This is a named change. Replaces `RecordFace`, GilbApp `src/components/records/RecordFace.tsx:22`.
  - `useSheetHistory(open, onClosed)`: a hook, called on every render of `OrgShortList` in the same place and never conditionally; it returns `{ requestClose(after?) }`. Required. The sheet is a history entry: opening pushes one, the system Back closes the sheet only, closing from inside removes the entry. Replaces `useSheetHistory`, GilbApp `src/components/records/useSheetHistory.ts:41`.
  - `dropStaleSheetEntry()`: called once when the short list mounts; a reload that landed on a sheet's entry steps off it. Replaces `dropStaleSheetEntry`, `useSheetHistory.ts:32`.
- Tailwind scanning this unit's `src` (the classes include arbitrary values such as `text-[var(--ink-soft)]`), and these CSS variables: `--ink`, `--ink-soft`, `--ink-faint`, `--accent`, `--line`, `--bad`, `--surface`, `--surface-sunken`, `--paper`, `--serif`.
- React 19.

## Module state

- `personKindsRead` (`orgEmployees.ts` line 115; line 118 in the source): a module promise of the session's person kind names. The first page that lists a member-of hit reads them (the card's vocabulary kept on the device first, else once from the master) and every later page of every organization reuses the promise. A failed read is not kept: the next page asks again, and each member-of hit is counted as left out meanwhile. `__resetPersonKinds()` clears it; only tests call it.

Two installed copies of this unit would each read the kinds once and keep their own promise. The units it reads also hold state and must exist once in an app: `term-origin`, `base-origin`, `lws-vault-sets`, `stakeholder-card-vocabulary`, `record-picker` and `org-terms` (whose caches hold the employer and employee spellings).

## Do not

- Do not give the group a find key or call a value-plane find: the read is the viewer's own authorised read, and an employment is not made findable by it.
- Do not list a person by matching a company name in text: an employment that names the company only in text is not linked and is not listed.
- Do not widen what a person may see: a person the viewer may not read is neither listed, counted nor named.
- Do not ask a find at the platform's apex: ask it at the vault's own origin (the unit does).
- Do not call `useSheetHistory` conditionally in your host's wrapper; the group calls it on every render.
- Do not call `__resetPersonKinds` from product code.
- Do not install a second copy of this unit.

## Wrong readings

- "The group shows every employee." It draws 10; the rest are in the sheet, which loads `FULL_LIST_STEP` (50) more at a time and searches what is loaded.
- "The count is the number of people in the organization." It is the number the viewer may read and has loaded; the group says when more exist.
- "No face means no photo is read." The photo reference is still read from the person's facts and passed to the row; only the host's drawing of it is absent.
- "A failed read says there are none." It says the employees could not be read and that this is not a statement that there are none.
- "`subjectSpellings` and `inVault` belong to this unit's concern only." They are the app's held-note helpers, copied; `org-hierarchy` takes them from here.
- "The app's `RecordFace` is a unit." It is a host member here; this unit does not draw photos.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, each file whole to the file of the same name:

- `src/lib/base/orgCard/orgEmployees.ts` (258 lines), `orgEmployeeSearch.ts` (97), `pagedFind.ts` (57), `orgCardOrder.ts` (14);
- `src/components/records/orgCard/OrgEmployeesSection.tsx` (69), `OrgEmployeeRow.tsx` (35), `OrgShortList.tsx` (147), `OrgListSheet.tsx` (198), `useOrgEmployees.ts` (50);
- `src/lib/mynet/heldnote/heldNote.ts` lines 116-123 (`subjectSpellings`) and 130-142 (`hostOf`, `inVault`) to `src/subjectSpellings.ts`: pure functions no merged unit holds, each with its doc comment. Compared token for token with the source: the same. (`orgTerms.ts` lines 47-58, `refsOf` and `servedValue`, were copied to `src/servedValue.ts` in 0.1.0; since 0.2.0 they come from `org-terms`.)

`src/index.ts` and `src/orgEmployeesHost.ts` are new.

**Named changes** (a token comparison of every file with its source, comments and imports excluded, gave 11 hunks in `orgEmployees.ts`, 3 in `OrgEmployeeRow.tsx`, 3 in `OrgShortList.tsx`, 2 in `useOrgEmployees.ts` and none in the other five; all below):

1. The imports are the peers' (listed in "How to take it"; the source imported `gilb-photo`, `../attributeFind`, `../config`, `../records`, `../partyName`, `../photoTerm`, `../recordPlane`, `../stakeholderCard`, `../stakeholderKinds`, `../termSlots`, `../../mynet/place/lws`, `../../mynet/employment/employmentLinkVocab`, `../heldTypes`, `./orgTerms` (`refsOf`, `servedValue`), `../CardGroup`, `./useDebouncedValue`, `../useSheetHistory`, `../RecordFace`, `../../ui/layers`).
2. `orgEmployees.ts`: `const defaultDeps = { ... }` is `const defaultDepsOf = (host: OrgEmployeesHost): EmployeesDeps => ({ ... })`; in it `readEmployments` is `(uris, vaultId) => host.readResources(uris, vaultId)`, `photoKeys` is `() => host.photoReadKeys()`, `employerAttr` and `employeeKey` call `resolveEmploymentLinkVocab()` of `org-terms` as the source called its own (`.employer`, `.employee.replace(/^a:/, "")`); `readOrgEmployeesPage(` takes `host: OrgEmployeesHost` as its first parameter and its default `deps` is `defaultDepsOf(host)`.
3. `OrgEmployeeRow.tsx`: `<RecordFace ...>` is `{RecordFace ? <RecordFace ...> : null}` with `const { RecordFace } = useOrgEmployeesHost();`.
4. `OrgShortList.tsx`: `useSheetHistory(` and `dropStaleSheetEntry(` are `host.useSheetHistory(` and `host.dropStaleSheetEntry(` with `const host = useOrgEmployeesHost();`, at the same places.
5. `useOrgEmployees.ts`: `const host = useOrgEmployeesHost();` and `readOrgEmployeesPage(host, ...)`.
6. Comments made generic (cycle, step, tester and ruling tags, dates, person names, app names removed).

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded).
- Same: `mapWithConcurrency` (235 tokens) and `MAX_PARALLEL_DEREFERENCES` of `lws-vault-sets` (not `map-limit`, a false friend), `typeLocalName`, `AttributeFindResult`, `readRecord` of `lws-records`, `partyNameOf` and `personKindNamesOf` of `stakeholder-card-model`, `attributeSpelling` of `term-slots`, `useDebouncedValue` of `record-picker`, `eventTargetInTopDialog` and `modalIsOpen` of `open-popups`.
- Same except the settings seam: `findByAttribute` and `vaultOriginOf` (`baseOrigin()` where the app read `BASE_ORIGIN`), `cardMasterSource`, `readStakeholderCardVocabulary`, `readStoredCardVocabulary` and `masterKindReader` (`termOrigin()` where the app read `GILBVEDA_MASTER_ORIGIN`; the device copy is also the peer's, which the host can switch off with `persistVocabulary`).
- `idFromResourceUri` of `resource-id`: the same regular expression; `m ? m[1]! : uri` is `m?.[1] ?? uri`. The capture group needs one or more characters, so the two give the same answer for every string.
- `photoRefFromFacts` of `photo-term`: the app takes it from the private `gilb-photo`. Compared with `gilb-photo` at `bf56ec7`, over 953,520 inputs (3,973 address and id strings found in the frozen app source and tests, with key lists and value shapes), 571,680 of them with a non-null answer: no difference.
- `resolveEmploymentLinkVocab`, `refsOf`, `servedValue` of `org-terms`: copied from the same lines of the same commit (token diff 0 hunks), so imported.
- **Not taken.** `readResources` and `photoReadKeys` are MyNet and photo-term-cache libraries that no unit holds (the `photo-term` README names its cold-start difference from the app's `photoTerm.ts`), so they are host members. `RecordFace` and `useSheetHistory` are the app's own components.

**Tests.** 78 lib tests are the source's, ported (`orgEmployees` 49, `orgEmployeeSearch` 18, `pagedFind` 8, `orgCardOrder` 3). 82 component tests are the source's (the brief counted 65 in 5 files; the source has 6 files for this component: `OrgEmployeesSection` s8org 8, s9fix 9, s10fix 6, s12 31, s12f1 11 and `OrgEmployeesSheet.history.s12` 17). Their ten `vi.mock`s of the app's modules are one fake host (`test/fakeHost.tsx`) and one mock of `./orgEmployees` for the reader (the component tests drive the group, not the reader). Fixture hosts are `example.test`. Waits for the clock use the virtual timers of `test/timing.ts` for the long timers; the tests' `waitFor` polls the DOM as in the source. 65 tests are new: `exports.test.ts` (29: each export pinned), `hostWiring.test.ts` (13: the two data members, the `org-terms` peer and the module promise), `hostComponents.test.tsx` (8: the context, the optional face, the history members), `reexport.test.ts` (5: what is re-exported from `org-terms`, and the missing host member) and `hostAgnostic.test.ts` (10). In all 225 tests. Left out: none of the nine files' tests; the organization number, hierarchy and units sections' tests belong to other units.

## Changes in 0.2.0

Reason: 0.1.0 copied `refsOf` and `servedValue` (GilbApp `orgTerms.ts` lines 47-58) into `src/servedValue.ts` and made `resolveEmploymentLinkVocab` a host member, because no unit held them. With `org-terms` 0.1.0 on main, that would have put one symbol in two units.

- `src/servedValue.ts` is deleted. `orgEmployees.ts` imports `refsOf`, `servedValue` and `resolveEmploymentLinkVocab` from `org-terms`. The entry point still exports `refsOf`, `servedValue` and the type `EmploymentLinkVocab`, now re-exported from `org-terms`.
- `resolveEmploymentLinkVocab` is no longer a member of `OrgEmployeesHost`. A host that had it can drop it; one that keeps it is not called (object literals that name it no longer type-check). This REMOVES one of the named changes of 0.1.0 (the `host.resolveEmploymentLinkVocab()` calls) and the declaration of `EmploymentLinkVocab` in `src/orgEmployeesHost.ts`.
- New peer: `org-terms` `^0.1.0` (a singleton: one copy per app). Nothing else changed.
- Tests: the 5 tests of `servedValue.test.ts` moved with the code to `org-terms`; the tests of `hostWiring.test.ts` that gave the fake host a `resolveEmploymentLinkVocab` member now mock `resolveEmploymentLinkVocab` of `org-terms`, as the app's `orgFinds.defaults.s9fix.test.ts` mocked its `employmentLinkVocab` module; `test/fakeHost.tsx` no longer has the member.
