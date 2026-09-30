# step-removal

Decides whether one step id really left the list the vault served. A step is an id. This is not the check for a condition, which has no id.

## What this is

`confirmStepRemoval` compares two lists of ids you already have: the ids served before the delete, and the ids served after it. It does not look at the request you sent. It does not fetch.

All four arms run. A refusal names every arm that failed, in this order:

1. `not-present-before` — that id was not in the before list. A shorter after list is not evidence about a step that was never there.
2. `count-not-exactly-one` — the after list is not exactly one shorter. Length is the array length, not the number of distinct ids.
3. `deleted-id-still-served` — that id occurs at least once in the after list.
4. `sibling-did-not-survive` — some other id from the before list is missing afterwards.

`confirmed` is true only when the list of failed arms is empty.

## What this is not

- Not the condition check. Two copies of the same condition can be told apart by counting copies. Two copies of the same step id cannot. If the id is still in the after list, arm 3 fails even though the array got shorter by one. Do not change this into a count of copies. Conditions use `condition-removal`.
- Not a check that the order of steps is the same. Order is ignored. An extra id that keeps every earlier id fails the count, not the sibling arm.
- Not a trim, and not a case fold. `" b"` and `"b"` are different. `"A"` and `"a"` are different.
- Not a fetch, and not a sentence for the screen. You name the arms yourself.

## How to take it

Package: `@kaigilb/gilbplatformcode-step-removal`

```ts
import { confirmStepRemoval } from "@kaigilb/gilbplatformcode-step-removal";
```

Path: `units/step-removal/`.

## What you pass

| Argument | Meaning |
|---|---|
| `beforeIds` | The step ids the vault served before the delete, in the order it served them. Duplicates stay duplicates. |
| `afterIds` | The step ids the vault served after the delete. |
| `deletedId` | The id the click targeted. An empty string is a real id when the before list contains an empty string. |

The lists are not changed.

## What you get

Either `{ confirmed: true }` or `{ confirmed: false, failedArms }`. `failedArms` is in the order above, and it can contain more than one arm. Read the whole list. The first arm is not the only fault.

## Examples

```ts
confirmStepRemoval({ beforeIds: ["a", "b", "c"], afterIds: ["c", "a"], deletedId: "b" });
// { confirmed: true }

confirmStepRemoval({ beforeIds: ["a", "a"], afterIds: ["a"], deletedId: "a" });
// { confirmed: false, failedArms: ["deleted-id-still-served"] }

confirmStepRemoval({ beforeIds: ["a", "b"], afterIds: ["a", "z"], deletedId: "b" });
// { confirmed: false, failedArms: ["count-not-exactly-one"] }
// "a" survived, so the sibling arm does not fail. "z" made the length wrong.

confirmStepRemoval({ beforeIds: ["a", "b", "c"], afterIds: ["a"], deletedId: "b" });
// { confirmed: false, failedArms: ["count-not-exactly-one", "sibling-did-not-survive"] }
```

## What the host must supply

The two lists must be the vault's own served ids, read before and after the delete. Do not build the after list from the request body. Do not drop duplicate ids before calling. A gap in step numbers is not this function's business: it never sees the numbers, only the ids.

## Do not

- Do not stop at the first failed arm. The function does not.
- Do not treat "the id is still there" as success when one of two copies disappeared. That refusal is deliberate.
- Do not trim the ids to make a near miss pass.

## Wrong readings

- "The sibling arm means the after list has nothing extra." It does not. It only means every other before-id is still there. An extra id fails the count.
- "A duplicate id is a data error this function should clean." It should not. Presence is "occurs at least once".
- "This also proves the step order on screen." It does not look at order.

## Where it came from

GilbApp `confirmStepRemoval` in `src/lib/base/processTypes.ts`.
