# step-order

Three pure helpers for process steps: the number a new step gets, the writes a drag must make, and the fact object a create sends.

None of them talks to a vault.

## What this is

| Function | You pass | You get |
|---|---|---|
| `nextStepOrder` | The steps you already have. | A number, at least 1. |
| `computeStepReorder` | Those steps, and two indexes. | A new array order, and a write list. |
| `buildStepCreateFacts` | The process address, the number, the instruction. | `{ processOf, stepOrder, instruction? }`. |

## What this is not

- Not the drag gesture, and not the request that writes the numbers back.
- Not a tag editor. Instruction text is copied (trimmed, on create). Tags stay where they are.
- Not `list-move`. That one only permutes. This one also decides which ordinals are already correct and must not be written.

## How to take it

Package: `@kaigilb/gilbplatformcode-step-order`

```ts
import { buildStepCreateFacts, computeStepReorder, nextStepOrder } from "@kaigilb/gilbplatformcode-step-order";
```

Path: `units/step-order/`.

## The next number

`nextStepOrder` starts at 0 and keeps a finite number only when it is strictly greater. The result is that max plus 1.

Camel `stepOrder` wins over kebab `step-order`. `0` counts as present, so it hides a kebab `9`, and because `0` is not greater than the start the result is still `1`. Null and a missing key fall through. A string `"2"`, `NaN`, a negative, and `Infinity` are ignored.

An empty list returns `1`.

## A drag

Indexes are positions in the array you pass, not the stored numbers.

A real move returns a new array of the same step objects, and a write for every step whose stored number is not its new 1-based index. Steps that already match are omitted. Writes are sorted by the new index.

`stepIdTail` is the last slash segment of `@id` (`slashTail` in `id-tail`). A query stays on the tail. It is not decoded.

`retireKebab` is true when the object has a `step-order` key, even if the value is null. The caller deletes that key. This function does not.

The same index, or an index outside the array, returns a shallow copy and no writes. It does not throw. It does not renumber a messy list. Healing happens only when you actually move.

```ts
// [1, 2, 3, 4, 5] moving index 1 to index 3
// writes tails c, d, b at ordinals 2, 3, 4
// the step that stayed at 1 and the step that stayed at 5 are not in the list
```

## A create

```ts
buildStepCreateFacts("https://example.test/base/e/proc", 2, "  hello  ");
// {
//   processOf: { "@id": "https://example.test/base/e/proc" },
//   stepOrder: 2,
//   instruction: "hello",
// }
```

`processOf` is an object. A string in that slot is a different value and will not match the process. `stepOrder` is a number. A numeric string sorts differently from a number.

A blank instruction is omitted. The key is absent, not `""`.

Pass `nextStepOrder(existing)` as `order` when the new step goes at the end.

## What the host must supply

The steps as already read, each with `@id` and whichever order spelling it has. This unit does not fetch them. On a write, you send `targetOrdinal` as the new number and, when `retireKebab` is true, you remove `step-order`. This unit does not build that patch.

## Do not

- Do not write every step on a drag. The omitted ones are already correct. Writing them is a needless change.
- Do not call `computeStepReorder` with the same index hoping it will fix gaps. It will not.
- Do not put the process address in `processOf` as a string.

## Wrong readings

- "The write list is the new order." It is only the steps whose number changed.
- "`retireKebab: false` means the kebab value was read." It means the key is not on the object. The number may still have come from `stepOrder`.
- "Order 0 means 'put this first'." `0` does not raise the next-number max, and it blocks the kebab spelling.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`: `nextStepOrder`, `computeStepReorder`, `buildStepCreateFacts`. The number read is the same camel-then-kebab rule as `stored-field`. The id cut is `slashTail`.
