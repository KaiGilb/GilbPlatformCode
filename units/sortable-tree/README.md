# sortable-tree

A drag-and-drop tree of rows, with a keyboard way as well, that reorders and re-nests: it writes nothing, it reports where a dragged row was dropped.

## What this is

A drag-and-drop tree of rows, with a keyboard way as well, that reorders and re-nests: it writes nothing, it reports where a dragged row was dropped.

A tree of rows that a person can reorder and re-nest by dragging a grip: with the mouse, with a finger, or with the keyboard. It writes nothing. It reads the rows, shows where the dragged row will land (a line), and tells the caller (`onDrop`) the new parent and the place; the caller does the write. Built on `@dnd-kit/core`.

- `SortableTree({ rows, onDrop, refuse?, disabled?, indent?, status?, children })`: the wrapper. `rows` are the visible rows, top to bottom, parents before their children (`TreeRow`: `id`, `parentId`, `depth`, `label`). `onDrop(drop)` is called once for a drop that changes something, with a `DropTarget`; it may return a promise, and a string it resolves with is the reason the write failed, said in the status region as "The move was not saved: <reason>." (a failure that arrives after another drag has begun is not said). `refuse(move)` is the caller's own rule: a sentence refuses that move (a part going inside itself is always refused). `disabled` turns the grips off. `indent` (default 24 px) is how far right one level is. `status` is a sentence for the one polite region. A drag failure wins while it is set.
- `TreeItem({ id, label, depth, handle, children })`: one row: its grip at the left, its content (the row's own, not its child rows), and the drop line when the line is at its edge. `handle` draws the grip. The grip is a button with `data-tree-handle="<id>"` and `aria-label="Drag <label>"`; the row has `data-tree-row="<id>"` and, while carried, `data-dragging="true"`. The line has `data-drop-line` (`ok` or `refused`) and `data-drop-depth`. The status region has `data-tree-status`. A `TreeItem` outside a `SortableTree` throws "TreeItem needs a SortableTree around it."
- Mouse: a 5 px move on the grip. Touch: press the grip for 200 ms (a swipe before that scrolls). Keyboard: focus the grip, Space picks up, the arrows move (up and down by row, left and right by level), Space drops, Escape cancels. Each step is read out in dnd-kit's live region, and the screen-reader instructions are on the grip.
- The pure part, in `treeDrop`: `flattenTree(nodes, read, parentId?, depth?)` (nested nodes to the flat `TreeRow` list, depth first), `resolveDrop(rows, activeId, gap, depth, refuse?)` (where a drop lands: the verdict, `DropTarget` or a refusal with a reason), `subtreeSize`, `depthRange`, `insideItself`, `lineOf`, `placeWords`, `stepGap`, and the types `TreeRow`, `DropTarget`, `DropRefusal`, `DropVerdict`, `RefuseMove`.
- How a drop is read: a drop is a place between two rows (`gap` = how many rows are above the line) at a `depth`. The depth is cut to what the place allows (as deep as a child of the row above, as shallow as the row below, in the list without the dragged row and its parts) and decides the parent: the nearest row above the line one level up. `index` is the place among the new parent's children, the dragged row not counted. `unchanged` is true when this is where the row already is (both the gap above the row and the gap after its parts mean that). A row cannot go inside itself or its own parts.

## What this is not

- Not a writer. `onDrop` is told; the host moves the records, orders them and handles errors.
- Not a tree view. It draws the grip, the line and the live region; the row's content and its indentation are the host's (`TreeItem` does not indent its children: the host puts its own padding, using `depth`).
- Not a general drag and drop. It moves rows of one tree. It does not take drops from outside, or between trees.
- Not the plan builders (`dropPlan`, `reorderPlan`) that turn a drop into the order numbers to write; those belong to a later unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-sortable-tree`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/sortable-tree
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link (one copy of React and of dnd-kit):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer, and so is `@dnd-kit/core`, at exactly 6.3.1: it is REQUIRED, and the app installs it (`npm install @dnd-kit/core@6.3.1`). With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/sortable-tree/src";`.

## Examples

```tsx
import { SortableTree, TreeItem, flattenTree } from "@kaigilb/gilbplatformcode-sortable-tree";

const rows = flattenTree(parts, (p) => ({ id: p.id, label: p.title, children: p.parts }));

<SortableTree
  rows={rows}
  refuse={({ activeId, parentId }) => (isAssumption(activeId) !== isAssumption(parentId) ? "Not across that boundary." : null)}
  onDrop={async (drop) => {
    // drop.activeId, drop.parentId (null: the top level), drop.index, drop.parentLabel, drop.afterLabel
    const failed = await moveInStore(drop.activeId, drop.parentId, drop.index); // the host writes
    return failed ? "the store refused it" : undefined;
  }}
>
  {rows.map((row) => (
    <TreeItem key={row.id} id={row.id} label={row.label} depth={row.depth} handle={editing}>
      <div style={{ paddingLeft: row.depth * 24 }}>{row.label}</div>
    </TreeItem>
  ))}
</SortableTree>;
```

## What the host must supply

- React 19, and `@dnd-kit/core` 6.3.1 installed by the app.
- Tailwind v4 scanning this unit's `src` (classes such as `group/row`, `group-hover/row:opacity-100`, `pointer-coarse:opacity-100`, `cursor-grab`, `select-none`, `shadow-md`, `sr-only`, `pointer-events-none`, `absolute`, `right-0`, `h-0.5`, `rounded-full`, `opacity-50` are generated from it).
- These CSS variables: `--accent` (the line, the focus ring, the carried label's border), `--bad` (the line of a refused place), `--ink` (the carried label, the grip on hover), `--ink-soft` (the grip), `--r-md` (the radius), `--sel` (the grip on hover) and `--surface` (the carried label's background). They come from the `editorial-tokens` unit or your own theme.
- The rows, in order, and a `TreeItem` for each; the host indents the content.
- The write, in `onDrop`.

## Do not

- Do not use HTML5 `draggable` beside it. Two drag systems in one tree fight over the same pointer and the page's drag image; use this one for every drag of a row.
- Do not hand it rows that are not parents-first, depth-first: the drop is read from the order and the `depth` of the list.
- Do not put a row's child rows inside its `TreeItem`; each child is a `TreeItem` of its own, in the flat list.
- Do not install a second copy of `@dnd-kit/core` or of React.
- Do not do anything slow, or with side effects, in `refuse`: it is asked on every pointer move and every key.

## Wrong readings

- "`index` counts the dragged row." It does not: it is the place among the new parent's children with the dragged row taken out.
- "A row can be dropped between a part and its first child as a sibling of the part." It cannot: there the depth is cut to one level, so the place is always the part's first child.
- "Down from a one-row part stops at each gap." A one-row part has two gaps that mean "stay"; a step skips over them, so down goes to the second gap after the row, and up goes two back.
- "`unchanged` means the verdict is a refusal." It is a success (`ok: true`) that names where the row already is; `onDrop` is not called for it.
- "A refusal has no depth." It has the depth the line is drawn at, cut to what that place allows.
- "A drag in a test needs a real browser." The keyboard drag runs in jsdom as it is. The mouse drag needs a `PointerEvent` and a layout in jsdom, which the tests of this unit give themselves; a finger drag (the touch sensor) is not tested here.
- "The status region is for drags only." It shows `status` when there is no failure to say.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/dnd/SortableTree.tsx` (whole, 449 lines) to `src/SortableTree.tsx`. Code verbatim. Comments made generic: the first two lines (which said the app's ONE drag and drop, that nothing else in `src` imports dnd-kit and that nothing uses HTML5 `draggable`) are reworded to "meant to be an app's ONE drag and drop: nothing beside it should use HTML5 `draggable`".
- `src/components/dnd/treeDrop.ts` (whole, 159 lines) to `src/treeDrop.ts`. Verbatim; the comments name no person, project or host.

Their imports are only `react`, `@dnd-kit/core` and each other. This unit's `tsconfig.json` leaves `noImplicitOverride` off (the source was built without it; `static activators` of the class `MousePointerSensor` does not compile with it on).

`src/index.ts` is new: it exports `SortableTree` and `TreeItem` from `SortableTree.tsx` and everything `treeDrop.ts` exports (which includes the names `SortableTree.tsx` re-exports: `flattenTree`, `resolveDrop`, `DropTarget`, `DropVerdict`, `RefuseMove`, `TreeRow`).

The tests: `src/planPartsDrag.test.ts` is ported from `src/components/records/RecordDetail.planPartsDrag.vaultit.test.tsx` (its group "where a drop lands, and the plans for it (pure)"): the first two cases (they use `flattenTree` and `resolveDrop`; the nested nodes the app builds with its description-parts model are written by hand here, with the same ids and parents). The other two cases of that group (they use `dropPlan` and `reorderPlan`), the keyboard-drag cases of the same file (they render the whole record card with its stores and writes) and its source-scan case (a repository-wide guard) are not ported. `treeDrop.test.ts`, `SortableTree.test.tsx` and `SortableTree.pointer.test.tsx` are new and pin every export.
