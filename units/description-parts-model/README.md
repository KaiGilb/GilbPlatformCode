# description-parts-model

Reads and plans the Description of a Solution or Solution Constraint, which is one record per Keyword part: it parses Keyword lines and Assumptions, builds the tree, orders and moves parts, previews a paste, and plans the move or the removal of a whole level, with the host supplying every read.

## What this is

Reads and plans the Description of a Solution or Solution Constraint, which is one record per Keyword part: it parses Keyword lines and Assumptions, builds the tree, orders and moves parts, previews a paste, and plans the move or the removal of a whole level, with the host supplying every read.

A Description is a tree of records, each with a Keyword. A Solution `Walk` has parts `Walk.Run` and `Walk.Step`; `Walk.Step` has the sub-part `Walk.Step.Lift`. A part is a `t:SpecificationElement`, or a `t:Assumption`; it names the part (or the Solution) it belongs to in `a:partOf`, and its place among its siblings in `a:elementOrder`. The words of the part are `a:body`, and who stated them are `a:lineSources`. Assumptions sit under one section: the tag `Walk.Assumption`, and `Walk.Assumption.Floor` is one assumption. Pure functions over those stored shapes, plus three functions that read and plan through a `LevelHost` that the host implements: no React, no network, no cache of its own.

From `planParts` (all pure):

- Constants (the sentences, verbatim): `KEYWORD_MESSAGE`, `ASSUMPTION_WARNING`, `ASSUMPTION_KEPT`, `ASSUMPTION_ELEMENT`, `PARENT_NOT_A_PART`.
- `asGrid(row)`: a list row. A record with a numeric `updatedAt` is returned as it is (the same object); any other gets a copy with `updatedAt` set to `Date.now()`. It reads the clock.
- Keywords: `keywordProblem(raw, { topLevel? })` (null when the trimmed word is letters only and starts with a capital; `topLevel` also refuses `Assumption` in any case with `ASSUMPTION_KEPT`), `suggestKeyword(text)` (the first word, letters only, first letter a capital, the rest as typed), `assumptionHedge(text)` (true when the words `may`, `might`, `could` or `expected to` are there), `partKeyword(tag)` (the last piece of a dotted tag).
- A part's served fields: `partBody(row)`, `partOrder(row)`, `partLineSources(row)`. `partOrder` is `NaN` when `a:elementOrder` is missing, blank (`""`), or not a number; a numeric string goes through `Number()`, so `"0,001"` is `NaN` and `0` is `0`. `PartRow` is the row type.
- Order and tags: `nextOrder(orders)` (one past the largest finite order, never below 1), `tagTaken(pool, tag)`, `duplicatePartTag(tag)` (the duplicate-tag sentence of `plan-links-model`), `comparePartTie(tagA, idA, tagB, idB)`, `effectiveOrder(list, index)` (a node's own finite order, else its place counted from 1), `isAssumptionPart(row)`, `isPartType(typeUri)`.
- The tree: `descriptionTree(solution, pool)` gives the parts at any depth as `DescriptionNode` (`row`, `tag`, `keyword`, `order`, `children`), siblings ordered by element order (none last), then tag, then id; a part is read once.
- The plans for moving one part, each giving an `order` for the part and `OrderChange`s for the others, listing only what changes: `stepPlan` (one place up or down), `closeGap`, `moveInPlan` ("in": last child of the sibling above), `moveOutPlan` ("out": directly after its parent), `reorderPlan` (a drop within a level), `dropPlan` (a drop on another level).
- `previewPaste(text, solutionTag, taken, lawfulParentTags?)`: the paste template as `PastePreview` (`parts` as `PastePart`, and `bad` lines with a reason when there is one). Blank lines are skipped. `Keyword: text` is a top part. A leading `- ` (or an en dash) per level, plus one level for each two spaces or a tab of indent, makes a sub-part of the last line one level up. A trailing ` <- Source` is the part's text source. `Assumption:` alone opens the assumption section; `Assumption: Keyword: text` is one assumption. A line that is not a Keyword part is `bad`; a reason is given when the word before the colon has a digit or other non-letter. `taken(tag)` says a tag is used already (the part is `skipped`). With `lawfulParentTags` (this card's part tags), a line whose parent was not made and is not one of them is `skipped` with `PARENT_NOT_A_PART`.

From `planLevelRead`:

- Constants: `ORDER_CAP` (1000), `ORDER_TOO_MANY`, `ORDER_UNREAD`, `REMOVAL_MAX_DEPTH` (12), `REMOVAL_MAX_PARTS` (300), `REMOVAL_TOO_DEEP`, `REMOVAL_TOO_MANY`, `SUBPART_UNREAD`.
- Pure planners over `StoredPart` (`{ id, order, tag? }`): `planStep(stored, movedId, dir, shown?)` (a clean pair of unique finite orders is swapped, and nothing else is written; otherwise the level is numbered 1..n and only the parts whose number changes are listed; `writes[0]` is always the moved part), `planFullLevelMove(stored, movedId, target, shown?)` (the same over a whole stored level, for a `LevelMove` of `step`, `index`, `remove`, `insert` or `new`), `indexBefore(stored, movedId, beforeId)`, `otherRecordsSentence(keyword, others)`.
- The reads and plans that go through the host: `readLevel(host, planVault, parentUri, { cap, fresh })` (every stored child of a parent as `LevelRead`, or a cap refusal with no record reads), `planPartialWrite(host, planVault, parentUri, movedId, target, lists, shown?)` (the move of one part on a level that is partly shown: read the level fresh, fill an unread row from a loaded list, number the move), `removalPlan(host, row, keyword, parentId, planVault, seen, depth?)` (the parts to remove with a part, one depth at a time: `pre` in preorder for the sentence, `post` with the deepest first, and `kept` for records of this vault that are not parts).

Wire vocabulary, verbatim from the code: the attributes `a:partOf` (a link `{ "@id": <address> }`), `a:elementOrder` (a number, or a numeric string), `a:body`, `a:lineSources` (members with `sourceOf` such as `a:body`, and `statedBy` or a source text), `a:unitTag` and `a:tag` (the part's tag, read in that order); the types `t:SpecificationElement` and `t:Assumption`; the Keyword `^[A-Z][a-zA-Z]*$`; a tag `<Solution tag>.<Keyword>[.<Keyword>...]`; the assumption section `<Solution tag>.Assumption` with `<Solution tag>.Assumption.<Keyword>`; the paste marks `- ` (also an en dash), ` <- ` and `Assumption:`.

## The host contract (`LevelHost`)

`readLevel`, `planPartialWrite` and `removalPlan` take a `host: LevelHost` where the app passed its query client. The unit calls it, in this order and no other:

- `pageChildIds(planVault, parentUri, { cap })`: the ids (as entity addresses) of the records whose `a:partOf` is `parentUri`, paged up to `cap`, as `{ ids, count, capped }`. `capped` is true only when the walk stopped at the cap and one more id exists; a level of exactly `cap` ids is not capped. The host works out its own vault origin from `planVault`. GilbApp: `pageAttributeIds("a:partOf", parentUri, vaultOriginOf(planVault), { cap, qc })`.
- `markStale(entityUri)`: mark one record's cached read stale WITHOUT refetching it, and settle when that is done. `readLevel` (with `fresh`) and `removalPlan` call it for every record of a page and wait for all of them before the first fresh read. It must not refetch: a refetch here would read the record twice. It must be done before `readMember(entityUri, true)`: a cache that keeps a row still inside its stale time would otherwise answer a fresh read with an old row. GilbApp: `qc.invalidateQueries({ queryKey: planRecordKey(idFromEntityUri(entityUri), entityUri), refetchType: "none" })`.
- `readMember(entityUri, fresh)`: read one record. `fresh` true means fetch (a row marked stale is read again); false means the cached row, whatever its age. `null` when it cannot be read; a throw is not caught by `readLevel` or `removalPlan` (`planPartialWrite` turns it into `ORDER_UNREAD`). The unit reads through one pool of `6` at a time (`MAX_PARALLEL_DEREFERENCES`). GilbApp: `readCached(qc, entityUri, fresh)`.
- `applyPinsAndDrops(planVault, attr, parentId, rows, serverIds)`: only `readLevel` calls it, once, after the reads: the host's pinned rows put in front of the fresh list, and its dropped rows left out. `attr` is always `a:partOf`; `parentId` is the tail of the parent's address; `rows` are the records read, with an empty placeholder row (`typeUri` `""`, no facts) for one that could not be read; `serverIds` are the ids the page returned. A host with no pins and no drops returns `rows`. GilbApp: `applyPinsAndDrops(qc, planVault, attr, parentId, rows, serverIds)`.

The calls of `readLevel` for a fresh read are, in order: `pageChildIds`; `markStale` for each id; `readMember(id, true)` for each id; `applyPinsAndDrops`. A cached read leaves out the `markStale` calls. `removalPlan` asks one depth at a time: `pageChildIds` for each part of the depth, then `markStale` for each new part, then `readMember(id, true)` for each; it never calls `applyPinsAndDrops`.

## What this is not

- Not the Description view. The cards, the buttons, the paste box and the notices are a later unit (`description-parts-view`).
- Not the drag tree. Dragging and dropping rows is `sortable-tree`; this unit only plans what a drop writes.
- Not a writer. Every plan is returned; sending the writes, creating and ending the records, is the host's.
- Not a query cache. Pins, drops, staleness and the pool of reads behind the host are the host's; the unit never fetches.
- Not the `map-limit` unit. The bounded fan-out inside (`mapWithConcurrency`) is the app's own copy and is not exported: on a throw it starts nothing new, waits for the running calls, and rethrows the first error, which `map-limit` does not do.

## How to take it

Package: `@kaigilb/gilbplatformcode-description-parts-model`

Take it together with its four peers: `plan-card-facts`, `plan-links-model`, `id-tail` and `base-record` (`plan-links-model` has `entity-ref`, `id-tail`, `plan-card-facts`, `relation-role`, `type-curie` and `type-key` as its own peers; install those too). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/id-tail <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/entity-ref <path-to-the-library>/units/relation-role <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import {
  descriptionTree,
  planFullLevelMove,
  planPartialWrite,
  previewPaste,
  removalPlan,
  stepPlan,
  type LevelHost,
} from "@kaigilb/gilbplatformcode-description-parts-model";

// The host's data layer, behind the unit's reads. A host with a query cache wires its cache here.
const host: LevelHost = {
  pageChildIds: (planVault, parentUri, { cap }) => findChildIds(planVault, parentUri, cap),
  markStale: (entityUri) => cache.markStale(entityUri), // no refetch; resolves when it is marked
  readMember: (entityUri, fresh) => (fresh ? cache.fetch(entityUri) : cache.get(entityUri)),
  applyPinsAndDrops: (planVault, attr, parentId, rows, serverIds) => cache.pinsAndDrops(planVault, attr, parentId, rows, serverIds),
};

// The Description of a Solution, from the records the host holds.
const tree = descriptionTree(solution, pool); // nodes with keyword, order, children

// Up and down buttons on a shown level.
const plan = stepPlan(siblings, index, -1); // { order, others } or null at the end

// A partly shown level: read it fresh, then plan the move over everything stored.
const move = await planPartialWrite(host, planVault, solution.entityUri, movedId, { kind: "step", dir: 1 }, [loadedRows], shownIds);
if (move && !move.ok) showNotice(move.notice);

// A paste, as the preview the person confirms.
const preview = previewPaste(text, solutionTag, (tag) => tagTaken(pool, tag), new Set(tagsOfThisCard));

// Removing a part removes the parts under it: ask first.
const gone = await removalPlan(host, row, keyword, parentId, planVault, new Set());
```

## What the host must supply

- The records as `BaseRecord` of the `base-record` unit (and `GridRecord` for a list row), and the part rows as `PartRow`: `id`, `entityUri?`, `typeUri`, `facts` (flat strings) and `served?.facts` (as served).
- A `LevelHost` (above) for `readLevel`, `planPartialWrite` and `removalPlan`. `readLevel` is also the reader to call before an order write that must see every part.
- If the app has its own type registry: one call to `setTypeKey` of the `type-key` unit at start-up. Without it, types compare by their lower-cased name.
- The writes. A plan is returned, never sent.

## Do not

- Do not make `markStale` refetch, and do not let it settle before the record is marked: a fresh `readMember` that follows it must read the stored record, not a cached one.
- Do not install a second copy of `type-key` or `plan-links-model`: the type function is module state, and two copies compare types differently.
- Do not call `planStep` with a list that is not in level order: it expects the list sorted (`planFullLevelMove` sorts it for you).
- Do not expect `removalPlan` to read more than 11 levels below the part, or more than 300 parts: it refuses (`REMOVAL_TOO_DEEP`, `REMOVAL_TOO_MANY`) before it reads that depth.
- Do not write the moved part in `planFullLevelMove`'s `changes`: the part is written with `order`, and `changes` are the others. For a `remove` the moved part's `order` is `0` and is not to be written.
- Do not trust the order of a level the host has only partly read: use `readLevel` with `fresh: true` (as `planPartialWrite` does) before numbering.

## Wrong readings

- "`partOrder` of a blank or bad order is 0." It is `NaN`: `""`, `"   "`, `"abc"`, `"0,001"` (a comma is not a decimal mark to `Number`) and a missing value are all `NaN`. A real `0` is `0`. A non-finite number such as `Infinity` is NOT turned into `NaN`, although the function's comment says "not a finite number".
- "`asGrid` is pure." It reads `Date.now()` for a record with no numeric `updatedAt`. A test must fake the clock.
- "A capped level is one with `cap` or more ids." `capped` is the host's answer and means one more id exists past the cap. A level of exactly `cap` is whole.
- "`removalPlan` reads 12 levels." The count starts at the `depth` argument and a depth is refused before it is read when it would be past 12, so a chain of 11 levels below the part is removed, and a chain of 12 is refused (even when the twelfth has no children).
- "`previewPaste` reads `Assumption: sentence` as an assumption." It needs a Keyword: `Assumption: Floor: text`. `Assumption: text` is `bad` with `ASSUMPTION_KEPT`, and it empties the stack, so the `- ` lines after it are `bad` too (and so is a `- ` line that follows a top part above it).
- "A `- ` line after `Assumption: Floor: text` is a child of Floor." It is a second assumption beside Floor (a child of the section); a `- - ` line is under Floor.
- "`closeGap` leaves no duplicate order." It moves a sibling into the place the list held for the one above it, which can repeat an order the sibling above already holds.
- "A step is always a swap." Only when both orders are finite and each held by one part, and (on a partial level) no hidden part's order lies strictly between them. Otherwise the level is numbered 1..n.
- "`nextOrder` of negative orders is below 1." The largest starts at 0, so it is at least 1.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/lib/base/planParts.ts` (whole, 483 lines) to `src/planParts.ts`. Code verbatim; the imports are re-pointed: `./planCard` (`readLineSources`, `rowServedFact`, the type `PlanSourceValue`) is `@kaigilb/gilbplatformcode-plan-card-facts`; `./planLinks` (`duplicateTagSentence`, `isTypeName`, `pointsAt`, `recordTag`) is `@kaigilb/gilbplatformcode-plan-links-model`; `./recordHooks` (the type `GridRecord`) and `./records` (the type `BaseRecord`) are `@kaigilb/gilbplatformcode-base-record`; `./planLevelRead` (`planStep`) is `./planLevelRead`. The two files import each other, which is why they are one unit.
- `src/lib/base/planLevelRead.ts` (whole, 453 lines) to `src/planLevelRead.ts`. Code verbatim except the named changes below. Imports: `./search` (`idFromEntityUri`) is `@kaigilb/gilbplatformcode-id-tail`; `./planLinks` (`recordTag`) is `@kaigilb/gilbplatformcode-plan-links-model`; `./records` (the type `BaseRecord`) is `@kaigilb/gilbplatformcode-base-record`; `./planParts` is unchanged; `./heldTypes` (`mapWithConcurrency`, `MAX_PARALLEL_DEREFERENCES`) is `./mapWithConcurrency`.
  - The I/O seam. The three functions that talked to the app's query cache (`readLevel`, `planPartialWrite`, `removalPlan`) take `host: LevelHost` where they took `qc: QueryClient` (same position), and each call is replaced by the host method, in the same order, with the same awaits and loop structure:
    - `pageAttributeIds("a:partOf", parentUri, vaultOriginOf(planVault), { cap: opts.cap, qc })` (line 45) is `host.pageChildIds(planVault, parentUri, { cap: opts.cap })`; `pageAttributeIds("a:partOf", node.entityUri, origin, { cap: REMOVAL_MAX_PARTS + 1, qc })` (line 384) is `host.pageChildIds(planVault, node.entityUri, { cap: REMOVAL_MAX_PARTS + 1 })`;
    - `qc.invalidateQueries({ queryKey: planRecordKey(idFromEntityUri(e), e), refetchType: "none" })` (lines 53 and 403-406) is `host.markStale(e)`;
    - `readCached(qc, entity, opts.fresh)` (line 58) is `host.readMember(entity, opts.fresh)`; `readCached(qc, item.entity, true)` (line 409) is `host.readMember(item.entity, true)`;
    - `applyPinsAndDrops(qc, planVault, "a:partOf", parentId, serverRows, serverIds)` (line 76) is `host.applyPinsAndDrops(planVault, "a:partOf", parentId, serverRows, serverIds)`;
    - `readLevel(qc, ...)` inside `planPartialWrite` (line 323) is `readLevel(host, ...)`.
  - `const origin = vaultOriginOf(planVault);` (removalPlan) is removed: `origin` fed only the replaced find, and the host works the origin out of `planVault`. `vaultOriginOf` is used nowhere else in the file.
  - The interface `LevelHost` is added and exported (its comments name the GilbApp call each method replaces). The imports of `@tanstack/react-query`, `./config`, `./planFind` and `./picture` are removed.
  - `vaultIdOfEntity` of `./picture` (4 lines) is copied as a non-exported function (`src/picture.ts` lines 73-76).
  - Comments in the three functions that named `fetchQuery` and `readCached` say what a fresh read needs of any cache.
- `src/lib/base/heldTypes.ts` lines 111 and 120-150 (`MAX_PARALLEL_DEREFERENCES`, `mapWithConcurrency`) to `src/mapWithConcurrency.ts`, code verbatim, two comments made generic. It is the app's version, not the `map-limit` unit's.

The peers' bodies were compared with the app's (comments stripped): `idFromEntityUri` of `id-tail` (it is `slashTail`) is the app's `search.ts` function; the `plan-links-model` and `plan-card-facts` functions are those of the units' own READMEs.

`src/index.ts` is new (it exports the two source files; `mapWithConcurrency` is not exported). `test/fakeHost.ts` is new: a fake `LevelHost` that logs every call in order and can make finds, reads and mark-stale take real time. The tests:

| Test (app) | In this unit | Ported |
| --- | --- | --- |
| `planStepPlan.vaultit.test.ts` (5 cases) | `descriptionTree.test.ts` | all 5 |
| `planLevelRead.vaultit.test.ts`: `planFullLevelMove` (5), `planStep` (6) | `planLevelRead.pure.test.ts` | all 11 |
| `planLevelRead.vaultit.test.ts`: `readLevel pins and drops` (1), `removalPlan breadth first` (2) | `levelHost.test.ts` | all 3, against the fake host |
| `planQaTester4.vaultit.test.ts`: the random `planFullLevelMove` runs (2000 levels, and 500 new parts) | `planFullLevelMove.random.test.ts` | both |
| `planQaTester4.vaultit.test.ts`: the paging cases (`pageAllByAttribute`, 2) | | left out: the page walk is the host's |
| `planQaTester5.vaultit.test.ts`: `planStep` random 3000 runs and known answers | `planStep.random.test.ts` | both |
| `planQaTester5.vaultit.test.ts`: the breadth-first removal (7 cases) | `levelHost.test.ts` | all 7, against the fake host |
| `planQaTester5.vaultit.test.ts`: `ensureEtagUnchanged` (4), the cap rule on `pageAttributeIds` (2) | | left out: the row cache and the page walk are not in this unit |
| `planQaTester.vaultit.test.ts`: parts served-shape round trip (1), paste of a skipped line's children (1) | `servedShapes.test.ts`, `previewPaste.test.ts` | both |
| `planQaTester.vaultit.test.ts`: the other cases (meters, level lines, impacts, list writers) | | left out: they test other cards |
| `planServedShapes.vaultit.test.ts`: a part's bare `partOf`, `elementOrder`, `body`, `lineSources` (1) | `servedShapes.test.ts` | ported (with its two `linkAddress` assertions) |
| `planServedShapes.vaultit.test.ts`: the other cases (7: meters, status, levels, impacts) | | left out: they test other cards |
| `planTagVault.vaultit.test.ts`: `Assumption is kept` (2), `a pasted child stays` (1) | `previewPaste.test.ts` | all 3 |
| `planTagVault.vaultit.test.ts`: `tagUsedInVault` (6) | | left out: a search in the vault, the host's |
| `RecordDetail.planSolutionParts`, `RecordDetail.planPartsDrag`, `RecordDetail.planTagVault`, `DescriptionHelp` (component tests) | | left out: they draw the cards |

Ported cases keep their inputs and expectations; the hosts are `example.test` and the people Ann and Ben; the app's fake server (a stubbed `fetch` that answered the find and the read) is the fake `LevelHost`, with the same data and the same counts (51 finds and 50 reads for the 50 by 50 tree, 4 finds and 3 reads for the budget case). `planParts.test.ts`, `previewPaste.test.ts` (the cases after the first four), `descriptionTree.test.ts` (after the first five), `planLevelRead.pure.test.ts` (after the ported blocks), `levelHost.test.ts` (the cases not marked ported), `mapWithConcurrency.test.ts`, `exports.test.ts` and `example.test.ts` are new and pin every export; the host-call order, `markStale` settling before the first fresh read, `partOrder("")`, `partOrder("0,001")`, `partOrder(0)`, a malformed `Assumption:` line, `asGrid` with fake timers and `mapWithConcurrency` on a throw are pinned there.
