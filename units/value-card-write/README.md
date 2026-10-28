# value-card-write

The Value card's write layer: its levels, Scale qualifiers and their option definitions, Meters and Meter lines, and the Scale record kept as lists, where one edit becomes the smallest writes (one changed item is one PATCH of its record, a new item one POST, a removed item one DELETE), with conflict handling, rollback and the migration of older stored lists, and every network call and cache supplied by the host.

## What this is

The Value card's write layer: its levels, Scale qualifiers and their option definitions, Meters and Meter lines, and the Scale record kept as lists, where one edit becomes the smallest writes (one changed item is one PATCH of its record, a new item one POST, a removed item one DELETE), with conflict handling, rollback and the migration of older stored lists, and every network call and cache supplied by the host.

Five hooks and the functions under them. The Value card (and the Development Resource card, which is the same card) keeps each kind of child as its own record, a part of the Value (`a:partOf`). The card edits a whole list; these hooks turn the edit into records.

- `useValueLevels({ enabled, record, vaultId, planVault, rows, variableOrder, onNotice, onTouched? })`: the levels. Gives `{ items, commit, commitAndWait, moveIn, busy, progress }`. `items` are the levels read from the Value's `rows` (its find by `a:partOf`, all part types) until a write is queued, then the person's latest edit. `commit(next)` writes the difference between the shown list and `next`. `commitAndWait(next)` does the same and answers `false` when a write of that commit failed and was rolled back, `true` otherwise. `moveIn(old)` makes records for old items (a move) and gives back `{ undo }`. `busy` is true while an edit is shown that the records do not yet hold. `progress` is `{ done, total }` while a group of patches runs, else `null`.
- `useValueQualifiers({ enabled, record, vaultId, planVault, rows, onNotice, onTouched? })`: the Scale variables (qualifiers). A variable is a `t:ScaleQualifier` record whose options are name strings; an option that has a definition is its own `t:ScaleQualifierDefinition` record, a part of the variable. The hook asks the host for one find for each variable that has options, and merges those rows into `rows`. Gives `{ items, commit, commitAndWait, moveIn, busy, progress }`.
- `useValueMeters({ enabled, record, vaultId, planVault, rows, onNotice, onTouched? })`: the Meters and their lines. A Meter is a `t:Meter` record, a part of the Value; a line is a `t:MeterLine` record, a part of its Meter. Each Meter's lines are found by that Meter's own find. Gives `{ items, commit, moveIn, busy, lineRows }` (`lineRows` are the line records read).
- `useValueScale({ enabled, record, vaultId, planVault, onNotice, onTouched? })`: the Scale. Gives `{ save(scale, linkValue, sentenceOf?) }`. The Scale is one `t:Scale` record, a part of the Value, and the Value points at it (`a:hasScale`). `save` patches the Scale record, or makes it and calls `linkValue(uri)` (which patches the Value and says whether it landed), or repairs a dangling reference, or adopts an orphan Scale record; if the link fails the new record is ended again. On a Development Resource (`t:Resource`) a Scale defaults to the direction "lower".
- `useChildList(...)`: the hook under levels and qualifiers, for a kind of child of your own (`kind: ChildKind<T>`: its type, tag, create facts and patch). Meters do not use it.
- The functions the hooks call, which you can call with a `ChildEnv` (`{ host, planVault, del, recs, touched?, notice? }`): `createChild`, `patchChild`, `endChild`, `endRow`, `endMade`, `migrateChild`, `findRowsOf`, `rowFor`, `rowLabel`, `httpStatus`; and the two classes `ChildConflict` and `MoveStopped`.

What one edit writes:

- A new item is one POST. The tag is built from the Value's tag and the item (`Speed.Goal.2027-06-30`); a tag another record holds answers 409 and the next one is tried (`.2`, `.3`, up to 50). The order is `createRecord`, then `readRecord(newId, planVault)` (null when it cannot be read), then `rememberRecord`, `markFreshlyCreated`, `storePlanRow(insert)`, `invalidatePlanSearch`, `prependPlanFind`. The new record's `a:elementOrder` is one past the highest known; when the find stopped at its cap it is the find's total plus one.
- A changed item is one PATCH of its record with only the facts that differ, conditional on the version (`If-Match`). A tag that no longer matches (the item was renamed) is part of the same patch. A record with no version is read first; a different copy of a field the write touches is a conflict.
- A removed item is one DELETE, then it is dropped from the find with no re-read, and the card is told (`onTouched`: the Version moves). An item that has records of its own (a qualifier's option definitions, a Meter's lines) ends those first.
- A change of kind (a level's kind is its record type) makes the new record first and ends the old one.
- Several patches from one edit (a qualifier moved on a whole row) are one group, written in order; if one fails the later ones are not sent and the ones written are patched back. The notice says which moved and which did not.
- All writes of one list run one after the other, in a queue per list. The list shows the person's edit at once and snaps back to the records when the queue is empty.
- A record of an older shape (a qualifier typed `t:ScaleQualifierDefinition`, a Scale held inline in the Value) is read as it is. Its next edit makes the new record, then ends the old one with the version just read; a 404 or a 412 on that end is not success, the new record is ended again and the card says someone else changed it; a record of the new shape that someone else already made is adopted.

## What this is not

- Not a reader or a card. It draws nothing. The Value's lines, the graph (`value-graph`) and the rest of the card read the same records through `value-card-model` and call these hooks.
- Not a store. It never fetches, caches or deletes on its own: every network call and cache is a member of the host (`ValueWriteHost`), called with the arguments the source gave it.
- Not for a read-only host. This unit is a writer, with no "optional writer": a host that cannot write does not take it, and the Value lines show without it.
- Not the shapes of the records. `value-card-model` builds the facts and the patches and reads the records; this unit decides when to write them.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-card-write`

Take it together with its peers `value-card-model`, `plan-card-facts`, `plan-links-model`, `plan-kinds`, `base-record`, `description-parts-model` (for `asGrid`) and `fact-faithful`, and their own peers (`type-key`, `type-curie`, `id-tail`, `entity-ref`, `relation-role`, `qualifier-values` and `term-origin`). `value-card-model` must be `^0.2.0`. Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/type-key <path-to-the-library>/units/type-curie <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref <path-to-the-library>/units/relation-role <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/term-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/fact-faithful <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/value-card-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/value-card-write
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. No query library is imported by the unit; the host brings its own.

`MoveStopped` and `ChildConflict` are classes the card checks with `instanceof`. Keep one installed copy of this unit: a second copy has its own classes, and a check against the other copy's fails.

## Examples

```tsx
import {
  ValueWriteHostContext,
  useValueLevels, useValueMeters, useValueQualifiers, useValueScale,
  ChildConflict, MoveStopped,
} from "@kaigilb/gilbplatformcode-value-card-write";
import type { ValueWriteHost } from "@kaigilb/gilbplatformcode-value-card-write";

// Once, above the card, and the same object while it is mounted. Every member is yours; "What the host must supply" says what each does.
const host: ValueWriteHost = {
  createRecord, readRecord, patchRecord, useDeleteRecord, isConflict, isForbidden,
  cachedPlanFind, fetchPlanFind, usePlanFinds, prependPlanFind, dropPlanFind, patchPlanFindRows, invalidatePlanFind,
  liveRow, ensureEtagUnchanged, reconcileAfterConflict, storePlanRow, setPlanRecord, invalidatePlanSearch,
  rememberRecord, markFreshlyCreated, typeUriForVaultNamespace,
};

function ValueLines({ record, vaultId, planVault, rows, onNotice, onTouched }) {
  // `rows`: the Value's find by `a:partOf`, from your own find hook. It must keep its identity while the find does not change.
  const common = { enabled: true, record, vaultId, planVault, rows, onNotice, onTouched };
  const qualifiers = useValueQualifiers(common);
  const meters = useValueMeters(common);
  const scale = useValueScale({ enabled: true, record, vaultId, planVault, onNotice, onTouched });
  const levels = useValueLevels({ ...common, variableOrder: qualifiers.items.map((v) => v.name) });

  // The card hands a list, the hooks write the difference:
  //   levels.commit([...levels.items, newLevel])          one POST
  //   levels.commit(levels.items.map(...changed one...))  one PATCH
  //   levels.commit(levels.items.slice(1))                one DELETE
  //   await scale.save(next, (uri) => patchValueHasScale(uri))   resolves when written, throws a sentence when not
  return null;
}

<ValueWriteHostContext.Provider value={host}>
  <ValueLines record={record} vaultId={vaultId} planVault={planVault} rows={rows} onNotice={setNotice} onTouched={bumpVersion} />
</ValueWriteHostContext.Provider>;

// A thrown error in a move: `instanceof MoveStopped` (its `undo()` removes what was made) or `instanceof ChildConflict`
// (the find was already read again for that record; do not read it again).
```

The edit helpers come from `value-card-model` (`carryRaw`, `setLevelKey`, `levelKey`): an edit that spreads an item must carry its record key with `carryRaw(next, prev)`, or the hook takes it for a new item.

## What the host must supply

The `ValueWriteHostContext` provider with an object of these members. Without the provider every hook throws a sentence that names it. File and line are those of GilbApp, commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, `src/components/records/` (`valueChildRecords.ts`, `useValueChildren.ts`, `useValueMeters.ts`, `useValueQualifiers.ts`, `useValueScale.ts`) unless another file is named. A member named `use...` is a hook: the unit calls it on every render, unconditionally, in the place where the source called its hook.

Network:

- `createRecord(vaultNamespace, typeUri, facts, nameHint?)`: make a record; `{ id, etag }`. A 409 means the tag is taken. Replaces `createRecord(planVault, typeUri, facts, tag)` (valueChildRecords.ts:131).
- `readRecord(id, at)`: read a record; `null` when it is not there. The unit passes the plan vault id in the `at` place in one call, on purpose: accept it. Replaces `readRecord(made.id, planVault)` (valueChildRecords.ts:137), `readRecord(oldRow.id, oldRow.entityUri ?? null)` (:332), `readRecord(<tail of the reference>, <reference>)` (useValueScale.ts:90).
- `patchRecord(id, patch, at, source, precondition)`: a JSON merge patch conditional on `precondition.ifMatch`; `source` is `undefined` when the record carries no served document. A failure keeps its numeric `status`. Replaces `patchRecord(...)` (valueChildRecords.ts:214-215).
- `useDeleteRecord(vaultId)`: a hook; `{ mutateAsync({ id, entityUri, ifMatch? }) }` ends a record. Replaces `useDeleteRecord(vaultId)` (useValueChildren.ts:46, useValueMeters.ts:46, useValueScale.ts:68, from lib/base/recordHooks.ts:2634). What GilbApp's hook does, and the host's must do: it installs the app's delete watcher (`watchRecordDeletes(qc)`) when it is called, on every call, before any delete runs; it is a mutation whose function deletes with `deleteRecord(id, entityUri ?? vaultId ?? null, { ifMatch })` when `ifMatch` is given and `deleteRecord(id, entityUri ?? vaultId ?? null)` (no third argument) when not, then forgets the record's page link and its working-set entry; before the delete it removes the record from the vault's list at once (optimistic removal, remembering the row and its index), and if the delete fails it puts that row back at its index (it does not re-stamp it), and on success it invalidates the vault's ended list. The unit relies on the failure reaching its caller (`mutateAsync` rejects) and on a 404 or a conflict keeping its `status`/class.

Error predicates:

- `isConflict(e)`: true for exactly the "someone else changed it first" failure of a conditional write (the 412 class). Replaces `e instanceof RecordConflictError` (valueChildRecords.ts:220-221, :387, useValueScale.ts:153).
- `isForbidden(e)`: true for the "not allowed" failure. Replaces `e instanceof RecordForbiddenError` (useValueScale.ts:153).

Find caches (the finds by `a:partOf`; `PlanFind` is `{ rows, total, capped, unread, cap? }`):

- `cachedPlanFind(planVault, attr, parentId)`: the find the host holds now, or `undefined`. Called at click time, never snapshotted. Replaces `qc.getQueryData<PlanFind>(planFindKey(...))` (valueChildRecords.ts:102, :123; useValueMeters.ts:135; useValueQualifiers.ts:52; useValueScale.ts:75).
- `fetchPlanFind(planVault, attr, parentId, parentUri, { staleTime })`: read the find unless the cached one is younger than `staleTime` ms (0: always read) and give it back; it fails when the find cannot be read. GilbApp's call is `qc.fetchQuery({ queryKey: planFindKey(planVault, "a:partOf", parentId), queryFn: () => loadPlanFind(qc, planVault, "a:partOf", parentId, parentUri), staleTime })`, with `staleTime: 0` at valueChildRecords.ts:343-347 (migration: the twin lookup must see the vault now) and `staleTime: 15_000` at useValueQualifiers.ts:53 (the option-definition find, read only when the cached one is missing). No `retry` is set on this call. Replaces those two calls, from lib/base/planFind.ts:213.
- `usePlanFinds(planVault, attr, parents)`: a hook; `parents` is `[{ id, entityUri, enabled }]`; returns one `{ data }` for each parent, in the order of `parents`. Replaces the `useQueries` of useValueMeters.ts:52-60 (the lines of each Meter) and useValueQualifiers.ts:121-129 (the option definitions of each variable). What GilbApp passed, for each parent, exactly:
  - `queryKey`: the plan-find key for (`planVault`, `"a:partOf"`, the parent's id), as the app's `planFindKey` builds it (`["plan-find", vault, attr, id]`);
  - `queryFn`: `loadPlanFind(qc, planVault, "a:partOf", parent.id, parent.entityUri ?? "")`;
  - `enabled`: as passed per parent (the unit computes it: `!!planVault && !!meter.entityUri` for a Meter, `!!planVault` for a variable);
  - `staleTime: 15_000`;
  - `retry: false`.
  - `data` must keep its identity from one render to the next while the find has not changed (see the stability rule below).

  The reference implementation, with the query library the app uses:

  ```tsx
  const usePlanFinds: ValueWriteHost["usePlanFinds"] = (planVault, attr, parents) => {
    const qc = useQueryClient();
    return useQueries({
      queries: parents.map((p) => ({
        queryKey: planFindKey(planVault, attr, p.id),
        enabled: p.enabled,
        retry: false,
        staleTime: 15_000,
        queryFn: () => loadPlanFind(qc, planVault, attr, p.id, p.entityUri ?? ""),
      })),
    });
  };
  ```
- `prependPlanFind(planVault, attr, parentId, row, { members, refresh })`: show the row at the head at once and pin it, so a re-read that is late does not drop it. The unit always passes `refresh: false`. Replaces `prependPlanFind(...)` (valueChildRecords.ts:160).
- `dropPlanFind(planVault, attr, parentId, id, { members, refresh })`: take the row out at once and remember it as dropped, so a re-read that still returns it does not bring it back. The unit passes `refresh: false`. Replaces `dropPlanFind(...)` (valueChildRecords.ts:248, :256, :271).
- `patchPlanFindRows(planVault, id, next)`: show a patch of one record on every find that holds it, and in the pinned rows. Replaces `patchPlanFindRows(...)` (valueChildRecords.ts:223, :237).
- `invalidatePlanFind(planVault, attr, parentId, { members }?)`: read the find again; `members` are the addresses of the records that could have changed (marked stale before the find is read), `"all"` (default) or `[]`. Returns a promise. Replaces `invalidatePlanFind(...)` (valueChildRecords.ts:192, :319; useValueChildren.ts:93, :153; useValueMeters.ts:122).

Row cache:

- `liveRow(planVault, id, fallback)`: the newest of the list's row, the record's own read and `fallback`, as a list row. Replaces `liveRow(...)` (valueChildRecords.ts:182).
- `ensureEtagUnchanged(planVault, row, sameFor)`: with a version on the row, `{ row }` with no read; without, read it and answer `{ row }`, `{ conflict: true }` (the fresh copy differs in a field the write touches) or `{ unreadable: true }`. Replaces `ensureEtagUnchanged(...)` (valueChildRecords.ts:186).
- `reconcileAfterConflict(planVault, row)`: read the record, put it in the lists and the record read, give it back (`null` when gone); fails when it cannot be read. Replaces `reconcileAfterConflict(...)` (valueChildRecords.ts:222; useValueScale.ts:160).
- `storePlanRow(planVault, row, { insert }?)`: replace the row in every list that holds it; `insert` adds it to the plan vault's list. Replaces `storePlanRow(...)` (valueChildRecords.ts:158, :235).
- `setPlanRecord(id, at, row)`: put a saved row in the cache of the record read. Replaces `qc.setQueryData(planRecordKey(id, at), row)` (valueChildRecords.ts:236).
- `invalidatePlanSearch(planVault)`: drop the pickers' finished searches in the vault. Replaces `invalidatePlanSearch(...)` (valueChildRecords.ts:159).

Record bookkeeping:

- `rememberRecord({ id, vaultId, typeUri, updatedAt })`: remember a record made in this session; awaited. Replaces `rememberRecord(...)` (valueChildRecords.ts:139).
- `markFreshlyCreated(id)`: mark the id as just made. Replaces `markFreshlyCreated(...)` (valueChildRecords.ts:140).

Type registry:

- `typeUriForVaultNamespace(typeName, vaultNamespace)`: the type address a record of this type name is made under. Replaces `typeUriForVaultNamespace(...)` (valueChildRecords.ts:119).

The order the unit calls them in, which a host may rely on (and must not disturb by reordering inside a member):

1. Creating a record: `typeUriForVaultNamespace`, then for each try `createRecord`; on success `readRecord` (its failure is swallowed to null), `await rememberRecord`, `markFreshlyCreated`, `storePlanRow` with `insert`, `invalidatePlanSearch`, `prependPlanFind`. These are separate members, in this order, so the new record is in the lists before the search is dropped and pinned in the find last.
2. Patching a record: `liveRow`, `ensureEtagUnchanged`, `patchRecord`; on success `storePlanRow`, `setPlanRecord`, `patchPlanFindRows`; on a conflict `reconcileAfterConflict`, `patchPlanFindRows`, the notice, then `invalidatePlanFind` for that record only.
3. Ending a record: `useDeleteRecord`'s `mutateAsync`, then `dropPlanFind`, then `onTouched`. A failed delete drops nothing.
4. A conflict says its sentence (`onNotice`) before the find is read again, and the find is read once, for that record only. `invalidatePlanFind` marks the named members stale and leaves the others on their cached row.

The stability rule: the `data` that `usePlanFinds` gives for a parent must keep its identity from one render to the next while the find has not changed. The Meters and the qualifiers keep their last list when every find's `data` is the one they saw last; a host that builds a new object on every render makes the lists thrash, with a new list (and a new `lineRows`) on every render.

Also from the app: the card gives `rows` (the Value's find) with a stable identity while it does not change; the hooks compare it to the last `rows` they saw.

## Do not

- Do not install a second copy of this unit: `MoveStopped` and `ChildConflict` are checked with `instanceof`, and a second copy has its own classes. The same goes for `value-card-model`, whose record keys and key aliases are kept in the module.
- Do not merge the create members into one: `rememberRecord` is awaited between the read and the cache writes, and the cache writes are four calls in the order above.
- Do not return a new find object from `usePlanFinds` on every render.
- Do not snapshot `cachedPlanFind` or `liveRow` at render: they are read when the person acts.
- Do not make `isConflict` true for a 409. A 409 without the conflict class means the tag is taken.
- Do not give `prependPlanFind` or `dropPlanFind` a re-read of their own: the unit passes `refresh: false` and re-reads, when it must, with `invalidatePlanFind` and the members it names.
- Do not use this unit on a host that cannot write.

## Wrong readings

- "A duplicate tag is a conflict and is shown to the person." A 409 from `createRecord` or `patchRecord` without the conflict class (`isConflict` false) means the tag is taken: the unit tries the next suffix (`.2`, `.3`, ... up to 50) and shows nothing. Only the conflict class (a stale `If-Match`, 412) is shown as "changed elsewhere". If `isConflict` is true for a 409, a taken tag is shown as a conflict and is not retried.
- "A host that returns a fresh find object on every render is only slower." The Meters and the qualifiers keep their last list only while each find's `data` is the same object; a new object every render makes `items` and `lineRows` new every render, so the card re-renders its lists without end.
- "`MoveStopped` and `ChildConflict` can come from anywhere." The card checks them with `instanceof`; they must come from the one installed copy of this unit.
- "A failed delete leaves the find as it was." A failed `mutateAsync` drops nothing and does not tell the card. `endMade` answers `false` instead of throwing, so a rollback can go on and name what it could not end.
- "`readRecord(id, at)` always gets an address." After a create the unit reads the new record with the plan vault id in the `at` place; a host that reads `at` as an address must take a vault id there.
- "Ending a Meter ends the Meter." It ends every record that is a part of it first (found by the find, readable or not, and the lines the card knows), stops at the first that fails and says what remains. If the find says some records could not be read (`unread` above 0) nothing is deleted.
- "A Scale save is one write." It is one write only when the Scale record exists. A first Scale is two (the record, then the Value's link) with a rollback; the `linkValue` callback says whether the link landed. An answer with no status (the network dropped) does not say whether it did, so the Value is read again: if it points at the new record the save stands, if it cannot be read the record is kept and the sentence says so.
- "A Resource's Scale is 'higher' unless set." On a `t:Resource` card the default direction is "lower": a Scale with nothing but the direction "lower" writes nothing there, and writes a record on a Value.
- "A level of kind Goal is `t:Goal`." On a `t:Resource` card it is `t:Budget`.
- "The hooks need the query library." They do not import one. The host's `usePlanFinds` and `useDeleteRecord` are hooks of whatever the host uses.
- "A hook without the provider returns nothing." It throws a sentence that names `ValueWriteHostContext.Provider`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/valueChildRecords.ts` (394 lines, the whole file) to `src/valueChildRecords.ts`; `useValueChildren.ts` (292) to `src/useValueChildren.ts`; `useValueLevels.ts` (42) to `src/useValueLevels.ts`; `useValueMeters.ts` (259) to `src/useValueMeters.ts`; `useValueQualifiers.ts` (161) to `src/useValueQualifiers.ts`; `useValueScale.ts` (178) to `src/useValueScale.ts`. The exports are the source's. The code is copied by script and then changed only as listed. Named changes:
  1. Imports: `lib/base/planValue` and `lib/base/planValueModel` are `value-card-model`; `lib/base/planCard` (`rowServedFact`) is `plan-card-facts`; `lib/base/planLinks` (`recordTag`) is `plan-links-model`; `lib/base/planKinds` (`isResourceType`) is `plan-kinds`; `lib/base/planParts` (`asGrid`) is `description-parts-model` (compared with the source's: the same); `BaseRecord` and `GridRecord` are `base-record`. `applyPatch` is copied (see below).
  2. `@tanstack/react-query` is gone. `ChildEnv.qc: QueryClient` is `ChildEnv.host: ValueWriteHost`. Every call outside the unit that is not a merged unit is a host member called with the same arguments, in the same place and order (the table in "What the host must supply"): `createRecord`, `readRecord`, `patchRecord`, the delete mutation (`useDeleteRecord`), `rememberRecord`, `markFreshlyCreated`, `loadPlanFind` through `fetchPlanFind`, `useQueries` through `usePlanFinds`, `qc.getQueryData(planFindKey(...))` through `cachedPlanFind`, `prependPlanFind`, `dropPlanFind`, `patchPlanFindRows`, `invalidatePlanFind`, `invalidatePlanSearch`, `liveRow`, `storePlanRow`, `ensureEtagUnchanged`, `reconcileAfterConflict`, `qc.setQueryData(planRecordKey(...))` through `setPlanRecord`, and `typeUriForVaultNamespace`.
  3. `e instanceof RecordConflictError` and `e instanceof RecordForbiddenError` are `host.isConflict(e)` and `host.isForbidden(e)`. `httpStatus` (the duck-typed numeric `status`) is the source's.
  4. `useQueryClient()` is `useValueWriteHost()` (reads `ValueWriteHostContext`, throws a sentence that names the provider when there is none); `useDeleteRecord(vaultId)` is `host.useDeleteRecord(vaultId)`. The `qc` entry of `useChildList`'s kept context is `host`.
  5. In `useValueQualifiers.definitionRows` the lines `const key = planFindKey(...)` and the `qc.getQueryData(key)` / `qc.fetchQuery(...)` pair are `host.cachedPlanFind(...)` and `host.fetchPlanFind(..., { staleTime: 15_000 })`; the key is formed by the host.
  6. Comments lose the names, batch tags, QA ids and round tags of the source; they keep their meaning. Nothing else in the six files is changed.
- `src/lib/base/planFind.ts` lines 26-37 (`PlanFind`, `planFindRows`) to `src/planFind.ts`. Verbatim.
- `src/lib/base/planRowCache.ts` lines 17-70 (`PlanRowPatch`, `editorString`, `applyPatch`) to `src/applyPatch.ts`; `isFactStringFaithful` is the `fact-faithful` unit (compared with the source's: the same). Verbatim.
- `src/lib/base/records.ts` lines 427-433 (`WriteSource`), 447-452 (`writeSource`), 942-948 (`MergePatchValue`), 215-220 (`RecordFactValue`) and 234 (`RecordCreateFacts`) to `src/writeSource.ts`. Verbatim; the first three are the same copy as in `plan-stakeholder-lines`.
- `src/host.ts` (`ValueWriteHost`, `ValueWriteHostContext`, `useValueWriteHost`) and `src/index.ts` are new.

Tests:

| Source | Ported / left out |
|---|---|
| `useValueShapes.v37.test.tsx` (19) | Ported: `src/useValueShapes.test.tsx` (19). |
| `useValueShapes.v38.test.tsx` (16 `it`, 17 run: one is run for 404 and for 412) | Ported: `src/useValueSafety.test.tsx` (17). |
| `useValueChildren.v30.test.tsx` (4) | Ported: `src/useValueChildren.test.tsx` (4). |
| `useValueChildren.qa3.v30.test.tsx` (5) | Ported: `src/useValueChildrenTwoPeople.test.tsx` (5). |
| `PlanValueGraph.writePath.v27.test.tsx` (8) | Ported: `src/writePath.test.tsx` (8); the last one drives the `value-graph` unit on top of the hook. |
| `PlanValueGraph.endpointAndQualifierEdit.v29.test.tsx`, "the write chain" (4) | Ported: `src/writeChain.test.tsx` (4). The other 19 cases of that file are in the `value-graph` unit. |
| `PlanValueGraph.newMenu.v28.test.tsx`, "tag collision gives .2" (1) | Ported: `src/writeChain.test.tsx` (1). |
| `scale3.server.v30.test.tsx` (5), `scale3.graph.v30.test.tsx` (8) | Left out: they are scaling measurements (timings, request counts and bytes against a fake vault with latency, `scale3.server.ts`, with thousands of levels and the whole graph). `scale3.dates.v30.test.ts` (6) tests date ticks of the geometry (the `value-graph-geometry` unit). |
| The other `PlanValueGraph.*` tests, the `RecordDetail.*` suites | Left out: they test the graph (the `value-graph` unit) or the whole card. |

The ported tests ran against the app's real find cache, record cache and query client on an in-memory server (If-Match, 409 on a duplicate tag). Here the same server is `test/server.ts` and the same stack is rebuilt in `test/fakeHost.tsx` on a real query client: the pins and drops of a find, the members a re-read reads fresh, the newest-wins row cache, the record read; the finds are read from the in-memory vault. Each ported test keeps its inputs and expected results, including request counts and orders where it asserted them; the harness lines changed (the mocks of the app's modules are the fake host), and the host names of the fixtures are example hosts. The new tests: `src/valueChildRecords.test.ts` (the functions, with a toy kind), `src/useValueLevels.test.tsx`, `src/useValueMeters.test.tsx`, `src/useValueQualifiers.test.tsx`, `src/useValueScale.test.tsx` (including the Development Resource cases), `src/useChildList.test.tsx`, `src/fakeHost.test.tsx` (the fake host against the rules of the app's find and row caches), `src/helpers.test.ts`, `src/exports.test.ts`, and `src/hostAgnostic.test.ts` (the host-agnostic check against planted faults).
