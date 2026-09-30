# create-kind

Which create-list a node kind belongs on. Relation, attribute, and scale are not on a list.

## What this is

`kindFromNodeKind(nodeKind)` maps one stored node-kind string to `type`, `function`, `value`, or `null`.

`optionMatchesPlane(kind, plane)` says whether that kind is on the list the person opened: `things`, `function`, `value`, or `all`.

## What this is not

- Not the browse-kind unit. Browse-kind reads a whole document and calls a relation a type. This unit returns `null` for `relation`, `attribute`, and `scale`, which means "do not offer it as something to create".
- Not the type-plane unit. Type-plane answers relation and attribute from flags and from the address. An empty node kind is a different question there. Here, empty means a Thing.
- Not a search, and not the list of types. The host already has the node kind.

## How to take it

Package: `@kaigilb/gilbplatformcode-create-kind`

```ts
import { kindFromNodeKind, optionMatchesPlane } from "@kaigilb/gilbplatformcode-create-kind";

const kind = kindFromNodeKind(nodeKind);
if (kind && optionMatchesPlane(kind, plane)) {
  // offer it
}
```

## What you pass

`kindFromNodeKind` takes a string, `null`, or `undefined`.

`optionMatchesPlane` takes a kind this unit already returned (`type`, `function`, or `value`) and the open list.

## What you get

`kindFromNodeKind` trims and lowercases.

| Input | Result |
|---|---|
| `null`, `undefined`, `""` | `type` |
| `entity`, `type`, `relations` | `type` |
| `function`, `FUNCTION` | `function` |
| `value` | `value` |
| `relation`, `attribute`, `scale` | `null` |

`null` means do not offer it. It does not mean the term is missing.

`optionMatchesPlane`:

- `all` keeps every kind.
- `things` keeps only `type`.
- `function` keeps only `function`.
- `value` keeps only `value`.

## Host must supply

The node kind from a term it already loaded, and which list is open.

## Do not

- Do not treat `null` from `kindFromNodeKind` as `type`. That would put relations on the Things list.
- Do not treat an empty node kind as `null`. Empty is a Thing. Browse-kind's private helper returns null for a missing node kind. This function does not.
- Do not pass a kind from browse-kind into `optionMatchesPlane` and expect relation to be filtered. Browse-kind never returns a relation kind.

## Wrong readings

- `relations` is not `relation`. It is `type`, because the match is exact after trim and lowercase.
- `things` is not "everything that is not a function". A value is not on `things`.

## Source

GilbApp `src/lib/base/typeSearch.ts`, `kindFromNodeKind` and `optionMatchesPlane`.
