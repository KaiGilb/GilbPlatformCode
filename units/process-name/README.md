# process-name

The name a process document states. A miss is blank. The id is not a name.

## What this is

`processDisplayName(process)` reads three facts, in order:

1. `title`, or `a:title` when `title` is absent.
2. `label`, or `a:label` when `label` is absent.
3. `processName`, or `process-name` when `processName` is absent.

Title and label are trimmed. The machine handle is returned with its spaces when it is not blank after trim.

A miss is `""`. It is not `Untitled`, and it is not the id.

## What this is not

- Not the entity-name unit. That unit reads a label before a title, then tags, then other bridges, and a miss is `Untitled` unless you passed a fallback. Using both on one document will disagree. Use this one for a process document's name. Use entity-name for a general row.
- Not the doc-label unit.
- Not a writer. It does not copy a name onto another field.
- Not a tag. `a:unitTag` is not a name. The process-tag unit reads the tag.

## How to take it

Package: `@kaigilb/gilbplatformcode-process-name`

```ts
import { processDisplayName } from "@kaigilb/gilbplatformcode-process-name";

const name = processDisplayName(doc);
```

## What you pass

The document as a flat record. Framed keys (`title`) and raw keys (`a:title`) may both be present.

## What you get

A string. It may be empty. It may have spaces only when those spaces are on the machine handle.

A camel key that is present and not null blocks the other spelling, even when the camel value is `""` or a number. `processName: ""` hides `process-name`. A numeric `title` does not become a name, and it also blocks `a:title`.

`a:processName` is not read. Only `processName` and `process-name`.

```ts
processDisplayName({ title: "  Hi  ", label: "No" }); // "Hi"
processDisplayName({ title: "  ", label: "Lab" });    // "Lab"
processDisplayName({ processName: "  proc  " });      // "  proc  "
processDisplayName({ "a:processName": "not read" });  // ""
processDisplayName({});                               // ""
```

## Host must supply

The document. Do not pass a display name you already composed.

## Do not

- Do not fall back to the id when this returns `""`. The empty string is the answer. The screen may say that the document names itself nowhere. It must not pretend the id is the name.
- Do not trim the machine handle after this returns. The spaces are part of the stored handle.
- Do not treat a label as winning over a title. Title wins. entity-name does the opposite for a general row.

## Wrong readings

- A whitespace title is not a name. The label is tried next.
- `""` from this function is not the same as entity-name's `Untitled`, and it is not entity-name's fallback `""` from the `??` rule. Different functions.

## Source

GilbApp `src/lib/base/processTypes.ts`, `processDisplayName` and the `wireField` read it uses.
