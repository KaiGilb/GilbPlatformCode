# plan-tag-links

The link lines of a Plan card (Part of, Sub-functions, Function of Value, Value of Function, Solution of, Solutions and Part of System), each shown by the linked records' live tags, with the host doing every read, cache and write.

## What this is

Seven components, one per line of the card. A link is stored as the address of the record it points at (`{"@id": <address>}`); the name drawn for it is that record's live tag, read at render, never a copy kept on the link. Every line takes the same props: `record` (the card's record), `vaultId` (the screen vault), `planVault` (the record's own vault, `vaultId` unless given), `canEdit`, `offer`, `onOpen(id)`, `onNotice(text | null)` and `onPicked()`; the lines noted below take one more. Each draws its root with the test id in brackets.

- `PlanPartOf` (`plan-part-of`): the record's one parent Function, from its `a:fvParent` link, or "(none fits)". In edit mode a remove control (`Remove Part of`) retracts the link and a picker (`PlanTagPicker` of the `plan-tag-picker` unit, searching `Function` and `FunctionConstraint`) sets it. A pick first walks the chosen record's own parents (`wouldLoop`, at most 50 reads, through the host's `readRecord`): when the chain reaches this record, nothing is written and the notice is "<chosen> is under <this>, so it cannot be its Part of."; when a parent cannot be read, "Could not check the chain — try again."; when the chain is too long, "This chain is too deep to check.". Records that already sit under this one are not offered. A free tag offers "Create Function", which makes the Function with the host's optimistic create (`useCreateRecord`) and links it.
- `PlanSubFunctions` (`plan-sub-functions`): the Functions whose `a:fvParent` is this record, from the host's find, sorted by tag then id; read-only. A failed find shows "Could not read the sub-functions — try again" in place of the rows. Under the rows, a cut-off find says "Showing the first N of M sub-functions at this level." and an unread count says "N sub-function(s) could not be read. Try again", each with a Try again button that asks the host to read the find again.
- `PlanFunctionOfValue` (`plan-function-of-value`): on a Function card, the Values that measure it (the Values whose `a:measures` is this record), from the host's find. In edit mode each has a remove control (`Remove <tag>`) that patches that Value's `a:measures` to null, and "+ Value" opens a picker (searching `Value`). A pick patches the Value's `a:measures` to this record; a Value that already measures another Function is refused ("<Value> already measures <Function>."), one that already measures this Function is ignored without a word. "Create Value" makes the Value with the host's raw create (`createRecord`), already linked, and puts the new row on the line at once. `offer` opens the picker without pressing "+ Value".
- `PlanValueOfFunction` (`plan-value-of-function`): on a Value card, the Functions it measures: its `a:measures` links, one or more, in stored order (the served list first, else the flat fact; a link, a bare address, a JSON text of either, once each). Add and remove both write the whole list (a list of `{"@id"}`, or null when empty) with the host's patch. Takes `onWritten()`, called after a write that left at least one Function, so the caller may stamp the line's source. "Create Function" makes the Function with the raw create and appends it.
- `PlanSolutionOf` (`plan-solution-of`): on a Solution, the Functions it solves: one `t:SolutionOf` relation per Function, read from the host's relations of this record (none shown while they are pending or failed). A pick or "Create Function" writes the relation with this record as `role:source`; a remove control ends it. Takes `onWritten()`, called after a link was written.
- `PlanSolutions` (`plan-solutions`): on a Function, its Solutions: the same relation read from its other end. A pick or "Create Solution" (searching `Solution` and `DesignConstraint`) writes it with this record as `role:target` and the chosen record as `role:source`; a remove control ends it. Source and target are the only difference from `PlanSolutionOf`.
- `PlanPartOfSystem` (`plan-part-of-system`): the one system this record is part of (its `a:partOf`): a link shown by its live tag, or older words shown as words. Takes `onWrite(uri | null)` (required): it is called with the address of the system picked, or null when the link is removed; the line itself writes nothing. Its own picker (label `Part of System`, hits under `plan-system-hits`) searches `SoftwareSystem` and `System`. A free tag offers "Create System", which opens the host's create dialog on the Software System type; the record it makes is read back and its address handed to `onWrite`.
- The create button is `plan-link-create`, the picker `plan-link-picker`, its hits `plan-link-hits`.
- Read-only: a line whose writers the host does not supply behaves exactly as with `canEdit` false (see "What the host must supply"). In presentation (the card not in edit mode, through `card-mode`) no line draws a control; `offer` shows the picker of a line there, when `canEdit`.
- `PlanTagLinksHostContext`, `PlanTagLinksHost` and the types it uses: how the host gives the lines everything they do not own.

## What this is not

- Not a search: the picker, its search and its tag check are `plan-tag-picker` and the host it needs (`PlanTagPickerHostContext`).
- Not a cache or a client: every read, cache write and network write is a host member; the host holds the query client.
- Not the Impacts line (the next unit) and not the stakeholder lines.
- Not the model: the rules for reading a link, the loop check, the sentences and the `t:SolutionOf` rows are `plan-links-model`; the facts are read with `plan-card-facts`.
- Not an editor of the card's mode: whether the card is in edit mode comes from `card-mode`; with no provider `useCardMode` answers "always editing".

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-tag-links`

Take it together with its peers: `base-record`, `card-mode`, `entity-ref`, `entity-ref-value`, `id-tail`, `plan-card-facts`, `plan-links-model`, `plan-tag-picker`, `record-picker`, `remove-control` and `type-chooser` (for the type of one option only). Their own peers are installed too: `plan-links-model` has `relation-role`, `type-curie` and `type-key`; `type-chooser` has `type-term-popover`, which has `open-popups`, `term-origin`, `type-picture` (which has `type-name`) and `react-dom`. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one card-mode context, one picker context, one label context and one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/relation-role <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/record-picker <path-to-the-library>/units/plan-tag-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/open-popups <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/plan-tag-links
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

The providers the lines need (the picker's query hook, the label hook of `EntityRefValue`, the picker's host, the card's mode and this unit's host), a host over a plan vault held in memory, and the Part of line linking a found record and then a record made on the spot. The same code runs in `src/example.test.tsx`.

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanPartOf, PlanTagLinksHostContext, type PlanTagLinksHost } from "./index";

const client = new QueryClient();
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const useRefLabel: UseRefLabel = (ref) => ref?.id ?? null;

// The plan vault, here a map in memory; a real host reads and writes its vault.
const planVault = "https://plan.example.test/vault";
const rows = new Map<string, GridRecord>();
for (const [id, tag] of [["door", "Door"], ["door-close", "Door.Close"]] as const) {
  rows.set(id, { id, entityUri: `${planVault}/e/${id}`, typeUri: "t:Function", facts: { unitTag: tag }, opaqueFacts: [], etag: '"e1"', updatedAt: 1 });
}

const pickerHost: PlanTagPickerHost = {
  findPlanRecords: async (_vault, text) => ({
    hits: [...rows.values()]
      .filter((r) => r.facts.unitTag!.toLowerCase().includes(text.trim().toLowerCase()))
      .map((r) => ({ uri: r.entityUri!, label: r.facts.unitTag!, row: r })),
    complete: true,
  }),
  tagUsed: async (_vault, tag) => [...rows.values()].some((r) => r.facts.unitTag === tag),
  invalidateSearch: (key) => client.invalidateQueries({ queryKey: key }),
};

const host: PlanTagLinksHost = {
  // reads: the lists, the relations, the finds, the row cache
  useRecords: () => ({ data: [...rows.values()] }),
  useRelations: () => ({ isPending: false, isError: false, data: [] }),
  usePlanFind: () => ({ isError: false }),
  invalidatePlanFind: () => {},
  invalidatePlanSearch: (vault) => void client.invalidateQueries({ queryKey: ["plan-search", vault] }),
  liveRow: (_vault, id, fallback) => rows.get(id) ?? { updatedAt: 0, ...fallback },
  ensureEtagUnchanged: async (_vault, row) => ({ row }),
  applyPatch: (row, patch, etag) => {
    const facts = { ...row.facts };
    for (const [slug, value] of Object.entries(patch)) {
      if (value === null) delete facts[slug];
      else if (!Array.isArray(value)) facts[slug] = value["@id"];
    }
    return { ...row, facts, etag };
  },
  storePlanRow: (_vault, row) => void rows.set(row.id, row as GridRecord),
  setPlanRecord: () => {},
  dropPlanFind: () => {},
  prependPlanFind: () => {},
  putRecordInCaches: () => {},
  getRelations: () => undefined,
  setRelations: () => {},
  resolveType: (id) => ({ id }),
  typeUriForVaultNamespace: (typeName) => `t:${typeName}`,
  memberEntityUri: (id, _preferred, namespace) => `${namespace}/e/${id}`,
  readRecord: async (id) => rows.get(id) ?? null,
  // writers: leave these out and every line is read-only
  patchRecord: async (id, patch, _at, _source, precondition) => {
    const row = rows.get(id)!;
    if (row.etag !== precondition?.ifMatch) throw new Error("The record changed.");
    return { etag: '"e2"' };
  },
  useCreateRecord: () => ({
    mutateAsync: async ({ facts }) => {
      const id = facts.unitTag!.toLowerCase();
      const entityUri = `${planVault}/e/${id}`;
      rows.set(id, { id, entityUri, typeUri: "t:Function", facts, opaqueFacts: [], etag: '"e1"', updatedAt: Date.now() });
      return { id, etag: '"e1"', entityUri, tempId: "" };
    },
  }),
};

function Card({ onNotice }: { onNotice: (notice: string | null) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={pickerHost}>
            <PlanTagLinksHostContext.Provider value={host}>
              <CardModeProvider canEdit startEditing>
                <PlanPartOf record={rows.get("door")!} vaultId={planVault} canEdit onOpen={() => {}} onNotice={onNotice} />
              </CardModeProvider>
            </PlanTagLinksHostContext.Provider>
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
```

## What the host must supply

- The `PlanTagLinksHostContext` provider, above every line, with the same object for as long as it is mounted. With none, a line throws an error that names it. Every member is the call the source made, with the same arguments, at the same place and in the same order; the source's query client `qc` is not passed (the host holds it), and where the source built a query key for a cache call, the host builds it from the arguments given. Members are called as `host.name(...)`; `readRecord` is also handed over as a plain function (to `wouldLoop`), so do not rely on `this` in it. "PTL" below is the app's `src/components/records/PlanTagLinks.tsx`.
  - Reads and caches (all required):
    - `useRecords(vaultId): { data?: readonly GridRecord[] }`: a hook, the records of the screen vault, the pool the tags are looked up in. GilbApp: `useRecords(vaultId)`, PTL:319 and five more (`lib/base/recordHooks.ts` 1320).
    - `useRelations(id, at): { isPending, isError, data? }`: a hook, the relations a record takes part in. GilbApp: `useRelations(record.id, record.entityUri ?? null)`, PTL:908, :1039 (`lib/base/relationHooks.ts` 14).
    - `usePlanFind(planVault, attr, parent): { data?: PlanFind, isError }`: a hook, the records whose `attr` link points at `parent` (`"a:fvParent"`, `"a:measures"`). GilbApp: `usePlanFind`, PTL:443, :484 (`lib/base/planFind.ts` 286).
    - `invalidatePlanFind(planVault, attr, parentId)`: read the find again. GilbApp: `invalidatePlanFind(qc, planVault, attr, record.id)`, PTL:446, :490.
    - `invalidatePlanSearch(planVault)`: drop the finished picker searches of the vault. GilbApp: `invalidatePlanSearch(qc, planVault)`, PTL:409, :590, :785, :995, :1126 (`lib/base/planSearch.ts` 25).
    - `liveRow(vaultId, id, fallback): GridRecord`: the newest of the list row, the record read and the fallback. GilbApp: `liveRow(qc, vaultId, id, fallback)`, PTL:349 and nine more (`lib/base/planRowCache.ts` 101). Called at click time, never at render.
    - `ensureEtagUnchanged(planVault, row, sameFor): Promise<{ row } | { conflict: true } | { unreadable: true }>`: a row that has an ETag is returned as it is; else it is read, and `sameFor(fresh)` false is a conflict. GilbApp: `ensureEtagUnchanged(qc, planVault, row, sameFor)`, PTL:159, :660 (`lib/base/planRowCache.ts` 148).
    - `applyPatch(row, patch, etag): GridRecord`: the row with the patch applied. GilbApp: `applyPatch(row, patch, etag)`, PTL:170, :670 (`lib/base/planRowCache.ts` 30).
    - `storePlanRow(planVault, row, opts?)`: replace the row in every list that holds it. GilbApp: `storePlanRow(qc, planVault, row)`, PTL:171, :671 (`lib/base/planRowCache.ts` 117).
    - `setPlanRecord(id, at, row)`: put the row in the record-read cache. GilbApp: `qc.setQueryData(planRecordKey(id, at), row)`, PTL:172, :672 (`lib/base/planFind.ts` 53).
    - `dropPlanFind(planVault, attr, parentId, id)` and `prependPlanFind(planVault, attr, parentId, row)`: take a record off a line's find, or show it there, at once, and read the find again. GilbApp: PTL:175, :176, :607 (`lib/base/planFind.ts` 338, 310).
    - `putRecordInCaches(planVault, row, opts?)`: add a made record to the lists. GilbApp: `putRecordInCaches(qc, planVault, row, { insert: true })`, PTL:606 (`lib/base/recordHooks.ts` 1807).
    - `getRelations(id, at)` and `setRelations(id, at, next)`: the cached relations of a record, read and set (`next` a list, or a function of the cached list). GilbApp: `qc.getQueryData<RecordRelation[]>(relationsKey(id, at))` and `qc.setQueryData(relationsKey(id, at), next)`, PTL:839-841, :957, :1087 (`lib/base/relations.ts` 59).
    - `resolveType(id): object | null`: the record type for `"function"` or `"solution"`, or null. GilbApp: `resolveType(id)`, PTL:402, :778, :983, :1114 (`lib/base/recordTypes.ts` 457).
    - `typeUriForVaultNamespace(typeName, vaultNamespace): string`. GilbApp: PTL:585, :594, :784 (`lib/base/recordTypes.ts` 102).
    - `memberEntityUri(idOrUri, preferredUri?, vaultNamespace?): string`: the address of a record. GilbApp: PTL:593, :786 (`lib/base/relationWrite.ts` 99).
    - `readRecord(id, at): Promise<BaseRecord | null>`: GilbApp: `readRecord(id, at)`, PTL:386, :1276 (`lib/base/records.ts` 645).
  - Writers (all optional; see below):
    - `patchRecord(id, patch, at, source, precondition?): Promise<{ etag }>`: merge-patch a record. GilbApp: `patchRecord(...)`, PTL:168-169, :668-669 (`lib/base/records.ts` 963). Used by Part of, Function of Value and Value of Function.
    - `createRecord(planVault, typeUri, facts, nameHint?): Promise<{ id, etag }>`: the raw create. GilbApp: PTL:585, :784 (`lib/base/records.ts` 522). Used by Function of Value and Value of Function.
    - `useCreateRecord(planVault): { mutateAsync(args): Promise<{ id, etag, entityUri?, tempId }> }`: a hook, the optimistic create. GilbApp: `useCreateRecord(planVault)`, PTL:321, :910, :1041 (`lib/base/recordHooks.ts` 1948). Used by Part of, Solution of and Solutions. It is called on every render, in the same place: a host without it is given an inert stand-in.
    - `writePairRelation(input): Promise<{ id, uri? }>` and `endRelation(relation, planVault)`: write and end a `t:SolutionOf` relation. GilbApp: PTL:827, :956, :1086 (`lib/base/relationWrite.ts` 217, 491). Used by Solution of and Solutions.
    - `ConnectedCreateDialog`: a component taking `PlanTagLinksCreateDialogProps`. GilbApp: `<ConnectedCreateDialog open stakeholders source={null} drawnVaultIds={[vaultId, planVault]} initialTypeOption onClose onCreated />`, PTL:1266. Used by Part of System.
- Read-only without writers. Each component's first lines give up editing when a writer it uses is missing: the one added line is `canEdit = canEdit && <each writer it uses> !== undefined;` (Part of: `patchRecord`, `useCreateRecord`; Function of Value and Value of Function: `patchRecord`, `createRecord`; Solution of and Solutions: `writePairRelation`, `endRelation`, `useCreateRecord`; Part of System: `ConnectedCreateDialog`; Sub-functions has none). The line then behaves exactly as with `canEdit` false: no picker, no remove control, no "+ Value". All the other members are still called and so are required, even by a host that never writes.
- The `PlanTagPickerHostContext` provider of `plan-tag-picker`, the provider of `PickerQueryContext` (`record-picker`), the provider of `RefLabelContext` (`entity-ref-value`), and a `CardModeProvider` (`card-mode`) above the card.
- Tailwind scanning this unit's `src`, and the CSS variables `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--accent` and `--bad` (and those of the picker, the label and the remove control).
- React 19.

## Do not

- Do not give the host a new object on every render: the lines read it once per render and the picker's find depends on it.
- Do not call `liveRow` yourself ahead of a click: the lines call it when the person acts, so the write is made against the newest row; a snapshot would write against a stale ETag.
- Do not answer `ensureEtagUnchanged` without honouring `sameFor` for a row that has no ETag: it is what stops a write over a link another session changed.
- Do not make `setRelations` ignore its function form: the remove controls of Solution of and Solutions pass a function of the cached list.
- Do not install a second copy of `record-picker`, `entity-ref-value` or `card-mode`: each holds its own context.

## Wrong readings

- "A link line stores a name." It stores the address; the name is the target's live tag, so a renamed record shows its new tag at once.
- "Solutions is a second kind of link." It is the same `t:SolutionOf` relation read from its other end: Solution of writes this record as source, Solutions as target.
- "Part of System writes the link." It calls `onWrite(uri)` or `onWrite(null)`; the caller writes. Only its create dialog is the host's.
- "A Value that already measures this Function is added twice." It is ignored: no write, no notice.
- "Remove on Function of Value patches this record." It patches the Value: the link is stored on the Value (`a:measures`), so the line's remove control writes to the other record, and only when that Value really points here.
- "Value of Function patches one link." It writes the Value's whole `a:measures` list on every change, and null when it becomes empty.
- "`canEdit` true is enough to edit." The card must be in edit mode (or `offer` set), and the host must supply the writers the line uses.
- "The notes under a find are part of the find." They are drawn by this unit's copy of the app's note helper from the host's `PlanFind` (`total`, `capped`, `unread`, `cap`).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanTagLinks.tsx` line 47 (`MISSING_ADDRESS`), lines 147-177 (`VERSION_UNREAD`, `LINK_CONFLICT`, `writeLink`) and lines 297-1295 (`PlanPartOf`, `findQuiet`, `byTag`, `PlanSubFunctions`, `PlanFunctionOfValue`, `measuredAddresses`, `writeMeasures`, `PlanValueOfFunction`, `SYSTEM_TYPES`, `SOFTWARE_SYSTEM_OPTION`, `tagFor`, `writeSolutionOf`, `SolutionChips`, `PlanSolutionOf`, `PlanSolutions`, `PlanPartOfSystem`) to `src/planTagLinks.tsx`, in that order. Code verbatim except the named changes below. The rest of the file (lines 1-46, 48-146, 179-295) is the `plan-tag-picker` unit: `SEARCH_ERROR`, `tagShaped`, `planSearchKey`, `usePlanPickerFind`, `rowOnHit`, `chosenRow`, `httpStatus`, `noticeFor`, `TagLink` and `PlanTagPicker` are imported from it (each was compared with the source before: the same code but for the host and the types the picker's README names), and so is `SEARCH_INCOMPLETE_CREATE`.
- Imports: `../mynet/RemoveControl` is `@kaigilb/gilbplatformcode-remove-control`; `./EntityRefValue` and `refDisplayName` are `@kaigilb/gilbplatformcode-entity-ref-value` (the app's `refDisplayName`); `./orgCard/OrgRecordPicker` is `@kaigilb/gilbplatformcode-record-picker`; `./cardMode` is `@kaigilb/gilbplatformcode-card-mode`; `entityRefFromFact` is `@kaigilb/gilbplatformcode-entity-ref`; `memberValue` is `@kaigilb/gilbplatformcode-plan-card-facts`; `alreadyMeasuresSentence`, `isTypeName`, `linkAddress`, `partOfExcludedIds`, `PlanChainError`, `pointsAt`, `recordTag`, `wouldLoop` (`lib/base/planLinks`) and `readPartOfFact`, `relationMemberIds`, `SOLUTION_OF_ROLES`, `SOLUTION_OF_TYPE`, `solutionOfCacheRow`, `solutionOfFunctions`, `solutionsTargeting` (`lib/base/planSolution`) are `@kaigilb/gilbplatformcode-plan-links-model`; `idFromEntityUri` (`lib/base/search`) is `@kaigilb/gilbplatformcode-id-tail`; the types `BaseRecord` and `GridRecord` are `@kaigilb/gilbplatformcode-base-record`.
- Copied helpers (private, in the unit; no merged unit has them):
  - `src/planFindNote.ts`: `PLAN_FIND_CAP` (`lib/base/planFind.ts` 16), the type `PlanFind` (26-33), `planFindRows` (35-37), `planCapSentence` (39-41), `planUnreadSentence` (43-45); `quiet` (`components/records/usePlanParts.ts` 22) and `PlanFindLimitNote` (57-84). Code verbatim; one doc comment of the note is reworded, and the file is `.ts` with `createElement`, as in the source.
  - `src/writeSource.ts`: the interface `WriteSource` (`lib/base/records.ts` 427-433, its comments left out) and `writeSource` (447-452).
  - `VEDA_ID_PREFIX = "veda:"` (`lib/base/typeSearch.ts` 211), a constant in `src/planTagLinks.tsx`. It is the prefix of a live ontology term's option id (`veda:SoftwareSystem`), the id the create dialog is opened on; it is a type id, not an address.
  - `SOFTWARE_SYSTEM_OPTION` is data, kept as in the source (`id: "veda:SoftwareSystem"`, `label: "Software System"`, `typeName: "SoftwareSystem"`, `spec: null`, `kind: "type"`). It names no host. The type of the dialog's `initialTypeOption` is the `TypeOption` of `@kaigilb/gilbplatformcode-type-chooser`, a type-only import in `src/planTagLinksHost.ts`.
- Named changes:
  1. `useQueryClient()` is `usePlanTagLinksHost()` (a private hook reading `PlanTagLinksHostContext`, throwing an error that names the provider when there is none), placed after `useCardMode()` (in `PlanSubFunctions`, which has none, where the `useQueryClient()` stood is the first line). `writeLink`, `writeMeasures` and `writeSolutionOf` take `host` where they took `qc`. The host is typed with its optional writers read as present (`Required<PlanTagLinksHost>`) in one place, the private hook; each component's added read-only line is what keeps a missing writer from being reached.
  2. Each call that reached outside the unit is the host member of the same name, with the same arguments but for `qc`: `useRecords`, `useRelations`, `usePlanFind`, `invalidatePlanFind`, `invalidatePlanSearch`, `liveRow`, `ensureEtagUnchanged`, `applyPatch`, `storePlanRow`, `dropPlanFind`, `prependPlanFind`, `putRecordInCaches`, `resolveType`, `typeUriForVaultNamespace`, `memberEntityUri`, `readRecord` (also the third argument of `wouldLoop`), `patchRecord`, `createRecord`, `writePairRelation`, `endRelation`, and `<ConnectedCreateDialog>` as `<host.ConnectedCreateDialog>`. `qc.setQueryData(planRecordKey(updated.id, updated.entityUri), updated)` is `host.setPlanRecord(updated.id, updated.entityUri, updated)`. In `writeSolutionOf`, `const key = relationsKey(...)` is dropped, `qc.getQueryData<RecordRelation[]>(key)` is `host.getRelations(viewing.id, viewing.entityUri)` and `qc.setQueryData(key, [...])` is `host.setRelations(viewing.id, viewing.entityUri, [...])`; in the two remove handlers `qc.setQueryData<RecordRelation[]>(relationsKey(record.id, record.entityUri ?? null), updater)` is `host.setRelations(record.id, record.entityUri ?? null, updater)`.
  3. `useCreateRecord(planVault)` is `(host.useCreateRecord ?? useNoCreate)(planVault)`: the hook is called on every render in the same place; `useNoCreate` is a private stand-in whose `mutateAsync` rejects, never reached because the component is then read-only.
  4. One added line per component with a writer: `canEdit = canEdit && … !== undefined;` (see "What the host must supply"). It is the only added statement in `PlanPartOf`, `PlanFunctionOfValue`, `PlanValueOfFunction`, `PlanSolutionOf`, `PlanSolutions` and `PlanPartOfSystem`.
  5. The seven components were exported in the source and still are; `writeLink`, `writeMeasures`, `writeSolutionOf`, `SolutionChips`, `measuredAddresses`, `tagFor` and `SOFTWARE_SYSTEM_OPTION` stay private, as in the source.

`src/planTagLinksHost.ts` (the host interface, the types and the context), `src/index.ts` and `test/` are new. `test/fakeHost.tsx` is a fake host that logs its calls in order; `test/mount.tsx` renders and picks.

Tests:

| Source | Ported / left out |
|---|---|
| `RecordDetail.planLinks`, `planSolution`, `planFunctionParts`, `planFindReads`, `planSearch`, `planSearchComplete`, `planPickerCache`, `planCard`, `planForm`, `planValueCard`, `planSources`, `planSourceDefaults` and the three other `RecordDetail.plan*` suites of `components/records/` that draw these lines (15 files in all) | Left out: they render whole cards over a stubbed `fetch`; what they say of these lines is pinned in this unit's tests against a fake host. |
| `lib/base/planSolution.*` and `planLinks.*` tests of the model | Not here: they test `plan-links-model`. |
| `components/menu/sectionMenuList.test.ts` | Left out: it names the groups' kinds for the section menu; it does not draw these lines. |

The source had no test of these components on their own. The tests of this unit are new and pin, per line: the linked records shown by their live tag (the label follows a change); a pick writing once through the host, with the order of the host's calls; the create paths (the optimistic create of Part of, Solution of and Solutions, and the raw create of Function of Value and Value of Function, kept apart); unlinking; a Part of loop refused before any write (a record two steps up, an unreadable chain, a chain of 50); the duplicate-tag sentence on a 409; Solutions mirroring Solution of; `onWrite(uri | null)` of Part of System and its create dialog; the cap and unread notes; read-only without each writer; the missing provider; and the test ids. `src/planFindNote.test.tsx` and `src/writeSource.test.ts` pin the copied helpers, `src/example.test.tsx` runs the README example, `src/exports.test.ts` pins the export list and `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
