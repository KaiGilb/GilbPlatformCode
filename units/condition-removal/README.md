# condition-removal

Decides whether one condition really left the list the vault served, and builds the shorter array to write. A condition has no id. Sameness is the canonical text of the whole object.

## What this is

Three functions:

| Function | Job |
|---|---|
| `canonicaliseCondition` | One comparable string for one condition. Key order does not matter. |
| `removeConditionAt` | The array to send when removing the member at an index. |
| `confirmConditionRemoval` | Whether the vault's after list is that removal. |

`confirmConditionRemoval` compares the vault's own before list with the vault's own after list. It does not look at the request body. All five arms run, in this order:

1. `target-not-present-before` — the index is not an integer inside the before list, or the condition at that index is not the condition the click captured.
2. `count-not-exactly-one` — the after list is not exactly one shorter.
3. `target-multiplicity-wrong` — the target's canonical text does not occur exactly one fewer time. Two identical conditions are two copies. Removing one must leave the other. This is a count, not "is it gone".
4. `sibling-did-not-survive` — the multiset of what remains is wrong. This arm sorts. Order does not matter for this arm.
5. `served-order-differs` — the after list is not the composed array, element for element, in order. This arm does not sort.

`confirmed` is true only when every arm passes. On a single consistent page, arm 5 implies the three before it. They are still named separately. Do not delete the earlier arms because arm 5 already failed, and do not delete arm 5 because the earlier arms passed. A swapped order passes arm 4 and fails arm 5.

When the index is in range, the target counted by arm 3 is the condition in that slot, not the clicked object. A click whose content is not in that slot fails arm 1 even when the slot itself was removed cleanly.

When the index is not in range, the target counted by arm 3 is the clicked condition, and arm 5 fails because nothing was composed.

## What this is not

- Not the step-id check. Step ids use `step-removal`, where a duplicate id still counts as present. Here a duplicate is a count of copies. Do not swap the two rules.
- Not a writer of the request. `removeConditionAt` only returns the next array. The host sends it.
- Not a tag editor. The carrier flip below is the flip every removal already does. Setting, clearing, and the freeze on rename are `condition-tag` and `frozen-tag`.
- Not a fetch.

## How to take it

Package: `@kaigilb/gilbplatformcode-condition-removal`

```ts
import {
  canonicaliseCondition,
  confirmConditionRemoval,
  removeConditionAt,
} from "@kaigilb/gilbplatformcode-condition-removal";
```

Path: `units/condition-removal/`.

## removeConditionAt

Pass a list, or one object (a one-element list), or null / undefined (an empty list).

The index must be an integer, at least 0, and less than the length. Otherwise it throws:

```text
removeConditionAt: index out of range (1.5, length 1)
```

The number in the sentence is the index you passed, including a fraction. The length is the length after a single object has been wrapped, or 0 for null.

The result is a new array, one shorter. Removing the last member returns `[]`. It does not return null. A null would clear the whole attribute, which is a different act from "this list is now empty".

Each survivor is copied. Framed `unitTag` is written back as `a:unitTag`. Framed `tagScope` is written back as `a:tagScope`. A bare `tag` is left as it is. If both spellings of one carrier are on the same member, the framed value replaces the stored one. Other keys are copied. The input list and its objects are not changed.

A null member inside the list is not rejected. Object spread of null is an empty object, so that survivor becomes `{}` and the "null member" throw does not see it. Do not add a throw for that. The two length and null throws in the function are the same guards as the app. They do not fire for a list of objects.

This folder's carrier flip is a private copy of `invertConditionTagCarriers` in `units/condition-tag`. The two must stay in agreement. This folder does not import that package.

## canonicaliseCondition

Used by the confirm. You can also use it to compare two conditions yourself.

- Key order does not matter. Nested objects are sorted too. Arrays keep their order.
- A missing key and a key whose value is `undefined` are different. The stored undefined is part of the text.
- `null` is the text `null`. A string is quoted the way `JSON.stringify` quotes it. Numbers and booleans are their JSON text.
- Top-level `a:unitTag` and `unitTag` fold to the same key when exactly one of them is present. The same for `a:tagScope` and `tagScope`.
- If both spellings are present, they are not folded. That condition does not compare equal to either spelling alone. The confirm then refuses instead of guessing which spelling the vault meant.
- No other `a:` key is folded. `a:title` and `title` are different. A nested `a:unitTag` is not folded. Do not "fix" a refusal by stripping every `a:` prefix. Extend the pair list, or leave the refusal. A silent success here would confirm a removal that was not the one served.

## confirmConditionRemoval

| Argument | Meaning |
|---|---|
| `servedBefore` | The condition array the vault served before the write. |
| `servedAfter` | The condition array the vault served after the write. |
| `index` | The position the click addressed. Not an id. |
| `clickedCondition` | The condition the click captured. Compared by canonical text, not by object identity. |

The result is `{ confirmed: true }` or `{ confirmed: false, failedArms }` with the arms in the order listed above.

A framed carrier on the way back compares equal to the stored spelling on the way out, when only one spelling is present. That is why a removal can confirm after the vault frames the keys.

## Examples

```ts
removeConditionAt([{ text: "keep", unitTag: "T", tag: "bare" }, { text: "drop" }], 1);
// [{ text: "keep", "a:unitTag": "T", tag: "bare" }]

confirmConditionRemoval({
  servedBefore: [{ text: "keep", unitTag: "T" }, { text: "drop" }],
  servedAfter: [{ text: "keep", "a:unitTag": "T" }],
  index: 1,
  clickedCondition: { text: "drop" },
});
// { confirmed: true }

confirmConditionRemoval({
  servedBefore: [a, b, c],
  servedAfter: [c, a],
  index: 1,
  clickedCondition: b,
});
// { confirmed: false, failedArms: ["served-order-differs"] }
// The members are right. The order is not. Arm 4 does not catch this.
```

## What the host must supply

Both lists must be what the vault served, not a copy you edited locally and not the body you sent. Call `removeConditionAt` on the before list to build the write. Call `confirmConditionRemoval` on a fresh before and the after. Do not confirm from the request body.

## Do not

- Do not use step-removal's "still present" rule on conditions, or this count on step ids.
- Do not drop arm 5.
- Do not strip every `a:` key before comparing.
- Do not return null from a writer when this function returned `[]`.

## Wrong readings

- "Identical conditions are one condition." They are copies. The count has to fall by one copy.
- "If the click's text is gone, the removal worked." The slot has to be the clicked content, the other members have to survive, and the order has to be the composed order.
- "Key order is part of the comparison." It is not. Array order is.
- "`title` and `a:title` are the same key here." They are not.

## Where it came from

GilbApp `canonicaliseCondition`, `removeConditionAt`, and `confirmConditionRemoval` in `src/lib/base/processTypes.ts`. The carrier flip matches `invertConditionTagCarriers` in that file, which is also `units/condition-tag`.
