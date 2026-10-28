# description-parts-view

Draws and edits the Description of a Plan card as one record per Keyword part in a tree: add a part, edit its text and source, paste many parts at once, move a part up, down, in or out by buttons, keys or drag, and remove a part with its sub-parts, all written in one queue so the order of the writes is kept, with every read and write supplied by the host.

## What this is

Two modules in one unit, as in the source: the view and the hook it reads the parts with.

- `PlanDescriptionParts({ record, vaultId, planVault?, canEdit, onOpen, onNotice, onBindAdd })`: the Description line of a Solution, a Solution Constraint, a Function or a Value card. `record` is the card's record (its tag is the base of every part's tag); `vaultId` is the screen vault; `planVault` is the record's own vault (default `vaultId`), where creates, paste, moves and removals go (the reads of the parts use the vault `record.entityUri` names, else `vaultId`); `canEdit` is whether the person may write; `onOpen(id)` opens a record; `onNotice(text | null)` shows or clears the card's notice; `onBindAdd(open)` is called on EVERY render with a function that opens the add row and focuses its Text box (the card's "+" calls the latest one).
  - Modes. The mode is the `card-mode` unit's: `useCardMode().editing && canEdit` is Edit, and a `CardModeProvider` must be above the view. Reading: each part is `Keyword: text` (a button when `canEdit`, which opens the part), with its source under the text. One part open: the text is a `field-row` editor, the source is a `plan-source` picker, and `+ Sub-part` is offered. Edit: each part is ONE row (`data-part-row`) with its Keyword, its tag, a one-line text and five buttons (`data-part-moves`), a drag grip, and the three add buttons `+ Part`, `+ Assumption`, `Paste parts`, each with a help button.
  - The tree. Parts are read with one find of `a:partOf` at every depth: the record's own level, then the level of each part found. It is drawn from the host's finds (`data-part`, `data-part-tag`), ordered by element order, then tag, then id. An older description text on the record itself is shown above the tree with its source and a line saying to move it into parts.
  - Add. `+ Part` and `+ Assumption` open the Keyword and Text boxes. A Keyword is one word, letters only, starting with a capital; a bad one is refused with the model's sentence (`KEYWORD_MESSAGE`), a tag already in the pool, or used in the vault, is refused with the tag's sentence; the Keyword is suggested from the text until it is typed in. One create through the host, then (in this order) `readRecord`, `rememberRecord`, `markFreshlyCreated`, `storePlanRow`, `invalidatePlanSearch`, `prependPlanFind`. The first `+ Assumption` makes the Assumption part first. The signed-in person is the source of a part that has text and no source.
  - Edit text and source. One patch of the changed fact, with the part's version as If-Match, after a version check (a part with no version is read first). A version conflict reads the latest, shows it, says so, closes the editor and re-reads the part's level.
  - Paste. `Paste parts` shows a preview before anything is written (each line as the tag and text it will become, `skipped`, or `not a part`); `Create N parts` checks every tag in the vault, then writes in the pasted order, each part prepended to its level with no re-read, and re-reads each touched level once at the end.
  - Move. `↑ ↓` among the same level, `→` under the part above as its last sub-part, `←` out to just after the parent, or drag (by pointer or by the keys of the `sortable-tree` unit). A move is one sequence: the moved part first (`a:partOf` and `a:elementOrder` in one patch), then each sibling whose order changes, one patch each. On a level the host read only in part, the whole level is read fresh before a move. An assumption never leaves the Assumption part and no other part goes under it.
  - Remove. `×` asks (`Keep` / `Confirm delete`), plans the removal of the part and every sub-part (limits: 12 levels, 300 parts; a sub-part that cannot be read refuses it; a record that is not a part but names the part is left and named), then deletes the deepest first.
  - One queue. Every write (add, save text, save source, paste, move, drop, remove) runs in one chain (`run` on `tail`): the next starts when the previous has settled, whether it succeeded or failed. While a move or a remove is being written the move, remove and drag controls are off.
- `usePlanParts(record, vaultId)`: the hook the view reads the parts with. Returns `tree`, `tagPool`, `pending`, `failed`, `topLoading`, `topError`, `parentIds`, `noteFor(id)`, `partial(id)`, `findState(id)`, `childrenSettled(node)`, `subRead(node)`.
- `PlanFindLimitNote({ data, word, singular, onRetry, partialSentence? })` and `PARTIAL_LEVEL`: the notes under a level the host read only in part (the first N of M, K could not be read, the partial-level sentence, Try again).
- `DescriptionPartsHostContext`: the context through which the host gives the view everything it reads and writes. With no provider the view throws an error naming it.
- The types `DescriptionPartsHost`, `PlanFindQuery`, `FindWriteOptions`, `RememberedRecord`, `EtagGate`, `DeleteRecordMutation`, `PlanFind`, `WriteSource`, `MergePatchValue`, `RecordCreateFacts`, `RecordFactValue`, `FindRead`.

## What this is not

- Not the card, its group frame or its title, nor the Edit button and the card mode (`card-mode`), nor the "+" that calls `onBindAdd`'s function.
- Not a reader or writer of records. It never fetches, never writes, never caches; the host does, through the members below. A host without the three writers gets a read-only Description.
- Not the part rules: `description-parts-model` holds the Keyword rule, the tree, the move and removal plans and the level reads (`readLevel` and the rest take the host's level members).
- Not the source picker (`plan-source`), the text editor (`field-row`), the tree (`sortable-tree`) or the help panel (`description-help`): it uses them, so their hosts' contexts are needed too.
- Not a query library. The source used react-query for the finds; this unit never imports it.

## How to take it

Package: `@kaigilb/gilbplatformcode-description-parts-view`

Take it together with its peers `base-record`, `card-mode`, `description-help`, `description-parts-model`, `fact-faithful`, `field-row`, `open-popups`, `plan-button-row`, `plan-card-facts`, `plan-kinds`, `plan-links-model`, `plan-source` and `sortable-tree`, and their own peers (`help-doc` for `description-help`; `id-tail`, `entity-ref`, `relation-role`, `type-curie` and `type-key` for the plan units; `entity-ref-value`, `record-picker` and `remove-control` for `plan-source`). Third-party: `@dnd-kit/core` 6.3.1, a peer of `sortable-tree`, which this unit passes on as its own peer. Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit, so one copy of each context):

```
install-links=true
```

Then install them:

```sh
npm install @dnd-kit/core@6.3.1 <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/id-tail <path-to-the-library>/units/open-popups <path-to-the-library>/units/card-mode <path-to-the-library>/units/entity-ref <path-to-the-library>/units/relation-role <path-to-the-library>/units/base-record <path-to-the-library>/units/fact-faithful <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/help-doc <path-to-the-library>/units/description-help <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/sortable-tree <path-to-the-library>/units/field-row <path-to-the-library>/units/remove-control <path-to-the-library>/units/record-picker <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/plan-source <path-to-the-library>/units/description-parts-view
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. The unit's `tsconfig.json` leaves out `noImplicitOverride`, because `sortable-tree` ships a class source that does not use the `override` keyword and the compiler reads it.

## Examples

```tsx
import { PlanDescriptionParts, DescriptionPartsHostContext } from "@kaigilb/gilbplatformcode-description-parts-view";
import type { DescriptionPartsHost } from "@kaigilb/gilbplatformcode-description-parts-view";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanSourceHostContext } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PickerQueryContext } from "@kaigilb/gilbplatformcode-record-picker";

// Once, above the card. Every member below is yours; "What the host must supply" says what each does.
const host: DescriptionPartsHost = {
  // reads (hooks)
  useRecords, usePlanFind, useSubFinds, useSelfSource,
  // click-time getters
  cachedRecords, getFind, getFinds, liveRow, readRecord, tagUsedInVault, ensureEtagUnchanged, reconcileAfterConflict, isConflict, typeUriForVaultNamespace,
  // the level members the part rules read through
  pageChildIds, markStale, readMember, applyPinsAndDrops,
  // cache writes
  storePlanRow, setRecordRead, invalidatePlanSearch, prependPlanFind, dropPlanFind, patchPlanFindRows, invalidatePlanFind, setFind, rememberRecord, markFreshlyCreated,
  // writers: leave any one out and the Description is read-only
  createRecord, patchRecord, useDeleteRecord,
  // app component
  HelpButton,
};

<DescriptionPartsHostContext.Provider value={host}>
  <PlanSourceHostContext.Provider value={planSourceHost}>
    <RefLabelContext.Provider value={useRefLabel}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <CardModeProvider canEdit={canWrite}>
          {/* The card group's section element must be above the view, see "Do not". */}
          <section>
            <PlanDescriptionParts record={record} vaultId={screenVault} planVault={recordVault} canEdit={canWrite} onOpen={openRecord} onNotice={setNotice} onBindAdd={(open) => (addRef.current = open)} />
          </section>
        </CardModeProvider>
      </PickerQueryContext.Provider>
    </RefLabelContext.Provider>
  </PlanSourceHostContext.Provider>
</DescriptionPartsHostContext.Provider>;
```

## What the host must supply

Contexts of the peers, above the view: the `CardModeProvider` of `card-mode` (the view reads `useCardMode()`); the `PlanSourceHostContext` of `plan-source`; the `RefLabelContext` of `entity-ref-value`; the `PickerQueryContext` of `record-picker`. Without them the components throw errors naming them. If the host has a type registry it calls `setTypeKey` of `type-key` once at start-up (the unit compares types through `isTypeName`).

The `DescriptionPartsHostContext` provider with an object of these members. File and line are those of GilbApp, commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/PlanDescriptionParts.tsx` (`PD`) or `usePlanParts.ts` (`UP`) unless another file is named.

Reads (hooks; called on every render, in the order the source called them, never conditionally):

- `useRecords(vaultId)`: `{ data? }`, the records already loaded for a vault: the tag pool. Replaces `useRecords(planVault)` (UP:90).
- `usePlanFind(vaultId, attr, parent, cap)`: the find of the parts under a record, as `PlanFindQuery` (`data`, `status`, `isLoading`, `isError`, `isPending`, `isSuccess`). Replaces `usePlanFind(planVault, "a:partOf", record.entityUri ? record : null, cap)` (UP:91; `planFind.ts:286`: 15 000 ms stale time, no retry).
- `useSubFinds(vaultId, attr, parents)`: one `PlanFindQuery` per parent `{ id, uri }`, in the same order. Replaces `useQueries({ queries: parents.map(...) })` (UP:103-111: `planFindKey`, `enabled: !!p.uri`, `retry: false`, `staleTime: 15_000`, `loadPlanFind(qc, planVault, "a:partOf", p.id, p.uri)`). The array and each result must keep their identity while their data does not change.
- `useSelfSource()`: `{ "@id" } | null`, the signed-in person as a source. Replaces `useSelfSource()` (PD:242).

Click-time getters (called when the person acts, never kept from a render):

- `cachedRecords(vaultId)`: the loaded rows of a vault, or `[]`. Replaces `qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(id))?.pages.flatMap((p) => p.records) ?? []` (PD:377).
- `getFind(vaultId, attr, id)`: the find held now, or `undefined`. Replaces `qc.getQueryData<PlanFind>(planFindKey(...))` (PD:488, PD:988).
- `getFinds(vaultId)`: every find held now for a vault. Replaces `qc.getQueriesData<PlanFind>({ queryKey: ["plan-find", planVault] })` (PD:997). Read at the moment of the call, not from a hook value: a queued move plans from it.
- `liveRow(vaultId, id, fallback)`: the newest copy of a record. Replaces `liveCachedRow(qc, vaultId, id, fallback)` (PD:527, :536 with the PLAN vault; PD:584, :624 with the SCREEN vault; `planRowCache.ts:101`). Each call keeps its own vault.
- `readRecord(id, at)`: reads a record. Replaces `readRecord(id, planVault)` (PD:450). The view passes the plan vault id as `at`.
- `tagUsedInVault(vaultId, tag)`: whether the tag is used by any record in the vault. Replaces `tagUsedInVault(planVault, tag)` (PD:706, :710, :866; `planLinks.ts:220`).
- `ensureEtagUnchanged(vaultId, row, sameFor)`: `{ row }`, `{ conflict: true }` or `{ unreadable: true }`. Replaces `ensureEtagUnchanged(qc, planVault, row, sameFor)` (PD:530; `planRowCache.ts:148`). A row passed with `etag: null` MUST be read again.
- `reconcileAfterConflict(vaultId, row)`: the record as the vault has it, or `null`. Replaces `reconcileAfterConflict(qc, planVault, live)` (PD:564; `planRowCache.ts:162`).
- `isConflict(e)`: true for exactly the error the patch writer raises when the version check fails (HTTP 412). Replaces `e instanceof RecordConflictError` (PD:563, :1748, :1768). A 409 is not a conflict here: it means the tag is taken.
- `typeUriForVaultNamespace(typeName, vaultNamespace)`: the stored type address of `SpecificationElement` or `Assumption`. Replaces `typeUriForVaultNamespace(args.typeName, planVault)` (PD:437; `recordTypes.ts:102`).

The level members (the view passes the host itself where the source passed the query client to `planPartialWrite` (PD:387, :417, :891) and `removalPlan` (PD:1340); `readLevel` of `description-parts-model` calls them):

- `pageChildIds(planVault, parentUri, { cap })`: `{ ids, count, capped }`, the ids of the records whose `a:partOf` is `parentUri`. Replaces `pageAttributeIds("a:partOf", parentUri, vaultOriginOf(planVault), { cap, qc })`.
- `markStale(entityUri)`: marks one record's cached read stale WITHOUT refetching it, and settles. Replaces `qc.invalidateQueries({ queryKey: planRecordKey(...), refetchType: "none" })`.
- `readMember(entityUri, fresh)`: one record; `fresh` true MUST fetch and never answer from a cache. Replaces `readCached(qc, entityUri, fresh)`.
- `applyPinsAndDrops(planVault, attr, parentId, rows, serverIds)`: the host's pinned rows put in front, its dropped rows left out. Replaces `applyPinsAndDrops(qc, ...)`.

Cache writes (always required; a host with no writers may give no-ops):

- `storePlanRow(vaultId, row, opts?)`: puts a saved or created row in the app's lists. Replaces `storePlanRow(qc, planVault, row, opts)` (PD:478, :558; `planRowCache.ts:117`).
- `setRecordRead(id, at, row)`: puts a saved row in the record read. Replaces `qc.setQueryData(planRecordKey(id, entityUri), row)` (PD:559).
- `invalidatePlanSearch(vaultId)`: drops cached searches. Replaces `invalidatePlanSearch(qc, planVault)` (PD:479; `planSearch.ts:25`).
- `prependPlanFind(vaultId, attr, parentId, row, opts?)`: shows the row at the head of a find at once; unless `opts.refresh === false` it also re-reads. Replaces `prependPlanFind(qc, planVault, "a:partOf", parentId, row, opts)` (PD:480, :1057; `planFind.ts:310`).
- `dropPlanFind(vaultId, attr, parentId, id, opts?)`: takes the row out at once and keeps it out of a stale re-read; unless `refresh === false` it also re-reads. Replaces `dropPlanFind(qc, ...)` (PD:1056, :1368; `planFind.ts:338`).
- `patchPlanFindRows(vaultId, id, next)`: shows a patch of one record on every find that holds it. Replaces `patchPlanFindRows(qc, planVault, id, next)` (PD:538, :560, :568; `planFind.ts:365`).
- `invalidatePlanFind(vaultId, attr, parentId, opts?)`: the separate re-read of one level: marks the `members` stale, then re-fetches the find. Replaces `invalidatePlanFind(qc, planVault, "a:partOf", parentId, { members })` (PD:148 via `reReadLevels`, :542, :574, :1516, :1517; `planFind.ts:265`).
- `setFind(vaultId, attr, id, value)`: replaces the find held for one record. Replaces `qc.setQueryData<PlanFind>(planFindKey(...), value)` (PD:489, :1358).
- `rememberRecord(ref)`: Replaces `rememberRecord({ id, vaultId, typeUri, updatedAt })` (PD:452; `workingSet.ts:144`).
- `markFreshlyCreated(id)`: Replaces `markFreshlyCreated(id)` (PD:453; `recordHooks.ts:501`).

Writers (optional; the Description is read-only unless `createRecord`, `patchRecord` and `useDeleteRecord` are all given, see "Wrong readings"):

- `createRecord(vaultNamespace, typeUri, facts, nameHint?)`: `{ id, etag }`. Replaces `createRecord(planVault, typeUri, facts, args.tag)` (PD:448; `records.ts:522`). Raise an error with `status` 409 (and `tag`, the tag that was taken) when the tag exists.
- `patchRecord(id, patch, at, source, precondition?)`: `{ etag }`; `source` is `undefined` for a record with no served keys. Replaces `patchRecord(live.id, patch, live.entityUri ?? null, src[0], pre)` (PD:554-555; `records.ts:963`). Raise the error `isConflict` recognises when `precondition.ifMatch` is not the version held.
- `useDeleteRecord(vaultId)`: a hook returning `{ mutateAsync({ id, entityUri }) }`. Replaces `useDeleteRecord(vaultId)` (PD:248; `recordHooks.ts:2634`) and `del.mutateAsync(...)` (PD:1367). Called on every render while the host has it.

App component:

- `HelpButton`: a component `{ label, title, startAt, children }` that draws the "?" button and, when it is pressed, a panel holding `children`. It MUST render an element with the attribute `data-help-button`. Replaces `HelpButton` (PD:1856, :1864, :1883; `components/help/HelpButton.tsx`).

Also:

- Tailwind scanning this unit's `src` (and those of its peers), so its classes are generated (`min-h-11`, `min-w-11`, `text-[12px]` to `text-[20px]`, `leading-relaxed`, `whitespace-pre-line`, `pl-6`, `shrink-0`, `flex-1`, `min-w-0`, `max-w-xs`, `focus-visible:outline-2`, `disabled:opacity-40`, `aria-disabled:opacity-40`, …).
- These CSS variables: `--accent`, `--bad`, `--focus`, `--ink`, `--ink-soft`, `--line`, `--r-md`, `--sel`, `--surface` (and those of its peers).
- React 19, and the peers installed beside this one.

The DOM contracts (the view reads or sets these; keep them):

- `input[aria-label="Tag"]`: when the card has no tag, the view calls `document.querySelector('input[aria-label="Tag"]')?.focus()`. The card's Tag box must carry that label. (The source's `focusTagInput`, kept as it is.)
- `[data-help-button]`: the document `mousedown` handler leaves the add row open for a press on any element with this attribute or inside one. The host's `HelpButton` must render one.
- The move buttons' labels: after a keyboard move the view looks in `[data-part-moves]` of the part for a button by its `aria-label`: ends with ` up`, ends with ` down`, includes ` out a level`, includes ` in under` or ` in (`; and the grip by `button[aria-label^="Drag"]`. The view renders these itself (`Move X up`, `Move X down`, `Move X out a level`, `Move X in under Y`, `Move X in (no part above to go under)`, `Remove X`, grip `Drag X`); keep a Keyword that ends in ` up` or ` down` in mind.
- The attributes it sets, for the host's tests and styles: `data-part`, `data-part-tag`, `data-part-row`, `data-part-moves`, `data-part-source`.
- The view sits inside the card group's `section` element: `field-row` keeps an open text when focus moves to another element of that section (the source box), and the Escape and Tab behaviours of that row are scoped to it.

## Do not

- Do not add or remove members of the host object while the view is mounted: `useDeleteRecord` is a hook and is called only while the host has it.
- Do not return a new array from `useSubFinds` (or a new result object) on every render: the view memoises on them, and a new identity every render re-runs its effects.
- Do not answer `readMember(entityUri, true)` from a cache: `fresh` is how the view asks for what is stored now before it numbers a move or a new part on a level it has not read whole.
- Do not make `prependPlanFind` or `dropPlanFind` re-read when `refresh` is `false`, and do not fold the separate re-read into them: see "Wrong readings".
- Do not snapshot `getFinds`, `getFind`, `liveRow` or `cachedRecords` at render: the view calls them when the person acts, and a queued move calls `getFinds` again when it starts.
- Do not queue the writes in the host. The view's own chain (`run` on `tail`) keeps the order of add, save, paste, move and remove; a queue outside it changes that order.
- Do not install a second copy of this unit or of `card-mode`, `plan-source`, `field-row` or `sortable-tree`: a second copy has its own context.
- Do not call the function `onBindAdd` gave on a read-only Description: the add row would open (see "Wrong readings").

## Wrong readings

- "Prepend and drop re-read the level." Not when `refresh` is `false`. A paste, a move and a removal call `prependPlanFind` and `dropPlanFind` with `refresh: false` and then make the ONE re-read themselves, through `invalidatePlanFind`, once for each level they touched. A host that re-reads in `prependPlanFind(..., { refresh: false })` doubles the reads of every paste (3 parts: 3 extra reads), every move and every removal. Without `refresh: false` (a plain add) `prependPlanFind` is what re-reads, and the view makes no `invalidatePlanFind` of its own.
- "`readLevel` may use the cache." With `fresh: true` (`readMember(entityUri, true)`) it must not return a cached row: the orders written come from it. The fake host in `test/fakeHost.tsx` serves a stale copy for `fresh: false` and the vault's for `fresh: true`; a test pins that the orders written are the vault's.
- "A read-only host gets a disabled Edit." The Description is read-only only when a writer is missing: `createRecord`, `patchRecord` and `useDeleteRecord` must all be given. With one missing, the view behaves as with `canEdit` false: `Keyword: text`, sources, no `+` buttons, no move buttons, no grips, no remove. The cache members, `readRecord`, `ensureEtagUnchanged` and the level members are not writers and are always required.
- "The function `onBindAdd` gives is disabled when the Description is read-only." It still opens the add row, and a create then fails; the card does not call it when `canEdit` is false.
- "Escape closes the add row." With something typed it asks `Discard what you typed?` (Keep / Discard). With nothing typed the view ignores it, and the card mode leaves Edit, which closes the empty row. With a modal dialog open the view ignores it.
- "A press outside the add row only closes it." A press outside a row with something typed SAVES it (or shows the Keyword rule and stays open). Pressing another `+` button while a valid part is typed saves that part first.
- "Leaving the text editor is checked against the version the editor opened at." Only when the editor stays open (Tab into the source box). When the editor closes (a click away), the starting version and the text it started from are forgotten before the queued save reads them, so the save is written with the newest version the app holds. A source chosen for the part is forgotten the same way: the next text saved by closing the editor is stamped with the person again.
- "A conflict in a move gives one notice." A conflict found by the version check before the write (`ensureEtagUnchanged` answered `conflict`) gives the one `changed elsewhere` notice. A conflict raised by the write itself (`patchRecord` throwing what `isConflict` accepts) gives that notice and then `Could not move X; nothing was changed (<message>)`, which replaces it on the card.
- "The Value card's Description is capped at 300." The `a:partOf` find of a Value or a Development Resource is asked for 2000 rows (`usePlanFind`'s `cap` argument); other cards 300.
- "The unit tags the part's type." It asks the host: `typeUriForVaultNamespace("SpecificationElement" | "Assumption", planVault)`, since the stored type address depends on the host's configuration.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanDescriptionParts.tsx` lines 1-1943 (the whole file) to `src/PlanDescriptionParts.tsx`; the export is the source's (`PlanDescriptionParts`). The code is copied by script and changed only as listed. Named changes:
  1. Imports (lines 5-90): `PlanButtonRow` from `plan-button-row`; `DescriptionHelp` from `description-help`; `FieldRow` from `field-row`; `modalIsOpen` and `insideOpenLayer` from `open-popups`; `SortableTree`, `TreeItem`, `flattenTree`, `DropTarget` from `sortable-tree`; `useCardMode` from `card-mode`; `PlanSource` from `plan-source`; `planTypePair` from `plan-kinds`; `duplicateTagSentence`, `isTypeName`, `linkAddress`, `recordTag` from `plan-links-model`; `indexBefore`, `planPartialWrite`, `removalPlan`, `REMOVAL_TOO_DEEP`, `REMOVAL_TOO_MANY` and the types `Gone`, `Kept`, `LevelMovePlan`, `PartialTarget` from `description-parts-model`, and every part rule the file used (`ASSUMPTION_ELEMENT`, `ASSUMPTION_WARNING`, `assumptionHedge`, `descriptionTree`, `asGrid`, `dropPlan`, `isAssumptionPart`, `keywordProblem`, `moveInPlan`, `moveOutPlan`, `nextOrder`, `partBody`, `partKeyword`, `partOrder`, `previewPaste`, `reorderPlan`, `stepPlan`, `suggestKeyword`, `tagTaken`, `DescriptionNode`, `OrderChange`, `PastePart`); `planSourceEqual`, `readLineSources`, `rowServedFact`, `sameServedList`, `sourceWithStatedBy`, `writeLineSource`, `PlanSourceValue` from `plan-card-facts`; `BaseRecord`, `GridRecord` from `base-record`. Each was compared with the source's own, comments stripped (a script reads both and prints the same declaration): all are the same, except `isTypeName`, which is the `type-key` unit's (the source's compares with the app's type registry; `type-key` has the same result when the registry knows no type, and a host with a registry calls `setTypeKey`).
  2. `@tanstack/react-query` is gone: `useQueryClient()` is not called (the query client stays in the host), and each `qc.*` call, query key and cache helper is a host member (see above). `reReadLevels` takes the host where it took the query client; `planPartialWrite` and `removalPlan` take the host (which contains the level members) where they took it. `planFindKey` and `planRecordKey` are not in the unit: the host forms its own keys from the arguments.
  3. Each host call is made with the same arguments, in the same place and order as the source's call, but for what the key did: `qc.getQueryData(planFindKey(planVault, "a:partOf", id))` is `host.getFind(planVault, "a:partOf", id)` (the `const own = planFindKey(...)` line is gone); `qc.setQueryData(planFindKey(...), v)` is `host.setFind(planVault, "a:partOf", id, v)`; `qc.getQueriesData({ queryKey: ["plan-find", planVault] })` iterated as `[, data]` is `host.getFinds(planVault)` iterated as `data`; `qc.setQueryData(planRecordKey(id, uri), row)` is `host.setRecordRead(id, uri, row)`; the `qc.getQueryData(recordsKey(id))?.pages.flatMap(...) ?? []` expression is `host.cachedRecords(id)`; `useDeleteRecord(vaultId)` is `host.useDeleteRecord?.(vaultId)` and `del.mutateAsync` is `del!.mutateAsync`; the writers are called with a `!` after the member; `e instanceof RecordConflictError` is `host.isConflict(e)` (three places in `patchPart` and the two source and text handlers); `<HelpButton>` is `<host.HelpButton>`.
  4. The view reads `host` from the new `DescriptionPartsHostContext` (`useDescriptionPartsHost`, private) first; with no provider it throws.
  5. One added line, before `useCardMode()`: `if (!(host.createRecord && host.patchRecord && host.useDeleteRecord)) canEdit = false;`. That is the read-only behaviour: the same as `canEdit` false.
  6. Kept inside, as in the source: the write queue (`run` on `tail`), `syncTree`, the move and removal plans, the focus-after-move effect, the document `mousedown` and Escape effects, `focusTagInput`, `onBindAdd` called on every render, `selfRef` (the latest person on every render). The comments are the source's.
- `src/components/records/usePlanParts.ts` lines 1-208 (the whole file) to `src/usePlanParts.ts`; the exports are the source's (`usePlanParts`, `PlanFindLimitNote`, `PARTIAL_LEVEL`, `FindRead`). Named changes: imports as above (`isValueCardType` from `plan-kinds`; `asGrid`, `descriptionTree`, `isPartType`, `DescriptionNode` from `description-parts-model`; `planVaultOf` and the find helpers from private copies); `useQueryClient()` is not called; `useRecords(planVault)` is `host.useRecords(planVault)`; `usePlanFind(...)` is `host.usePlanFind(...)`; the `useQueries({ ... })` block is `host.useSubFinds(planVault, "a:partOf", parents)`; `host` is read from the context first.
- `src/lib/base/planFind.ts` lines 15-45 to `src/planFind.ts` (private): `PLAN_FIND_CAP`, `PLAN_FIND_CAP_PART_OF`, `planFindCapFor`, `PlanFind`, `planFindRows`, `planCapSentence`, `planUnreadSentence`. Code verbatim.
- `src/lib/base/planVault.ts` lines 6-10 (`planVaultOf`) and `src/lib/base/picture.ts` lines 72-76 (`vaultIdOfEntity`) to `src/planVault.ts` (private). Code verbatim.
- `src/lib/base/heldTypes.ts` lines 106-111 and 115-151 (`MAX_PARALLEL_DEREFERENCES`, `mapWithConcurrency`) to `src/mapWithConcurrency.ts` (private). Code verbatim, comments made generic. (`description-parts-model` has the same two internally but does not export them.)
- `src/lib/base/planRowCache.ts` lines 17-70 (`PlanRowPatch`, `editorString`, `applyPatch`) and 141-142 (`WRITE_CONFLICT`) to `src/planRowCache.ts` (private); `isFactStringFaithful` is the `fact-faithful` unit's (the same). Code verbatim.
- `src/lib/base/records.ts` lines 427-433 and 447-452 (`WriteSource`, `writeSource`), 942-948 (`MergePatchValue`) to `src/writeSource.ts` (private, the types exported), and 215-221 and 234 (`RecordFactValue`, `RecordCreateFacts`) to `src/recordFacts.ts` (private, the types exported). Code verbatim.
- `src/host.ts`, `src/index.ts` are new.

Tests:

| Source | Ported / left out |
|---|---|
| There is no test of `PlanDescriptionParts.tsx` or `usePlanParts.ts` alone in GilbApp. | New, in `src/`: `read.test.tsx` (the tree, the attributes, read-only, the context, `onBindAdd`, the levels read in part, the caps, the help buttons), `add.test.tsx` (add, sub-part, assumption, source of a new part, leaving the add row), `edit.test.tsx` (text and source, conflicts, the one queue), `paste.test.tsx`, `move.test.tsx` (arrows, keyboard, in and out, drag by keys, levels read in part), `remove.test.tsx`, `helpers.test.ts` (the private copies and `PlanFindLimitNote`), `exports.test.ts`, `hostAgnostic.test.ts` (runs the host-agnostic check against planted faults). They run the view with a fake host (an in-memory vault, the app's lists and finds, a log of every call in order, counters for re-reads, prepends and drops, and holds that keep a write open, in `test/fakeHost.tsx`) and `CardModeProvider`. |
| `src/components/records/RecordDetail.planSolutionParts.vaultit.test.tsx` (31), `RecordDetail.planQaTester3.vaultit.test.tsx` (23), `RecordDetail.planReReadTouched.vaultit.test.tsx` (22), `RecordDetail.planQaTester.vaultit.test.tsx` (21), `RecordDetail.planQaTester2.vaultit.test.tsx` (16), `RecordDetail.planPartsDrag.vaultit.test.tsx` (15), `RecordDetail.planQaTester5.vaultit.test.tsx` (15), `RecordDetail.planSourceDefaults.vaultit.test.tsx` (15), `RecordDetail.planTagVault.vaultit.test.tsx` (12), `RecordDetail.planFunctionParts.vaultit.test.tsx` (12), `RecordDetail.planQaTester4.vaultit.test.tsx` (11), `RecordDetail.planFindReads.vaultit.test.tsx` (9), `RecordDetail.planMoveRemove.vaultit.test.tsx` (7), `RecordDetail.planVault.vaultit.test.tsx` (6), `RecordDetail.planOpenInFlight.vaultit.test.tsx` (5), `RecordDetail.planFindFresh.vaultit.test.tsx` (5) | Left out: they render the whole record card against a stubbed network and a query client, and several count network reads. Their Description cases are covered here against the fake host. |
| `src/components/help/DescriptionHelp.test.tsx` | Ported to the `description-help` unit. |
