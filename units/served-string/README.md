# served-string

A stored string, or nothing. Blank and absent are both nothing.

## What this is

`servedString(source, key)` returns `undefined` when the key is missing, the value is not a string, or the trimmed value is empty. When the value has a non-space character, the original string is returned, spaces included. `"  Cat  "` stays `"  Cat  "`. It is not trimmed. The trim is only the absence test.

`documentAppliesTo(source)` reads the steward note from `appliesTo`, then `a:appliesTo`. The framed key wins. A blank framed value falls through to the raw key. The note it returns is trimmed. Blank is `undefined`, not `""`.

## What this is not

- Not a display trim. If you need the words without surrounding spaces, trim the result yourself. `servedString` will not do it, so a later writer can still see the stored characters.
- Not a decision that the note is true, current, or addressed to a particular person. It only reads the text that is there.
- Not the whole standards projection. The viewer that renames fields onto a row stays in the app. This is the string rule that projection uses.

## How to take it

Package: `@kaigilb/gilbplatformcode-served-string`

```ts
import { servedString, documentAppliesTo } from "@kaigilb/gilbplatformcode-served-string";
```

Path: `units/served-string/`.

## Examples

```ts
servedString({ label: "  " }, "label");    // undefined
servedString({ label: "  Cat  " }, "label"); // "  Cat  "
servedString({ label: 1 }, "label");         // undefined

documentAppliesTo({ appliesTo: "  keep  ", "a:appliesTo": "other" }); // "keep"
documentAppliesTo({ appliesTo: "  ", "a:appliesTo": "raw" });          // "raw"
documentAppliesTo({});                                                  // undefined
```

## Do not

- Do not print `""` for a missing note. `undefined` means draw nothing, or say it is absent. An empty label is a fabricated value.
- Do not trim before you call `servedString` if you still need the original spacing. Call it on the stored value.

## Where it came from

GilbApp `src/lib/base/standardsViewerProjection.ts`, `servedString` and `documentAppliesTo`.
