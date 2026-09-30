# browse-kind

Type, function, or value, from a term document the host already read. A relation stays a type.

## What this is

`kindFromRaw(raw)` reads one document.

`kindBadge(kind)` is the word on the column: `FUNCTION`, `VALUE`, or `TYPE`.

## What this is not

- Not the create-kind unit. Create-kind returns `null` for relation, attribute, and scale, and an empty node kind is a Thing. This unit never returns `null`. A relation document is `type`.
- Not the type-plane unit. Type-plane can answer `relation` or `attribute` from a flag or from the address. This unit does not look at those flags. Do not merge the two. A graph column and a create list are different questions.
- Not a fetch.

## How to take it

Package: `@kaigilb/gilbplatformcode-browse-kind`

```ts
import { kindFromRaw, kindBadge } from "@kaigilb/gilbplatformcode-browse-kind";

const kind = kindFromRaw(doc);
const badge = kindBadge(kind);
```

## What you pass

The document as a record. The keys that matter are `a:nodeKind`, `nodeKind`, and `@type`.

## What you get

`kindFromRaw`:

1. `a:nodeKind`, then `nodeKind`. The first string that is not empty after trim is used, then lowercased. A spaces-only value is skipped so the other key can answer.
2. `function` and `value` return those. Any other node kind, including `relation`, does not win. `@type` is tried next.
3. `@type` may be a string or a list. The first string that is exactly `t:Function`, or ends with `/t/Function`, is `function`. The same for `t:Value` and `/t/Value`. Case-sensitive. A trailing slash does not match. A non-string is skipped.
4. Otherwise `type`.

A node kind of `function` wins over `@type`, even when `@type` says Value.

`kindBadge` has no fourth word.

## Host must supply

The document. Do not pass a node-kind string alone if `@type` might be the only signal. Pass the record.

## Do not

- Do not use this to decide what the create dialog offers. A relation would show up as a Thing. Use create-kind for that dialog.
- Do not use create-kind's `null` here. This function does not have a null answer.
- Do not treat `T:Function` as a function. The `@type` match is exact.

## Wrong readings

- `relation` is not dropped. It is `type`, unless `@type` later says Function or Value.
- `/t/Function/` does not match. The end of the string must be `/t/Function`.
- An empty document is `type`, not "unknown". The column still has a badge.

## Source

GilbApp `src/lib/base/ontologyBrowse.ts`, `kindFromRaw`, `kindBadge`, and the private `pickString` they use.
