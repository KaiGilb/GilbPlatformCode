# neighbour-hops

How many hops to walk from the selected record. No selection walks none.

## What this is

`neighbourhoodHopsFor(filter, selectedId)` returns `0`, `1`, `2`, or `3`.

## What this is not

- Not the walk. It does not read a relation and it does not add nodes.
- Not the relation-count filter parser. The four words are the same four as `units/relation-count`: `"1"`, `"2"`, `"3"`, `"all"`. `hopDepthForFilter` in that unit returns `null` for `"all"`. This function turns that `null` into `3`, and only when a real selection is present. Change one and you must change the other. They do not import each other.
- Not a cap on how many nodes to add. The cap stays with the walk.

## How to take it

Package: `@kaigilb/gilbplatformcode-neighbour-hops`

```ts
import { neighbourhoodHopsFor } from "@kaigilb/gilbplatformcode-neighbour-hops";

const hops = neighbourhoodHopsFor(filter, selectedId);
```

## What you pass

`filter` is one of `"1"`, `"2"`, `"3"`, `"all"`.

`selectedId` is the selected record id, or null, or undefined. A draft id starts with `temp:` exactly.

## What you get

- No selection, `""`, `null`, or `undefined` → `0`.
- An id that starts with `temp:` → `0`, even when the filter is `"all"`. `temp:` itself is included. `temporary` is not a draft. `Temp:1` is not a draft. Case is kept.
- `"1"`, `"2"`, `"3"` with a real id → that number.
- `"all"` with a real id → `3`. That constant is `ALL_SELECTED_HOPS`.

## Do not

- Do not walk when this returns 0 and then invent a one-hop star. Zero means the seed page only.
- Do not treat `"all"` as "no limit". It is three hops once something is selected, and zero hops when nothing is.
- Do not strip `temp:` and then call this. The prefix is the signal.

## Wrong readings

- "All means every record in the vault." No. With a selection it means three hops. Without a selection it means do not expand.
- "`temporary` is a draft id." No. The prefix is `temp:` with the colon.

## Where it came from

GilbApp `src/lib/base/graphNeighbourhood.ts` — `neighbourhoodHopsFor`. The walk stayed in the app. The filter words match `units/relation-count`.
