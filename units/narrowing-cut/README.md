# narrowing-cut

Apply filters the host registered. A filter that is not ready does not empty the list.

## What this is

The mechanism for cutting a three-column list: types, functions, values.

`isFilterActive(state, id)` — is this filter on.

`filtersForView(mode, filters)` — which filters are offered in `hierarchy` or `search`.

`defaultNarrowingState(filters)` — the selection the view opens with.

`flattenColumns(columns)` — one list, types then functions then values.

`applyNarrowing(columns, state, prepared, filters)` — the cut, the removal counts, and the sentences.

`TOGGLE_ON` is `["on"]`, the selection a toggle stores when it is on.

## What this is not

- Not a filter registry. Lifecycle and "used in apps" stay in the app. Pass them in. This unit does not know their ids.
- Not a fetch. If a filter has `prepare`, the host runs it and passes the result in `prepared`. Until that key is present, the filter does not cut.
- Not a bar, and not a sentence renderer. `describe` returns the sentence. The screen prints it.
- Not a saved view. Filter ids here are not ontology terms. Do not write them into a vault as `a:` or `t:` keys.

## How to take it

Package: `@kaigilb/gilbplatformcode-narrowing-cut`

```ts
import { applyNarrowing, filtersForView } from "@kaigilb/gilbplatformcode-narrowing-cut";

const offered = filtersForView(mode, registry);
const outcome = applyNarrowing(columns, state, prepared, offered);
```

Pass the same `offered` list to the bar and to `applyNarrowing`. Those two lists are one decision.

## What you pass

A filter has `id`, `label`, `control` (`"toggle"` or `"multi"`), `keep`, and `describe`.

Optional: `help`, `defaultSelection`, `offeredIn`, `options`, `prepare`.

`offeredIn` omitted means every view. `offeredIn: []` means no view.

`defaultSelection` omitted or `[]` means the filter starts off. A non-empty default is a cut nobody clicked. `describe` still has to say so.

`state` maps a filter id to the selected strings. Missing, or `[]`, is off. `[""]` is on. A blank string is not treated as off.

`prepared` maps a filter id to whatever `prepare` returned. This function does not call `prepare`.

`columns` has `types`, `functions`, and `values`. Any row type. The functions only pass the row through.

## What you get

`filtersForView` returns the same filter objects, not copies.

`defaultNarrowingState` includes only filters whose default selection has length greater than 0. Each selection is a new array. A filter that is left out is absent, not `[]`, so `isFilterActive` reads it as off.

`flattenColumns` returns a new array.

`applyNarrowing` returns new column arrays. The input arrays are not mutated.

A filter is active when its selection length is greater than 0.

A filter is ready when it has no `prepare`, or when `prepared` has that id (`id in prepared`, so an inherited key counts). A stored `null` is still ready. `keep` then receives `prepared[id]`, or `null` when that value is `null` or `undefined`. The number `0` and the string `""` are passed through. They are not turned into `null`.

A filter that is active but not ready does not remove rows, does not appear in `byFilter`, and does not appear in `notes`. Waiting is not the same as "nothing matched".

`removed` is the difference in length, per column and in total.

`byFilter` counts each ready filter against the uncut list. Two filters that remove the same row each count it. It is not a cascade. Read it as "this filter would remove N".

`notes` is `describe` for each ready filter, in the order of the `filters` argument.

## Do not

- Do not pass the full registry to the cut and a shorter list to the bar. A cut with no control is a silent filter.
- Do not treat "prepare has not landed" as "keep nothing". The list stays as it was.
- Do not compute options from a corpus inside `keep`. Options come from the loaded page or from the filter's own data. This unit does not call `options`.
- Do not persist a filter id as an ontology attribute.

## Wrong readings

- "An empty column means the filter matched nothing." Not always. If `prepare` has not landed, the column is uncut and `notes` is empty. Say that you are still loading. Do not say the filter removed everything.
- "byFilter is how many rows this filter removed after the others ran." No. Each count is against the original list.
- "A default of `[]` stores an off switch in the state." No. The id is absent.

## Where it came from

GilbApp `src/lib/base/ontologyNarrowing.ts` — `isFilterActive`, `filtersForView`, `defaultNarrowingState`, `flattenColumns`, `applyNarrowing`, `TOGGLE_ON`. The registry entries stayed in the app. The column item type is generic here. The app's three columns are the same three names.
