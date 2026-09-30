# one-or-many

Turns "one object or a list of objects" into a list. A store that collapses a one-element list to the object itself will otherwise drop that only element, or throw when the code calls a list method.

## What this is

`asOneOrMany(value)`:

| You pass | You get |
|---|---|
| `null` or `undefined` | `[]` |
| an array | that same array |
| anything else, including one object | `[value]` |

The array case is not a copy. Mutating the result mutates the input. If you need to edit, copy first.

## What this is not

- Not a string splitter. A string is not an array, so `"hello"` becomes `["hello"]`. Fields that are one string or many strings, and that must drop blanks, use `string-list`.
- Not a flattener. `[["inner"]]` stays a one-element list whose element is the inner list.
- Not a type check. The object is not inspected.

## How to take it

Package: `@kaigilb/gilbplatformcode-one-or-many`

```ts
import { asOneOrMany } from "@kaigilb/gilbplatformcode-one-or-many";
```

Path: `units/one-or-many/`.

## Where the app uses it

Process conditions. One condition comes back as an object. Two come back as an array. The app function is `asConditionArray`. Call `asOneOrMany` on that field before you index it.

The same collapse happens on other JSON-LD fields. Use this wherever a single value and a list are the same fact. Do not special-case "if it is an object, wrap it" at each call site; the null case is part of the function (`null` is not wrapped).

## Do not

- Do not wrap a string field with this and then treat each character as an entry. You will get one entry, the whole string, which is still the wrong reader. Use `string-list`.
- Do not assume the result is a new array. Identity is preserved for arrays on purpose, matching the app.

## Wrong readings

- "`[]` means the field was an empty list." It also means the field was missing. You cannot tell those apart from the result, and the app does not try.
- "One object in, one object out." No. One object in, a one-element list out.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`, `asConditionArray`. Generalised to any element type. The null, array, and single-object behaviour is unchanged.
