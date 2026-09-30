# column-narrowing

Cuts three columns with filters you register. A filter whose preparation has not arrived is not applied.

## What this is

The mechanism: which filters are on, what they start as, which view offers them, and what remains after the ones that are ready.

- `isFilterActive`
- `defaultNarrowingState`
- `filtersForView`
- `flattenColumns`
- `applyNarrowing`
- `TOGGLE_ON` — the list `["on"]` a toggle stores when it is on

The item type is yours. This unit never reads a field on the item. Your `keep` function does.

## What this is not

- Not a filter. There is no built-in "used in apps" filter and no built-in lifecycle filter. Those need a fetch or a status list. Lifecycle words live in `units/status-level`. You register the filter and pass it in.
- Not a request. If a filter needs data the item does not carry, the host runs `prepare` once for the whole set and passes the result in `prepared`. This unit does not call `prepare`.
- Not a saved view. Filter ids here are plain slugs for the screen. Do not write them into a vault as if they were terms.

## How to take it

Package: `@kaigilb/gilbplatformcode-column-narrowing`

```ts
import {
  TOGGLE_ON,
  applyNarrowing,
  defaultNarrowingState,
  filtersForView,
  isFilterActive,
} from "@kaigilb/gilbplatformcode-column-narrowing";
```

Path: `units/column-narrowing/`.

Pass the same filter list to the bar and to `applyNarrowing`. A cut that uses a different list from the one on screen is a silent filter.

## What you pass

A filter:

| Field | Required | Role |
|---|---|---|
| `id` | yes | Plain slug. |
| `label` | yes | The words on the control. |
| `help` | no | What the control would do. Not a substitute for `describe`. |
| `control` | yes | `toggle` or `multi`. |
| `defaultSelection` | no | Omit, or use `[]`, to start off. |
| `offeredIn` | no | Omit to offer it in every view. `[]` offers it in none. Views are `hierarchy` and `search`. |
| `options` | no | For a multi control. Not called by `applyNarrowing`. |
| `prepare` | no | Declares that a batch result is required. Not called here. |
| `keep` | yes | `(item, selected, prepared) => boolean`. Return true to keep the row. |
| `describe` | yes | The sentence for this cut. Called only when the filter is ready. |

`applyNarrowing(columns, state, prepared, filters)`.

`columns` is `{ types, functions, values }`. `state` maps a filter id to the selected strings. `prepared` maps a filter id to whatever `prepare` returned. `filters` is the list. It is required. Omitting it is not "all filters".

## What you get

`defaultNarrowingState` returns a record with one key per filter whose `defaultSelection` has a length greater than 0. The list is a copy. A filter that starts off is absent, not stored as `[]`.

`isFilterActive` is true when that list has a length greater than 0. A missing key is off. `[""]` is on, because the length is 1. `[]` is off.

`filtersForView` keeps a filter when `offeredIn` is omitted, or when it includes the mode. An empty `offeredIn` keeps it out of every mode.

`flattenColumns` returns a new array: every type, then every function, then every value. The items are the same objects.

`applyNarrowing` returns:

| Field | Meaning |
|---|---|
| `columns` | New arrays. Items that every ready filter kept. |
| `removed` | How many are gone in each column, and `total`. This is the cascade, after every ready filter. |
| `byFilter` | How many of the original rows that one filter would remove, on its own. Two filters that remove the same row each count it. |
| `notes` | `describe` of each ready filter, in list order. |

A filter is applied only when it is on **and** ready.

- On: `isFilterActive`.
- Ready: it has no `prepare`, or its id is a key of `prepared`.

A filter that declares `prepare` and has no key yet is skipped. The rows stay. It is absent from `byFilter` and from `notes`. It is not counted as zero, and it is not treated as "keep nothing". Painting an empty column while a fetch is in flight would look like a filter that matched nothing.

A key that is present with the value `undefined` counts as ready. `keep` and `describe` then receive `null`, because a missing result is passed as null.

The input arrays are not mutated.

## Examples

```ts
const dropA = {
  id: "drop-a",
  label: "Drop A",
  control: "toggle" as const,
  keep: (item: { id: string }) => item.id !== "a",
  describe: () => "A is hidden.",
};

const columns = {
  types: [{ id: "a" }, { id: "b" }],
  functions: [],
  values: [],
};

applyNarrowing(columns, {}, {}, [dropA]);
// drop-a is off. Both rows remain. byFilter is {}.

applyNarrowing(columns, { "drop-a": ["on"] }, {}, [dropA]);
// types is [{ id: "b" }]. removed.total is 1. notes is ["A is hidden."].

const waiting = {
  ...dropA,
  id: "slow",
  prepare: async () => ({}) as unknown,
  keep: () => false,
  describe: () => "not yet",
};
applyNarrowing(columns, { slow: ["on"] }, {}, [waiting]);
// both rows remain. The filter is not in byFilter.
```

`TOGGLE_ON` is the selection you store when a toggle is switched on: `["on"]`.

## What the host must supply

The three columns, the filter list, the selection, and any prepared batch result. Also the disclosure on screen, from `notes`, whenever a filter is on. A filter that removes rows and says nothing is the defect this shape is meant to prevent. `help` explains the control. `describe` says what the cut did. Do not let help stand in for that sentence.

## Do not

- Do not ship a catch-all filter list from this unit. Pass the filters you offer.
- Do not apply a filter whose `prepare` has not landed. The skip is the point.
- Do not read `byFilter` as "how many this filter removed after the others". It is each filter alone, against the original rows. `removed` is the cascade.
- Do not treat a missing `byFilter` key as zero. Missing means off, or not ready.
- Do not mutate `defaultSelection` through the state. The state holds a copy. Mutating the filter's own array later does not change a state you already built, and the reverse is also true.
- Do not offer a filter in a view where it cannot change the rows, and still run it there. `filtersForView` is the list you both show and pass to `applyNarrowing`.

## Wrong readings

- "An empty column means nothing matched." It can also mean the filter was not ready, in which case this function does not empty the column. If you empty it yourself while waiting, the person cannot tell.
- "Filters run in a cascade for the counts." The rows do. The per-filter counts do not.
- "`[]` and a missing key are different inside `isFilterActive`." Both are off. They are different inside `units/status-level`'s reconcile, which is a different function.
- "This unit knows what a lifecycle is." It does not. A lifecycle filter is a `keep` you write, or you call `keepLifecycleStatus` from the status unit.

## Where it came from

GilbApp `src/lib/base/ontologyNarrowing.ts`: `filtersForView`, `isFilterActive`, `defaultNarrowingState`, `flattenColumns`, `applyNarrowing`, and `TOGGLE_ON`. The registered filters in that file are not in this unit.
