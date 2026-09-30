# process-tag

The document tag on a process, and the patch that sets, clears, or refuses a rename.

## What this is

`processUnitTag(process)` returns the document's unit tag, or `undefined`.

`buildProcessUnitTagPatch(original, edited)` returns the patch, or throws when the edit is a rename of a tag that already exists.

## What this is not

- Not `units/tag-carrier`. That unit reads `unitTag` and `ruleId`, and it trims. This unit reads the document only, framed `unitTag` then raw `a:unitTag`, and it does not trim the text it returns. A `ruleId` on the same record is not this tag. Do not make them agree.
- Not a writer. The patch key is the bare slug `unitTag`. The host adds one `a:` on the wire. This unit never adds `tagScope`.
- Not a step tag and not a condition tag. Those are a different scope. A tag on `entryCondition` is not read.

## How to take it

Package: `@kaigilb/gilbplatformcode-process-tag`

```ts
import { buildProcessUnitTagPatch, processUnitTag } from "@kaigilb/gilbplatformcode-process-tag";

const shown = processUnitTag(process); // undefined → draw no chip
const patch = buildProcessUnitTagPatch(original, edited);
```

## What you pass

`process` may carry `unitTag` and `a:unitTag`. Other keys are ignored.

`original` is the served tag. `edited` is the draft from the form. Both are strings. Do not trim them before the call. The function trims only for the freeze comparison.

## What you get

Read:

- Framed `unitTag` wins when it has text after trim. The returned string keeps its spaces. `"  Proc  "` comes back as `"  Proc  "`.
- A framed value that is blank after trim falls through to `a:unitTag`.
- A non-string is skipped.
- No carrier, or only spaces, returns `undefined`. That is "no chip", not an empty chip.
- Bare `tag` is not a document tag.

Patch:

| Served | Draft | Result |
|---|---|---|
| `"Proc"` | `"Proc"` | `{}` — the key is absent. Do not write it again. |
| `""` | `"Proc"` | `{ unitTag: "Proc" }` |
| `"Proc"` | `""` | `{ unitTag: null }` — a delete. Never `""`. |
| `"Proc"` | `"  Proc  "` | `{ unitTag: "  Proc  " }` — not a freeze, and not a no-op. The draft is written with its spaces. |
| `"Proc"` | `" "` | `{ unitTag: " " }` — spaces are not a clear. Clear is exactly `""`. |
| `"Old"` | `"New"` | throws |

The thrown message is exactly:

`a:unitTag is frozen at assignment and cannot be renamed in place (served "<original>", edited "<trimmed draft>"). Clear the field to release the tag, then set the new one.`

`served` in that sentence is `original` unchanged, spaces included. `edited` in that sentence is the trimmed draft. `" Old "` renamed to `" New "` says served `" Old "` and edited `"New"`.

The same sentence is what the kind-document door throws. Keep them the same. This unit does not import that door.

## Do not

- Do not trim the read result before showing it. The spaces are part of the stored text.
- Do not treat `{}` as a failed save. It means nothing changed.
- Do not send `""` as a clear. The clear value is `null`.
- Do not catch the freeze and write the new tag anyway. The release is: clear, then set.
- Do not read `ruleId` here and call it the process tag.

## Wrong readings

- "A spaces-only difference is unchanged, so the patch is empty." No. Freeze does not fire, and the draft, spaces included, is the patch.
- "Whitespace in the draft clears the tag." No. Only `edited === ""` clears.
- "`undefined` from the reader means the read failed." No. It means this document has no unit tag.

## Where it came from

GilbApp `src/lib/base/processDocTagEdit.ts` — `processUnitTag`, `buildProcessUnitTagPatch`. The save request stayed in the app. The kind-document twin is `buildStandardKindUnitTagPatch` in `standardKindEdit.ts`. The message is the same. The functions are not imported from each other.
