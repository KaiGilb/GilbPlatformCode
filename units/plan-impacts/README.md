# plan-impacts

The Impacts table of a Solution or Solution Constraint: one row per Value or Development Resource it impacts, with the estimated value change or resource draw, its basis and source, kept on the relation, with the host doing every read, cache and write.

## What this is

The Impacts table of a Solution or Solution Constraint: one row per Value or Development Resource it impacts, with the estimated value change or resource draw, its basis and source, kept on the relation, with the host doing every read, cache and write.

One component, `PlanImpacts`, drawn at `data-testid="plan-impacts"`. Each impact is one `t:ImpactOn` relation between this record (`role:solution`) and a Value (`role:value`) or a Resource (`role:resource`). The numbers live on the relation; nothing is written on the Solution, the Value or the Resource.

- Props: `record` (the Solution), `vaultId` (the screen vault), `planVault` (the record's own vault, `vaultId` unless given: impact relations and a new Value or Resource are made there), `canEdit`, `offer`, `onOpen(id)`, `onNotice(text | null)`, `onPicked()`.
- A row (`data-impact-row="<tag>"`, the tag of the target from the pool, else the tail of its address) shows the target by its live label, a colon, and its numbers, then its source (`PlanSource` of the `plan-source` unit). Values come first, then Resources, each side by tag. The relations come from the host; none are shown while they are pending or failed. The numbers of a row come from the host's read of the relation's document (`useRelationDoc`); while it is not read, or the relation does not exist, the row has no numbers.
- The numbers are `impactNumbersText` of `plan-impacts-model`: a Value's pinned `status → expected` with the unit after it, a free-text estimate as stored, a Resource's signed amount with a true minus and its unit; then ` (estimate)` (`data-impact-basis="estimate"`) when the basis is an estimate. With `canEdit` they are a button; without, plain text.
- Editing a row: the button opens the boxes (`data-impact-editor`): Status and Expected for a Value, Amount for a Resource, Unit, and Basis (estimate or measured). Enter writes; Escape drops the edit; the focus leaving the row writes; the focus moving to another box of the row does not. A write is made once: while one is under way, and after it closed, further Enters do nothing. A rejected write keeps the boxes open, with what was typed, and says why through `onNotice` (a 409 is the duplicate-tag sentence "The tag "<tag>" is already used in this vault. Pick another."); the next Enter writes again. Nothing changed closes the boxes without a write. A box that is no number says "Enter a decimal number." and writes nothing. A comma is stored as a point (`1,000` is stored as `1.000`), a true minus as a hyphen, a Value side may be `unmeasured` (the expected side may not), a Resource amount needs its sign.
- The write is `writePairRelation` of the host with the relation's own id (an update, in place) and the numbers, unit, basis and source as the relation's extra facts. The numbers written show at once, before the relation is read again (`data-impact-rev` counts these).
- The source: the signed-in person's own card (`useSelfSource`) is the source of numbers they write, unless they chose or cleared that impact's source: then theirs is kept. A source changed on its own writes the relation at once. A new impact starts with the person as its source, unless they clear or change it.
- Adding: a picker (`PlanTagPicker` of `plan-tag-picker`, label `Impacts`, searching `Value` and `Resource`) opens a draft row for the pick, with the unit of the target's Scale; nothing is written until its numbers are committed, which writes a new relation (no relation id), puts it in the cached relations, and removes the draft. Targets already impacted, and drafts, are not offered. A free tag offers "Create Value" and "Create Resource", which make the record with the host's optimistic create and open a draft for it; when the new record is made in another vault than the screen's, its row is copied to the front of the screen vault's cached first page (if that list is loaded and does not hold it) so its label can be read.
- Removing: a remove control (`Remove <tag>`, in edit mode) ends the relation, forgets the numbers just written for it, and takes it out of the cached relations. The controls are disabled while it is under way.
- `PlanImpactsHostContext`, `PlanImpactsHost` and the types it uses: how the host gives the table everything it does not own.

## What this is not

- Not the model: the rules for reading and writing the relation's numbers, the sorting, the sentences and the parsing are `plan-impacts-model`; the links and tags are `plan-links-model`.
- Not a cache or a client: every read, cache write and network write is a host member; the host holds the query client.
- Not the source control (`plan-source`) or the picker (`plan-tag-picker`), which it draws and which need their own hosts.
- Not the other link lines of the card (`plan-tag-links`).
- Not a rule for which cards show the table: the caller draws it for a Solution or a Solution Constraint.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-impacts`

Take it together with its peers: `base-record`, `card-mode`, `entity-ref-value`, `id-tail`, `plan-card-facts`, `plan-impacts-model`, `plan-links-model`, `plan-source`, `plan-tag-picker`, `relation-role` and `remove-control`. Their own peers are installed too: `plan-links-model` has `entity-ref`, `type-curie` and `type-key`; `plan-source` and `plan-tag-picker` have `record-picker` (and `entity-ref`). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one card-mode context, one picker context, one label context and one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/relation-role <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-impacts-model <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/plan-source <path-to-the-library>/units/plan-tag-picker <path-to-the-library>/units/plan-impacts
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

The providers the table needs (the picker's query hook, the label hook of `EntityRefValue`, the hosts of the picker and of the source control, the card's mode and this unit's host), a host over a few records and one impact relation in memory, and the table showing the impact and rewriting its numbers in place. The same code runs in `src/example.test.tsx`.

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { PlanSourceHostContext, type PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { PlanImpacts, PlanImpactsHostContext, type PlanImpactsHost } from "./index";

const client = new QueryClient();
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const useRefLabel: UseRefLabel = (ref) => ref?.id ?? null;

// The vault, here a few records and one impact relation in memory; a real host reads and writes its vault.
const planVault = "https://plan.example.test/vault";
const at = (id: string) => `${planVault}/e/${id}`;
const solution: BaseRecord = { id: "fix", entityUri: at("fix"), typeUri: "t:Solution", facts: { unitTag: "Fix" }, opaqueFacts: [], etag: '"e1"' };
const speed: GridRecord = { id: "speed", entityUri: at("speed"), typeUri: "t:Value", facts: { unitTag: "Speed" }, opaqueFacts: [], etag: '"e1"', updatedAt: 1 };
let relations: RecordRelation[] = [{ relation: "relA", role: "role:solution", type: "t:ImpactOn", members: [{ member: at("speed"), role: "role:value" }] }];
let extras: Record<string, unknown> = { "a:valueEstimate": "3 → 0.2", "a:unit": "s", "a:impactBasis": "estimate" };

const pickerHost: PlanTagPickerHost = {
  findPlanRecords: async () => ({ hits: [], complete: true }),
  tagUsed: async () => false,
  invalidateSearch: (key) => client.invalidateQueries({ queryKey: key }),
};
const sourceHost: PlanSourceHost = {
  useShell: () => ({ vaults: [] }),
  heldVaultIds: () => [planVault],
  useStakeholderTypes: () => ({ data: { names: ["Person"] } }),
  useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
  matchWorkingSetQuery: () => [],
  findStakeholderRecords: async () => ({ hits: [], complete: true, vaultsMissed: false }),
  readRecord: async () => null,
  memberEntityUri: (id) => at(id),
  ConnectedCreateDialog: () => null,
};

const host: PlanImpactsHost = {
  // reads and caches
  useRecords: () => ({ data: [speed] }),
  useRelations: () => ({ isPending: false, isError: false, data: relations }),
  useSelfSource: () => null,
  useMainTagsForRows: () => new Map<string, string>(),
  useRelationDoc: () => ({ data: { extras } }),
  resolveType: (kind) => ({ id: kind }),
  invalidatePlanSearch: (vault) => void client.invalidateQueries({ queryKey: ["plan-search", vault] }),
  getRecordPages: () => undefined,
  setRecordPages: () => {},
  setRelations: (_id, _at, next) => {
    relations = typeof next === "function" ? next(relations) : next;
  },
  // writers: leave these out and the table is read-only
  useCreateRecord: () => ({ mutateAsync: async () => ({ id: "new", etag: null, tempId: "" }) }),
  writePairRelation: async ({ relationId, extraFacts }) => {
    extras = extraFacts;
    return { id: relationId ?? "relB" };
  },
  endRelation: async (relation) => {
    relations = relations.filter((r) => r.relation !== relation);
  },
};

function Card({ onNotice }: { onNotice: (notice: string | null) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={pickerHost}>
            <PlanSourceHostContext.Provider value={sourceHost}>
              <PlanImpactsHostContext.Provider value={host}>
                <CardModeProvider canEdit>
                  <PlanImpacts record={solution} vaultId={planVault} canEdit onOpen={() => {}} onNotice={onNotice} />
                </CardModeProvider>
              </PlanImpactsHostContext.Provider>
            </PlanSourceHostContext.Provider>
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
```

## What the host must supply

- The `PlanImpactsHostContext` provider, above the table, with the same object for as long as it is mounted. With none, `PlanImpacts` throws an error that names it. Every member is the call the source made, with the same arguments, at the same place and in the same order; the source's query client `qc` is not passed (the host holds it), and where the source built a query key for a cache call, the host builds it from the arguments given. "PI" below is the app's `src/components/records/PlanImpacts.tsx`.
  - Reads and caches (all required):
    - `useRecords(vaultId): { data?: readonly GridRecord[] }`: a hook, the records of the screen vault, the pool the tags are looked up in. GilbApp: `useRecords(vaultId)`, PI:504 (`lib/base/recordHooks.ts` 1320).
    - `useRelations(id, at): { isPending, isError, data? }`: a hook, the relations a record takes part in. GilbApp: `useRelations(record.id, record.entityUri ?? null)`, PI:505 (`lib/base/relationHooks.ts` 14).
    - `useMainTagsForRows(rows): ReadonlyMap<string, string>`: a hook, the MAIN tags of the linked records, by record address; `rows` is `{ entityUri?, facts }[]`, the pool's records that the links point at (by address or id), and the answer is empty or partial while the platform is read. The table calls it once per render, unconditionally, after the links are read and before they are sorted, and names a linked record by its `unitTag`, else by this tag, else by its name or id. Required: it is a read. GilbApp: `useMainTagsForRows(rows)`, PI:517-519 (`lib/base/recordTags.ts`); the app's options are `staleTime: 60_000, retry: false, refetchOnWindowFocus: false`, one batch call for all the rows (fifty per call).
    - `useSelfSource(): { "@id": string } | null`: a hook, the person's own card as a link, or null when it is not known. GilbApp: `useSelfSource()`, PI:508 (`components/records/useSelfSource.ts` 20).
    - `useRelationDoc(relation, planVault): { data?: { extras } | null }`: a hook, the document of one relation, read in the plan vault, kept 15 s, not retried; `extras` are the facts stored on the relation. GilbApp: `useQuery({ queryKey: ["plan-impact", link.relation], queryFn: () => readRelationDoc(link.relation, planVault), staleTime: 15_000, retry: false })`, PI:397-402 (`lib/base/relationDoc.ts` 204). Called in each saved row.
    - `resolveType(kind): object | null`: the record type for `"value"` or `"resource"`, or null. GilbApp: `resolveType(kind)`, PI:580 (`lib/base/recordTypes.ts` 457).
    - `invalidatePlanSearch(planVault)`: drop the finished picker searches of the vault. GilbApp: `invalidatePlanSearch(qc, planVault)`, PI:593 (`lib/base/planSearch.ts` 25).
    - `getRecordPages(vaultId)` and `setRecordPages(vaultId, pages)`: a vault's cached record list, read and set. GilbApp: `qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId))` and `qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId), pages)`, PI:81, :84, :88.
    - `setRelations(id, at, next)`: set the cached relations of a record (`next` a list, or a function of the cached list, undefined when none). GilbApp: `qc.setQueryData<RecordRelation[]>(relationsKey(id, at), next)`, PI:544, :643 (`lib/base/relations.ts` 59).
  - Writers (all optional; see below):
    - `useCreateRecord(planVault): { mutateAsync(args): Promise<{ id, etag, entityUri?, tempId }> }`: a hook, the optimistic create. GilbApp: `useCreateRecord(planVault)`, PI:507 (`lib/base/recordHooks.ts` 1948). It is called on every render, in the same place: a host without it is given an inert stand-in.
    - `writePairRelation(input): Promise<{ id, uri? }>`: write a `t:ImpactOn` relation, new, or in place when `input.relationId` is set. GilbApp: `writePairRelation({ relationId?, sourceId, targetId, sourceEntityUri, targetEntityUri, typeCurie, roles, vaultNamespace, extraFacts })`, PI:417, :555 (`lib/base/relationWrite.ts` 217).
    - `endRelation(relation, planVault)`: end a relation. GilbApp: `endRelation(relation, planVault)`, PI:640 (`lib/base/relationWrite.ts` 491).
- Read-only without writers. The component's first lines give up editing when a writer is missing: the one added line is `canEdit = canEdit && host.writePairRelation !== undefined && host.endRelation !== undefined && host.useCreateRecord !== undefined;`. It then behaves exactly as with `canEdit` false: numbers as text, no picker, no remove control, no source picker. All the other members are still called and so are required, even by a host that never writes.
- The providers of the controls it draws: `PlanTagPickerHostContext` of `plan-tag-picker`, `PlanSourceHostContext` of `plan-source`, `PickerQueryContext` of `record-picker`, `RefLabelContext` of `entity-ref-value`, and a `CardModeProvider` of `card-mode`.
- Tailwind scanning this unit's `src`, and the CSS variables `--ink`, `--ink-soft`, `--line`, `--surface`, `--focus`, `--accent` and `--bad` (and those of the picker, the source control, the label and the remove control).
- React 19.

## Changes in 0.2.0

- A linked Value or Resource that holds no name and no `unitTag` is now shown by its MAIN tag, in its row, in the sort order, in the label of its remove control and in the error sentence, as the app now does at `9a602ea7`. The tag comes from the new host member `useMainTagsForRows`.
- BREAKING for hosts: one new REQUIRED member, `useMainTagsForRows` (a hook; see "What the host must supply"). A host written for 0.1.0 does not type-check until it adds it, and `PlanImpacts` throws "not a function" without it.
- Peers: `entity-ref-value` ^0.2.0 and `plan-links-model` ^0.2.0 (`recordTag` takes the main tag as its second argument). `main-tag` is NOT a peer: the member's types are structural (`MainTagRow`, exported).
- Re-synced from KaiGilb/GilbApp @ `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`; the ranges moved from 47-63 and 77-723 to 48-64 and 78-730.

## Do not

- Do not give the host a new object on every render: the table reads it once per render.
- Do not make `useRelationDoc` return the numbers just written before the relation is read again: the table keeps those itself until the relation is removed, and shows them over what the host answers.
- Do not make `setRelations` ignore its function form: the remove control passes a function of the cached list.
- Do not install a second copy of `plan-source`, `plan-tag-picker`, `record-picker`, `entity-ref-value` or `card-mode`: each holds its own context.

## Wrong readings

- "The numbers are stored on the Solution." They are the relation's own facts; the Solution, the Value and the Resource are never written.
- "Editing a number makes a second relation." The relation's id is kept: a row that exists is updated in place; only a draft writes a new one.
- "`1,000` is a thousand." It is a decimal with a comma: it is stored as `1.000`.
- "The person is always the source." Only of numbers they write, and only when they have a card and did not choose or clear that impact's source.
- "A rejected write closes the boxes." It keeps them open with what was typed; the next Enter writes again.
- "The picker offers every Value." Targets already impacted, and drafts, are left out.
- "`canEdit` true is enough to edit." The host must supply the three writers.
- "The main tag is memoised." The rows given to `useMainTagsForRows` are a new array on every render while the links are known (the `useMemo` depends on an array that is new every render), so the memo never holds; it is harmless in the app because the hook keys on the content of the rows. A host's member must key on the content too, not on the identity of `rows`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`:

- `src/components/records/PlanImpacts.tsx` lines 48-64 (`MISSING_ADDRESS`, `DECIMAL_MESSAGE`, `fieldClass`, `DraftImpact`) and 78-730 (`showCreatedOnScreen`, `tagFor`, `storedFrom`, `initialFields`, `ImpactFields`, `CommitBridge`, `Numbers`, `ImpactRow`, `SavedImpact`, `PlanImpacts`) to `src/planImpacts.tsx`, in that order. Code verbatim except the named changes below. Lines 1-46 are the imports.
- Imports: `../mynet/RemoveControl` is `@kaigilb/gilbplatformcode-remove-control`; `./cardMode` is `@kaigilb/gilbplatformcode-card-mode`; `./EntityRefValue` and `refDisplayName` are `@kaigilb/gilbplatformcode-entity-ref-value` (the app's `refDisplayName`); `./PlanSource` is `@kaigilb/gilbplatformcode-plan-source`; `./PlanTagLinks` (`PlanTagPicker`) is `@kaigilb/gilbplatformcode-plan-tag-picker`; `duplicateTagSentence` is no longer needed here (see 2); `isTypeName`, `recordTag` (`lib/base/planLinks`) and `relationMemberIds` (`lib/base/planSolution`) are `@kaigilb/gilbplatformcode-plan-links-model`; `planSourceEmpty`, `sourceWithStatedBy` and the type `PlanSourceValue` (`lib/base/planCard`) are `@kaigilb/gilbplatformcode-plan-card-facts`; the impact functions, constants and types (`lib/base/planImpacts`) are `@kaigilb/gilbplatformcode-plan-impacts-model`; `uriTail` (`lib/base/relations`) is `@kaigilb/gilbplatformcode-id-tail`; the types `BaseRecord` and `GridRecord` are `@kaigilb/gilbplatformcode-base-record`; the type `RecordRelation` is `@kaigilb/gilbplatformcode-relation-role`.
- Named changes:
  1. `useQueryClient()` is `usePlanImpactsHost()` (a private hook reading `PlanImpactsHostContext`, throwing an error that names the provider when there is none). In `PlanImpacts` it is placed after `useCardMode()`, and in `SavedImpact` where the `useQuery` stood. The host is typed with its optional writers read as present (`Required<PlanImpactsHost>`) in that one hook; the added read-only line is what keeps a missing writer from being reached.
  2. `httpStatus` and `noticeFor` (lines 66-76) are the `plan-tag-picker` unit's exports of the same names (the code is the same); they are imported, not copied.
  3. Each call that reached outside the unit is the host member of the same name with the same arguments but for `qc`: `useRecords`, `useRelations`, `useSelfSource`, `resolveType`, `invalidatePlanSearch`, `writePairRelation` (both calls), `endRelation`. The `useQuery({ queryKey: ["plan-impact", …], queryFn: readRelationDoc …, staleTime, retry })` of `SavedImpact` is `host.useRelationDoc(link.relation, planVault)`. `qc.setQueryData<RecordRelation[]>(relationsKey(id, at), updater)` is `host.setRelations(id, at, updater)` (two places; in `putCache` the `const key = relationsKey(...)` line is dropped). In `showCreatedOnScreen` (which takes `host` where it took `qc`), `qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(v))` is `host.getRecordPages(v)` and `qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(v), x)` is `host.setRecordPages(v, x)`. `InfiniteData<RecordsPage>` is the unit's structural `PlanRecordPages`.
  4. `useCreateRecord(planVault)` is `(host.useCreateRecord ?? useNoCreate)(planVault)`: the hook is called on every render in the same place; `useNoCreate` is a private stand-in whose `mutateAsync` rejects, never reached because the table is then read-only.
  5. One added line: `canEdit = canEdit && host.writePairRelation !== undefined && host.endRelation !== undefined && host.useCreateRecord !== undefined;`, after the host is read. It is the only added statement in `PlanImpacts`.
  6. `useMainTagsForRows(...)` (the import from `../../lib/base/recordTags`, called at `PlanImpacts.tsx:517-519`) is the host member `host.useMainTagsForRows(...)`, a new required hook, called unconditionally between the links and their sorting, with the same argument (the `useMemo` of the pool's records that the links point at); `tagFor(pool, uri, mains?)` and its three call sites take the answer.
  7. `PlanImpacts` is exported (it was); everything else is private, as in the source.

`src/planImpactsHost.ts` (the host interface, the types and the context), `src/index.ts` and `test/` are new. `test/fakeHost.tsx` is a fake host that logs its calls in order, with the hosts of the picker and of the source control under it; `test/mount.tsx` renders and picks.

Tests:

| Source | Ported / left out |
|---|---|
| `lib/base/planImpacts.roles` test (1 case) | Not here: it tests `impactsOnSolution` and `sortImpacts`, which are `plan-impacts-model`'s. |
| `RecordDetail.planImpacts` (10 cases), `planValueCard`, `planSolution`, `planSourceDefaults`, `planSearch` (the `RecordDetail.plan*` suites) | Left out: they render whole cards over a stubbed `fetch`; what they say of the table is pinned in `src/planImpacts.test.tsx` against a fake host. |

Since 0.2.0, `src/planImpacts.test.tsx` also has the block "a linked record named by its main tag" (10 cases; the unit has 105 tests in 4 files): a record with no name or `unitTag` shown by the host's main tag in its row and its remove label; the fall-back; a `unitTag` kept; the sort; one host call per render with the linked pool records only (also when the link names a record by id); the hook called while the relations are still read; the 409 sentence; the rows array new every render. No app test is ported: the app's RecordDetail suites go through the whole page.

The source had no test of the table on its own. `src/planImpacts.test.tsx` is new and pins: the rows (live label, numbers by `impactNumbersText`, the estimate mark, true minus, order, the source line); who can edit; editing (the boxes, one write in place with the relation's id kept, the person as source and when it is kept as chosen, Enter twice, focus out, Escape, nothing changed, a refused write keeping the boxes, the numbers shown before the relation is read again with `data-impact-rev`, the decimal rule including `1,000` stored as `1.000`, a unit trimmed, the basis, a Resource's sign); the source written on its own; removing; adding by pick (draft, unit of the scale, a new relation without an id, the relation address rule `written.uri?.includes("://") ? written.uri : written.id`, the default source and when it is not filled in); creating a Value or a Resource; showing a created record on the screen vault's list (each of its guards); read-only without each writer; and the missing provider. `src/example.test.tsx` runs the README example, `src/exports.test.ts` pins the export list and `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
