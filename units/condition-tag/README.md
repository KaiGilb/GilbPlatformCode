# condition-tag

The tag on one condition: what to show, what counts as assigned, and how to put the framed names back before a write.

This is not `tag-carrier`. Read that sentence twice. A condition does not look at `ruleId`. A record's tag fields do not look at a bare `tag`, and they do not care whether `op` is `manual`.

## What this is

| Function | You pass | You get |
|---|---|---|
| `conditionUnitTag` | The condition object. | The text to show, or `undefined`. |
| `conditionUnitTagCarrier` | The condition object. | The assigned text, or `undefined`. Never the bare `tag`. |
| `invertConditionTagCarriers` | The condition object. | A shallow copy with framed keys moved back to `a:unitTag` and `a:tagScope`. |

The four key names are exported: `unitTag`, `a:unitTag`, `tagScope`, `a:tagScope`.

## What this is not

- Not `tag-carrier`. No `ruleId`. No trimming of a value that is kept.
- Not the sentence pill. `step-instruction` decides the pill from a carrier you pass in. This unit is how you obtain that carrier from a condition.
- Not a freeze by itself. The carrier function tells you there is an assignment. The host decides the field is read-only.

## How to take it

Package: `@kaigilb/gilbplatformcode-condition-tag`

```ts
import { conditionUnitTag, conditionUnitTagCarrier } from "@kaigilb/gilbplatformcode-condition-tag";
```

Path: `units/condition-tag/`.

## What you pass

An object. The keys that matter are `unitTag`, `a:unitTag`, `tag`, and `op` for the display read, plus `tagScope` for the invert.

## What you get

Display order:

1. `unitTag`, when it is a string and is not only whitespace. Returned with its spaces. Not trimmed.
2. `a:unitTag`, on the same rule. A blank `unitTag` does not hide this. It falls through.
3. `tag`, only when `op` is exactly the string `manual`. `Manual` does not count. A missing `op` does not count.

The carrier function stops after step 2. A manual bare `tag` is legacy text, not an assignment. Showing it is allowed. Treating it as the stored tag is not. If you freeze a bare `tag`, the condition has nothing assigned to release.

`undefined` means there is nothing to show. Do not invent `En1` or any positional stand-in.

`invertConditionTagCarriers` copies the object. It does not change the input. If `unitTag` is an own key, its value is written to `a:unitTag` and `unitTag` is removed, even when the framed value is empty. The same for scope. A bare `tag` stays. If both spellings were present, the framed value replaces the stored one. The old stored value is dropped on that copy.

## Examples

```ts
conditionUnitTag({ unitTag: "  Keep  " });
// "  Keep  "

conditionUnitTag({ op: "manual", tag: "Legacy" });
// "Legacy"

conditionUnitTag({ op: "Manual", tag: "Legacy" });
// undefined

conditionUnitTagCarrier({ op: "manual", tag: "Legacy" });
// undefined

invertConditionTagCarriers({ unitTag: "A", tagScope: "KaiZen", tag: "bare" });
// { "a:unitTag": "A", "a:tagScope": "KaiZen", tag: "bare" }
```

## What the host must supply

The condition object after the app's own read. This unit does not load or save it.

## Do not

- Do not trim the result and write the trimmed text back unless the host meant to change the stored bytes. The spaces are part of the return value.
- Do not use the display function as the read-only guard. Use the carrier function.
- Do not run the record-level resolver (`tag-carrier`) on a condition and expect the bare `tag` to appear.

## Wrong readings

- "manual means any op that is not automatic." Only the exact string `manual`.
- "An empty unitTag means there is no tag." `a:unitTag` is still read.
- "Invert migrates a bare tag into a:unitTag." It does not. That would turn legacy text into an assignment.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`, `conditionUnitTag`, `conditionUnitTagCarrier`, and `invertConditionTagCarriers`.
