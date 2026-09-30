# stored-field

Read a fact that may arrive under two names, and read a process name without inventing one.

## What this is

`wireField(doc, camel, kebab)` returns the camelCase value when it is present, including `""`, `0`, and `false`. `null` and a missing key fall through to the kebab key. If both are missing or null, the result is `undefined`.

`storedProcessName(doc)` is the name to show:

1. `title`, or else `a:title`
2. `label`, or else `a:label`
3. `processName`, or else `process-name`
4. otherwise `""`

The id is never the name. A miss is a blank, not the tail of the address.

Title and label are returned trimmed. The machine handle is returned as stored, once it contains a non-space character. `processName: "  Proc  "` comes back as `"  Proc  "`, spaces included. Do not trim it if the screen must match the app.

## The empty-string trap

An empty camelCase value blocks the kebab spelling of that same field. `title: ""` hides `a:title`. The function then moves on to label. It does not mean "title is missing, use a:title".

## What this is not

- Not a writer. It does not decide which key a save should send.
- Not a general display name for every record. Cards that prefer `label` over a tag use a longer order. This function is the process-family order only.

## How to take it

Package: `@kaigilb/gilbplatformcode-stored-field`

```ts
import { wireField, storedProcessName } from "@kaigilb/gilbplatformcode-stored-field";
```

Path: `units/stored-field/`.

## Examples

```ts
wireField({ title: "", "a:title": "B" }, "title", "a:title"); // ""
wireField({ title: null, "a:title": "B" }, "title", "a:title"); // "B"

storedProcessName({ title: "  Title  ", label: "Label" }); // "Title"
storedProcessName({ title: "", "a:title": "Hidden", label: "Label" }); // "Label"
storedProcessName({ processName: "  Proc  " }); // "  Proc  "
storedProcessName({ "@id": "https://example.test/base/e/proc-x" }); // ""
```

## Do not

- Do not fall back to the id when this returns `""`. The blank is the honest result.
- Do not treat `""` from `wireField` as "try the other spelling". Only `null` and a missing key do that.

## Where it came from

GilbApp `wireField` and `processDisplayName` in `src/lib/base/processTypes.ts`. `storedProcessName` takes a plain record so this package does not need the app's document type.
