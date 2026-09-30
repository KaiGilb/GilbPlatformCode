# list-move

Moves one item to another index. The list you passed is not changed. The length stays the same when the source index points at a real item.

## What this is

`moveIndex(items, from, to)` returns a new array.

```ts
moveIndex(["a", "b", "c", "d"], 0, 2);
// ["b", "c", "a", "d"]
```

The items are the same references, not deep copies. `from === to` returns a shallow copy, not the same array.

## What this is not

- Not a bounds check. The app checks both indexes before it calls this, and throws if either is outside the list. This function does not throw.
- Not a reorder of a whole record. It does not rename fields, invert spellings, or talk to a vault. The app does those in a separate step after the move.

## How to take it

Package: `@kaigilb/gilbplatformcode-list-move`

```ts
import { moveIndex } from "@kaigilb/gilbplatformcode-list-move";
```

Path: `units/list-move/`.

## Indexes

| `from` | Result |
|---|---|
| a real index | that item is removed and inserted at `to` |
| the same as `to` | a shallow copy, original untouched |
| past the end | the original items, in a new array; nothing is inserted |
| negative | counts from the end, because that is how the remove works |

`to` past the end inserts at the end, once `from` has selected an item.

This copy does not insert `undefined` when `from` misses. An earlier shape of the move could punch an empty hole. Do not add that hole back.

## What the host must supply

The check, if a bad index should be an error rather than a no-op. The app's condition reorder throws `index out of range` before calling the move. Copy that policy at the call site if you need the throw. This unit stays the permutation only.

## Do not

- Do not sort. The move is by position, not by a value on the item.
- Do not mutate the input. Callers keep the old list to compare.

## Wrong readings

- "The result is always a different length." No. A successful move keeps the length. A missed `from` also keeps the length, and keeps the order.
- "Negative means 'no change'." No. Negative means "from the end".

## Where it came from

GilbApp `src/lib/base/processTypes.ts`, `moveIndex`. Used there to permute process conditions before they are written back as a whole list.
