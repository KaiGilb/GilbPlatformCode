# qualifier-values

Reads the values a level holds for one qualifier as a list, and packs a list back into the form a level stores.

## What this is

Reads the values a level holds for one qualifier as a list, and packs a list back into the form a level stores. Plain functions, no React.

A level stores a qualifier's value as `""` (none), one string (one pick) or an array (a set). These functions turn that into a list and back.

- `qualifierValues(v)`: `[]` when unset or blank, one item for a string, the trimmed non-empty items for an array. It does not remove duplicates.
- `packQualifierValues(list)`: the inverse. `""` for none, a string for one value, an array for two or more. Items are trimmed, and a repeat that differs only in case or outer spaces is dropped (the first spelling stays). `ALL` is exclusive: alone it packs to `ALL`; beside other values it is dropped.
- `ALL_VALUE`: the string `"ALL"`, what a level stores for every value of the qualifier.
- `eq(a, b)`: equal after trimming and lower-casing.

## What this is not

- Not a splitter. `qualifierValues("a, b")` is one value, `"a, b"`.
- Not a validator of what a value may be. Any non-blank text is a value.
- Not the storage. The host stores and reads the level.

## How to take it

Package: `@kaigilb/gilbplatformcode-qualifier-values`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/qualifier-values
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. It has no dependency.

## Examples

```ts
import { packQualifierValues, qualifierValues } from "@kaigilb/gilbplatformcode-qualifier-values";

qualifierValues(undefined);                 // []
qualifierValues(" x ");                     // ["x"]
qualifierValues([" a ", "", " b"]);         // ["a", "b"]
qualifierValues(["a", "a"]);                // ["a", "a"]  (no de-duplication here)

packQualifierValues([]);                    // ""
packQualifierValues(["x"]);                 // "x"
packQualifierValues(["x", "X", " y "]);     // ["x", "y"]
packQualifierValues(["ALL"]);               // "ALL"
packQualifierValues(["all", "x"]);          // "x"
packQualifierValues(["ALL", "x", "y"]);     // ["x", "y"]
```

## What the host must supply

Nothing. The functions read only their argument.

## Do not

- Do not compare values with `===` where case and outer spaces should not matter; use `eq`.
- Do not store `qualifierValues` output for a single pick as an array; pack it first.
- Do not write `"all"` in another case as the every-value marker; `packQualifierValues` writes the exact `ALL`.

## Wrong readings

- "`qualifierValues` removes duplicates." It does not. `packQualifierValues` does.
- "`ALL` plus other values keeps `ALL`." It does not: `ALL` is dropped when anything else is present.
- "`packQualifierValues(['all'])` returns `'all'`." It returns `'ALL'`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/lib/base/planValue.ts` lines 1676-1685 (`eq`, `ALL_VALUE`, `qualifierValues`) and 1704-1714 (`packQualifierValues`). Comments scrubbed; the one code change is that `eq` is now exported (it was a private const there). `listLikeDefinition` (lines 1687-1702) is not part of this unit.
