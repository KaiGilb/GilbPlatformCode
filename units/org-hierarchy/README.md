# org-hierarchy

Shows and edits an organization's parent organization and units.

## What this is

Shows and edits an organization's parent organization and units.

The two hierarchy groups of an organization card, with the reads and the rules under them.

- `OrgPartOfSection({ record, vaultId, parentRef, canEdit, onOpen, onSaved })`: the group "Part of". It draws the chain from this organization UP to the head office, nearest first, one link per level (`onOpen(id)`), and says where the chain does not end at a head office: "Not visible" (a level the viewer may not read), "Loop" (a stored loop, not followed) and "Stopped" (past `ORG_DEPTH_CAP`, 20). A chain that could not be read is said, never drawn as "no parent". In edit mode it offers "Set the parent organization" / "Change the parent organization" (a picker over the organization records of the vault) and a remove control on the first parent. No edit control is drawn for a viewer who cannot write, or in presentation.
- `OrgUnitsSection({ orgUri, vaultId, onOpen })`: the group "Units", the organizations directly below this one. A short list of 10 rows (`OrgShortList` of `org-employees`), each with its mark (`org-mark`), its name and, on the card only, its count of employment records, read lazily for the first ten units loaded and never for a row of the full-list sheet; a count that could not be read is not shown (never 0). The aside says the honest count ("2 units shown of 200").
- `setParentOrganization({ record, parent, previous?, read?, patch? })`: the writer. It checks the loop rule first (`checkParentWrite`), writes ONE scalar link on THIS (the child's) record only and never the parent's, reads the chain again, and when the write made a loop with another session's write it puts the previous parent back and answers `PARENT_RACE_TEXT`. Resolves `null` on success, the sentence on a refusal.
- `readOrgUnitsPage(org, vaultId, page?, deps?)`, `readUnitEmployments(uri, vaultId, deps?)`, `UNITS_PAGE` (50), `useOrgUnits(orgUri, vaultId)`: the reads under the Units group. A page is the unit records only (one find per address spelling of the organization, one record read per unit); a unit's count is its own read of two finds (both address spellings, together), and fails to `null`.
- `readOrganization(uri, read?)`, `organizationParentReader(read?)`, `findOrganizationRecords(vaultId, text, opts?)`, `organizationTypeUri()`: one organization record as the viewer may read it (`unreadable`, never "empty"); the reader the walker is handed (a record that holds more than one parent is unreadable); the organization records of one vault matched to typed text by one server search (or one page of the list for no text); the address of the type `Organization`.
- `walkUp(start, read, cap?)`, `checkParentWrite(child, proposedParent, read, cap?)`, `orgKey(uri)`, `ORG_DEPTH_CAP`: the pure rule (no import): the safe walk up with a visited set and a depth cap, and the writer's refusal of an own parent, a loop, an unreadable link or a chain deeper than the cap.
- `chainEndText`, `PARENT_RACE_TEXT`, `FOCUS` (the focus ring of a row that opens a record, exported for other cards' rows).

Test ids: `org-partof-section`, `org-chain`, `org-chain-node`, `org-chain-link`, `org-chain-hidden`, `org-chain-end`, `org-partof-add`, `org-partof-change`, `org-partof-error`, `org-units-section`, `org-unit`, `org-unit-name`, `org-unit-count`, `org-units-count`, `org-units-error`, and those of `OrgShortList` and `OrgMark`.

## Changes in 0.1.2

- `findOrganizationRecords` with typed text answers `complete: false` when a hit the search named could not be read (the read failed, or the record is not served to the viewer). Before, that hit was dropped and the answer still said it was complete, so a caller could say "no such organization" about a list it had not read. The hit is still not offered.

## Changes in 0.1.1

Package metadata only; no source or test change. The unit's `devDependencies` gain `held-notes` and the units of its peer tree, and the lockfile is refreshed (no third-party version changes), because `org-employees` 0.2.1 imports `subjectSpellings` and `inVault` from `held-notes`. The peer ranges of this unit are unchanged.

## What this is not

- Not the organization card: two groups only. The card, the other groups and their order are the caller's.
- Not a store of the parent: the value is the DIRECT parent only, one scalar on the child's record. The chain and the children are read, never stored, and nothing is written to the parent.
- Not the platform's check of a loop: the platform does not enforce `a:acyclic` for this term. The writer here checks, and every reader walks with a visited set and a depth cap.
- Not a find key: the units are the viewer's own authorised read of "who points here" and widen nobody's reach.

## How to take it

Package: `@kaigilb/gilbplatformcode-org-hierarchy`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/org-hierarchy` prints. That command prints the full install line (it is long because the peers have peers of their own). Of those, this unit imports from thirteen: `card-group` (`CardGroup`), `card-mode` (`useCardMode`), `lws-records` (`patchRecord`, `readRecord`), `lws-vault-sets` (`findByAttribute`, `AttributeFindResult`, `mapWithConcurrency`, `MAX_PARALLEL_DEREFERENCES`, `listVaultRecordsPage`, `searchEntities`, `typeLocalName`), `org-employees` (`OrgShortList`, `ListLabels`, `INLINE_EMPLOYEES`, `groupCountText`, `pagedFindBothSpellings`, `subjectSpellings`, `inVault`), `org-mark` (`OrgMark`), `org-terms` (`resolveOrgTerms`, `refsOf`, `servedValue`, `resolveEmploymentLinkVocab`), `record-picker` (`OrgRecordPicker`, the type `OrgRecordHit`), `remove-control` (`RemoveControl`), `resource-id` (`idFromResourceUri`), `stakeholder-card-model` (`partyNameOf`), `term-origin` (`termOrigin`) and `vault-origin-rule` (`vaultOriginOf`); and from the third-party `@tanstack/react-query` (`useQuery`, `useQueryClient`, `useInfiniteQuery`) and `react`.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { OrgPartOfSection, OrgUnitsSection } from "@kaigilb/gilbplatformcode-org-hierarchy";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { OrgEmployeesHostContext } from "@kaigilb/gilbplatformcode-org-employees";
import { OrgMarkHostContext } from "@kaigilb/gilbplatformcode-org-mark";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";

// Once, above the groups (the hosts are the ones the peers describe):
<QueryClientProvider client={queryClient}>
  <OrgEmployeesHostContext.Provider value={yourOrgEmployeesHost}>   {/* OrgShortList: useSheetHistory, dropStaleSheetEntry (and the employees members, never called here) */}
    <OrgMarkHostContext.Provider value={{ downloadFileOutcome: yourBoundedFileRead }}>
      <PickerQueryContext.Provider value={usePickerQuery}>           {/* ({ key, run, enabled, staleTime }) => useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false }) */}
        <CardModeProvider canEdit={canEdit}>
          <OrgPartOfSection record={{ id, entityUri }} vaultId={vaultId} parentRef={parentOfThisRecordOr("")} canEdit={canEdit} onOpen={openRecord} onSaved={reloadRecord} />
          <OrgUnitsSection orgUri={entityUri} vaultId={vaultId} onOpen={openRecord} />
        </CardModeProvider>
      </PickerQueryContext.Provider>
    </OrgMarkHostContext.Provider>
  </OrgEmployeesHostContext.Provider>
</QueryClientProvider>;
```

## What the host must supply

This unit has no host object of its own: every call that leaves it is a unit's. The host gives what its peers ask for:

- `QueryClientProvider` (the groups use `useQuery`, `useQueryClient` and `useInfiniteQuery`). The reads set `retry: false` and these keys and stale times, which a host that invalidates by key can rely on: `["mynet", "org-chain", record, parentRef]` (15 s; the write invalidates `["mynet", "org-chain"]`), `["mynet", "org-units", vaultId, orgUri]` (30 s) and `["mynet", "org-unit-employments", vaultId, unitUri]` (30 s).
- `OrgEmployeesHostContext.Provider` with an `OrgEmployeesHost` (from `org-employees`): `OrgShortList` reads `useSheetHistory` and `dropStaleSheetEntry` from it. This unit calls none of its data members (`readResources`, `photoReadKeys`), but the type requires them.
- `OrgMarkHostContext.Provider` with an `OrgMarkHost` (from `org-mark`): each unit row draws an `OrgMark`, whose logo is read through the host's `downloadFileOutcome`.
- `PickerQueryContext.Provider` with the picker's query hook (from `record-picker`). It must pass `retry: false`, as the source's own call did, or a failed search is asked again behind the user's back. Without it the parent picker throws an error that names the provider.
- A card-mode provider above the groups when the card is managed (`CardModeProvider` of `card-mode`; see `card-group`).
- The settings, once at start-up: `setBaseOrigin` of `base-origin`, `setTermOrigin` of `term-origin`; and the signed-in session of `lws-records` and `lws-vault-sets`.
- Tailwind v4 scanning this unit's `src`: `@source "<path>/units/org-hierarchy/src";`. The classes include arbitrary values such as `text-[var(--ink-faint)]`. This unit's own CSS variables: `--accent`, `--bad`, `--ink`, `--ink-faint`, `--ink-soft`; the peers' are in their READMEs.
- React 19.

## Module state

None of its own. The units it reads hold state and must exist once in an app: `org-terms` (the term spellings), `org-mark` (the logo cache and pool), `term-origin`, `base-origin`, `lws-vault-sets` and `record-picker`. This unit keeps no cache beside the query client.

## Do not

- Do not write the parent's record: setting a parent writes the child's side only. The units group is a read.
- Do not give the groups a find key, or ask a find at the platform's apex: ask at the vault's own origin (the reads do).
- Do not call `setParentOrganization` without the loop check, and do not take `parentOrganization` as an array: it is one scalar link.
- Do not show a read that failed as "no parent" or "no units": the groups say it could not be read.
- Do not count a unit's employments in the page read; the card asks for ten, one by one, and the sheet asks for none.
- Do not install a second copy of a singleton peer (see "Module state").

## Wrong readings

- "The units are counted by people." They are counted by employment records the viewer may read; one person with two employments in a unit counts twice. The words say "employments".
- "The parent picker shares its cache with the other organization pickers of the app." In the app its default find had the key `["mynet", "org-records", vaultId, text]`; here the picker's key is `["record-picker", "Parent organization", vaultId, text]`, so the hits it reads are not shared with a picker keyed the other way (see "Changes from production").
- "The picker never offers a descendant." It excludes only the record itself (`exclude`); a descendant is offered and then refused by the writer as a loop.
- "`ORGANIZATION_TYPE_URI` is exported." It was; it is now `organizationTypeUri()`, read when used.
- "`OrgRecordHit` is exported here." It is `record-picker`'s.
- "A read of 200 units is 200 finds." The page is one find per address spelling plus one record read per unit; counts are read for ten.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, each file whole to the file of the same name, copied by script:

- `src/lib/base/orgCard/orgUnits.ts` (102 lines), `src/lib/base/orgCard/orgRecords.ts` (143), `src/lib/mynet/org/orgHierarchy.ts` (101; pure, no import; the app copied it from MyNet), `src/components/records/orgCard/OrgHierarchySections.tsx` (264), `src/components/records/orgCard/useOrgUnits.ts` (34).

`src/index.ts` is new. Not copied, because they are units: `OrgRecordPicker`, `useDebouncedValue` and `OrgRecordHit` (`record-picker`).

**Merged units compared and taken** (token for token, comments and imports excluded; the pieces of the app compared with the unit's):
- Same: `CardGroup` (1,750 tokens, 0 hunks), `RemoveControl` (156, 0), `useCardMode` (16), `BaseRecord`, `readRecord`, `mapWithConcurrency` (235), `MAX_PARALLEL_DEREFERENCES`, `AttributeFindResult`, `listVaultRecordsPage` (762), `searchEntities` (136), `typeLocalName` (93; the copy in `lws-vault-sets`, not the 97-token rewrite in `type-curie`), `partyNameOf` (199), and from `org-employees` `pagedFindBothSpellings` (531 tokens, 0 hunks) and `INLINE_EMPLOYEES`, `groupCountText` (`orgEmployeeSearch.ts` 702, 0 hunks).
- Same except a declared seam: `patchRecord` (one added argument, `"PATCH"`, of the unit's authorisation seam), `findByAttribute` and `vaultOriginOf` (`baseOrigin()` where the app read `BASE_ORIGIN`), `idFromResourceUri` (`m ? m[1]! : uri` is `m?.[1] ?? uri`, the same answer for every string), `OrgRecordHit` (`PickerRow` where the app had `BaseRecord`), `OrgRecordPicker` and `useDebouncedValue` (`useDebouncedValue` 93 = 93 tokens; the picker differs by the query seam and the removed default find).
- `OrgMark` of `org-mark`: the app's takes no host; the unit's reads `OrgMarkHostContext`.
- `resolveOrgTerms`, `refsOf`, `servedValue`, `resolveEmploymentLinkVocab` of `org-terms`: the whole files compared (0 hunks).
- `subjectSpellings`, `inVault` of `org-employees`: compared with `heldNote.ts` in that unit's README.

**Changes from production** (a token comparison of every file with its source, comments and imports excluded: 0 hunks in `orgHierarchy.ts`, `orgUnits.ts` and `useOrgUnits.ts`; 10 in `orgRecords.ts`; 1 in `OrgHierarchySections.tsx`; all below):

1. The imports are the peers' (listed in "How to take it"); `GILBVEDA_MASTER_ORIGIN` is `termOrigin()`; the files of the unit import each other by `./name`.
2. `orgRecords.ts` (RuleGhsSettingUnit), before: `export const ORGANIZATION_TYPE_URI = \`${GILBVEDA_MASTER_ORIGIN.replace(/\/+$/, "")}/base/t/Organization\`;` and `const ORGANIZATION_TYPE_NAME = typeLocalName(ORGANIZATION_TYPE_URI);`; after: `export function organizationTypeUri(): string { return \`${termOrigin().replace(/\/+$/, "")}/base/t/Organization\`; }` and `function organizationTypeName(): string { return typeLocalName(organizationTypeUri()); }`. Their four uses (the list call, the type test in the list loop, the search call, the type test of a read) are `organizationTypeName()`. Nothing is read when the module loads. `organizationTypeName` is not exported, as the constant was not.
3. `orgRecords.ts` no longer declares `OrgRecordHit` (lines 60-72); `import type { OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker"`; `BaseRecord` is no longer imported.
4. `OrgHierarchySections.tsx`, before: `<OrgRecordPicker vaultId={vaultId} exclude={[record.entityUri]} label="Parent organization" onCancel=... onPick=... />`; after: the same with `find={(text) => findOrganizationRecords(vaultId, text)}` added after `label`. The source's picker chose that find itself when none was given. The picker's query key is therefore `["record-picker", "Parent organization", vaultId, text]` where the source's was `["mynet", "org-records", vaultId, text]`: a cache entry of this picker is no longer shared with another picker that asked the same find under the old key. Behaviour of the group is otherwise the same. **For the owner:** if that sharing matters, `record-picker` needs a way to pass the key.
5. Comments made generic (cycle, agent, ticket and ruling tags, dates and person names removed; the 'Copied from MyNet' line).

**Tests (190).** Ported from the app, same inputs and expectations (hosts to `example.test`, the ontology host to `onto.example.test`; ticket tags removed from test titles; clock waits on the test clock `test/timing.ts`, not wall time): `orgUnits` 18 (s8org 6, s9fix 6, s10fix 2, s12 4), `orgRecords` 18 (s8org 9, s9fix 7, s10fix 2), `OrgHierarchySections` 30 (s8org 16, s9fix 10, s10fix 4), `OrgUnitsSection.s12` 21, `orgHierarchy` 22 (s8org 19, s9fix 3: not in the brief, ported because they test the pure rule), and 1 test of `orgFinds.defaults.s9fix` (the units half; the employees half belongs to `org-employees`): 110 in all. Their `vi.mock`s of the app's modules (`orgUnits`, `orgRecords`, `orgTerms`, `orgLogo`, `records`, `OrgRecordPicker`) are mocks of the unit's own files and of the peers (`org-terms`, `lws-records`, `record-picker`), and the logo mock is a fake host (`test/fakeHost.tsx`: the real sheet-history copy, a logo download that answers "gone", the picker's query hook). Added, 80: `OrgHierarchySections.picker.test.tsx` 11, `exports.test.ts` 20, `orgRecords.origin.test.ts` 5, `orgUnits.defaults.s9fix.test.ts` 2, `orgHierarchy.pins.test.ts` 14, `orgRecords.pins.test.ts` 10, `useOrgUnits.test.tsx` 6, `OrgUnitsSection.pins.test.tsx` 2, `hostAgnostic.test.ts` 10. Left out: none of the listed files' tests.
