# frozen-tag

The tag on a process document or a standards-kind document. It can be set. It can be cleared. It cannot be renamed in place.

## What this is

Two functions.

`readDocumentUnitTag` reads the assigned tag. Framed `unitTag` first, then `a:unitTag`. The text is returned with its surrounding spaces. A blank or whitespace-only value does not count, and it does not hide the next spelling.

`buildFrozenUnitTagPatch` returns the patch, or throws when the edit is a rename.

The key in the patch is the bare slug `unitTag`. The host's patch call adds one `a:`. If you put `a:unitTag` in the patch, the host writes `a:a:unitTag`.

## What this is not

- Not the tag on a condition, and not the tag on a step. Those have their own doors. The read here matches `conditionUnitTagCarrier` in `units/condition-tag` for the two spellings, and it must stay in step with that function. It must not grow the extra branch that `conditionUnitTag` has, where a bare `tag` counts when `op` is exactly `manual`. A document does not read `tag`.
- Not `units/tag-carrier`. That one also reads `ruleId`, and an empty framed string there falls through differently in the carrier list. Do not mix them.
- Not the save call. The host sends the patch. An empty patch means send nothing.

## How to take it

Package: `@kaigilb/gilbplatformcode-frozen-tag`

```ts
import { readDocumentUnitTag, buildFrozenUnitTagPatch } from "@kaigilb/gilbplatformcode-frozen-tag";
```

Path: `units/frozen-tag/`.

## What you pass

The read takes the fact object, or null. It looks at `unitTag` and `a:unitTag` only.

The patch takes two strings: the served tag, and the edited tag. Pass them as the form holds them. Do not trim before you call. The function trims for the rename test and does not trim what it writes.

## What you get

The read returns the tag string, or `undefined`. `undefined` means show no tag. Do not invent one.

The patch returns one of:

- `{}` when `edited === original` byte for byte. Send nothing.
- `{ unitTag: null }` when `edited` is exactly `""`. That is a delete. Do not send `""`. An empty string is not a delete on the wire; it is a bad value that can sit behind a success response. Whitespace is not a delete. `" "` is stored as a space.
- `{ unitTag: edited }` otherwise, with `edited` unchanged.

Or it throws a plain `Error`. There is no subclass. The message is exactly:

`a:unitTag is frozen at assignment and cannot be renamed in place (served "ORIGINAL", edited "TRIMMED"). Clear the field to release the tag, then set the new one.`

`ORIGINAL` is the served string as you passed it, spaces included. `TRIMMED` is `edited.trim()`, not `edited`. The second sentence is part of the message. Do not drop it. The step and condition doors in the app stop after the parenthesis. This door does not. It is the document door.

## The order inside the patch

1. Both trims are non-empty, and they differ → throw.
2. The raw strings are equal → `{}`.
3. `edited` is exactly `""` → `{ unitTag: null }`.
4. Otherwise write `edited`.

A whitespace-only served tag does not freeze, because its trim is empty. Replacing it is a set.

Changing `" Alpha "` to `"Alpha"` is not a rename. The trims match, so it does not throw, and the raw strings differ, so it writes `"Alpha"`. Changing `"Alpha"` to `" Alpha "` writes the spaced form. Do not "normalise" that away.

Clearing `" Alpha "` with `""` is a delete, not a rename. The trim of the edit is empty, so step 1 does not throw.

## Examples

```ts
readDocumentUnitTag({ unitTag: "  Keep  ", "a:unitTag": "other" }); // "  Keep  "
readDocumentUnitTag({ unitTag: "   ", "a:unitTag": "raw" }); // "raw"
readDocumentUnitTag({ tag: "En1" }); // undefined

buildFrozenUnitTagPatch("Alpha", "Alpha"); // {}
buildFrozenUnitTagPatch("Alpha", ""); // { unitTag: null }
buildFrozenUnitTagPatch("Alpha", "Beta"); // throws
buildFrozenUnitTagPatch(" Alpha ", "Alpha"); // { unitTag: "Alpha" }
```

## What the host must supply

The served document facts, the edit box, and the patch call that adds `a:` once. Build the tag patch before any other field in the same save. A refused rename must throw before anything else is written, so a title change in the same save does not land either.

## Do not

- Do not trim the arguments before the call and then also expect the message to quote the original spaces.
- Do not catch a custom error class. It is a plain Error. Match the message, or let it surface.
- Do not write `tagScope` from this unit. A document tag patch is the tag alone.
- Do not read `tag` as the document tag.

## Wrong readings

- "Equal after trim means send nothing." Equal after trim means it is not a rename. If the raw strings differ, the edited text is written.
- "A space clears the tag." Only `""` clears. A space is stored.
- "This is the same patch as a step." The refusal's first sentence matches. The second sentence is only on the document door.

## Where it came from

GilbApp `src/lib/base/processDocTagEdit.ts` (`processUnitTag`, `buildProcessUnitTagPatch`) and `src/lib/base/standardKindEdit.ts` (`buildStandardKindUnitTagPatch`). The two patch functions are the same function. The read matches `conditionUnitTagCarrier` in `processTypes.ts` and must stay in agreement with `units/condition-tag`.
