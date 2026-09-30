# named-type

Bare type names for a word search that is limited to types the caller named.

An empty list is not a search of every type. The sentinel for "do not filter by type" is the string `untyped-find`.

## What this is

- `bareTypeNames` trims each string, drops blanks, and drops later duplicates. The first spelling wins.
- `typeLocalName` is the bare name of one type spelling.
- `isNamedBareType` is true when that bare name is in the caller's list.
- `UNTYPED_FIND` is the string `"untyped-find"`.

## What this is not

- Not the search. The host calls the vault. This unit does not fetch.
- Not `units/type-name`. That unit returns null when a slash remains, strips a leading `veda:` and a trailing `.png`, and accepts `/t/` on any path. This cut does not.
- Not a different cut from `units/type-curie` or from the private copy in `units/record-plane`. `typeLocalName` here must stay the same function as those two. If one changes, the others change with it.

The cut is:

- `t:Name` → `Name`. Only the `t:` is removed. The rest is not checked.
- `prefix:Name` when the prefix is letters and digits, and the name is letters, digits, `_`, or `-` → `Name`.
- An address that contains `/base/t/Name` → `Name`, decoded once. A broken `%` in that segment throws. It does not return the raw segment.
- Anything else, including `/vault/t/Name`, is returned trimmed and whole.

`/vault/t/Note` is not the name `Note`. `isNamedBareType` on that address against `["Note"]` is false.

## How to take it

Package: `@kaigilb/gilbplatformcode-named-type`

```ts
import {
  UNTYPED_FIND,
  bareTypeNames,
  isNamedBareType,
} from "@kaigilb/gilbplatformcode-named-type";
```

Path: `units/named-type/`.

## What you pass

`bareTypeNames` takes a list of strings, or null. It does not split on commas. It does not strip `t:`. `"t:Note"` stays `"t:Note"`. If you want the bare name, run `typeLocalName` yourself. This function is the list cleaner, not the type parser. That split is deliberate: the search sends the names the caller already decided were bare.

`isNamedBareType` takes the type address or curie, and the list of bare names. Null type is the same as `""`.

## What you get

A new list, or a boolean, or the sentinel string.

`isNamedBareType` compares with `includes`. Case matters. `"note"` is not `"Note"`. An empty bare name is never a hit, even if the list contains `""`. `t:` has an empty bare name, so it is not a hit.

Duplicates: `[" Note ", "Note"]` becomes `["Note"]` because trim makes them the same and the set keeps the first.

## The sentinel

`UNTYPED_FIND` is how a caller says the search is by words alone, with no type conjunct.

An empty array is not that. An empty array means no type was named. The host must treat that as a miss and must not issue the search. Do not coerce `[]` to `UNTYPED_FIND`. A filtered-to-nothing list and a forgotten variable must stay misses. The sentinel cannot be passed by accident.

This unit does not enforce that. It only names the sentinel so the host does not invent a second spelling.

## Examples

```ts
bareTypeNames([" Note ", "", "Note", "Task"]); // ["Note", "Task"]
bareTypeNames(null); // []

typeLocalName("t:Note"); // "Note"
typeLocalName("https://example.test/base/t/Note%20Doc"); // "Note Doc"
typeLocalName("https://example.test/vault/t/Note"); // the whole string

isNamedBareType("t:Note", ["Note"]); // true
isNamedBareType("https://example.test/vault/t/Note", ["Note"]); // false

UNTYPED_FIND; // "untyped-find"
```

## What the host must supply

The decision to search, the vault call, and the rule that an empty name list does not become an untyped search. Pass `UNTYPED_FIND` only when the person asked for words with no type.

## Do not

- Do not use `units/type-name` for this check. A `/vault/t/` address and a trailing `.png` are handled differently there, and a slash that remains becomes null instead of the whole string.
- Do not catch the decode error and treat a broken `%` as the raw segment. Let it throw.
- Do not case-fold the comparison.

## Wrong readings

- "Empty types means search everything." Empty types means do not search. `untyped-find` is the other choice, and it is a named value.
- "`bareTypeNames` strips `t:`." It does not. It trims and dedupes.

## Where it came from

GilbApp `src/lib/base/search.ts` (`bareTypeNames`, `isNamedBareType`, `UNTYPED_FIND`). The cut is `typeLocalName` from `recordPlane.ts`, which is the same function as `units/type-curie`.
