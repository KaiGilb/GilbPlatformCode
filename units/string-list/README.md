# string-list

Reads a value that is sometimes one string and sometimes a list of strings. Returns a list of the strings that are actually there.

## What this is

`stringsFromOneOrMany(raw)`:

| You pass | You get |
|---|---|
| `"https://example.test/base/e/a"` | that one string, in a list |
| `"   "` or `""` | `[]` |
| `[" a ", "", "  ", 1, null, "b"]` | `[" a ", "b"]` |
| `null`, `undefined`, a number, an object | `[]` |

A kept string is not trimmed. `" a "` stays `" a "`. Blank means "nothing left after trim", and that entry is dropped. A number is dropped, not turned into `"1"`.

Order is the order of the list. The first entry is not special.

## What this is not

- Not `one-or-many`. That helper wraps any one object and keeps blank strings. This one is only strings, and blanks are not entries.
- Not a reader of `{ "@id": "…" }`. An object is `[]`. If the field is an id object, this is the wrong function (`compact-id` reads `@id`).
- Not a splitter on commas. `"a,b"` is one string.

## How to take it

Package: `@kaigilb/gilbplatformcode-string-list`

```ts
import { stringsFromOneOrMany } from "@kaigilb/gilbplatformcode-string-list";
```

Path: `units/string-list/`.

## Where the app uses it

Checklist questions. The field `checksStandard` is one string on most questions and an array on the questions that cite two standards. A reader written as `const s = question.checksStandard as string` works on the fixture a developer is likely to type, and silently drops the second citation on live data.

```ts
const cited = stringsFromOneOrMany(question.checksStandard);
```

Any other field stored the same way (one string, or many strings, blanks meaningless) can use the same call. Pass the field value, not the whole record.

## Do not

- Do not trim the survivors. The app does not, so a later exact compare still sees the stored characters.
- Do not treat `[]` as "this question failed to load". It means nothing citeable was in the value. The question itself may be fine.
- Do not stringify objects so that a wrong shape "still shows something".

## Wrong readings

- "One string in the list means the field was an array of one." It may have been a single string. The function exists so you do not have to care which.
- "Whitespace around a real value is damage." It is kept. Only a value that is entirely whitespace is dropped.

## Where it came from

GilbApp `src/lib/base/checklistTypes.ts`, `checkedStandards`. The field name is not baked in. Pass `checksStandard` yourself.
