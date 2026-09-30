# history-value

A short reading of one stored value, for a change line. It does not fetch the record the value points at.

## What this is

`valueSummarySync(value, labels?)`.

One string. The optional map stands in for the app's session cache. Omit it, and an entity address stays `entity:<id>`.

## What this is not

- Not a loader. The app fetches labels and fills a cache. That fetch stays in the app. Pass the names you already have.
- Not `units/history-actor`. That one reads who wrote the change.
- Not `units/history-events`. That one groups rows. It carries a private copy of this function. Keep the two copies in agreement, or pass this function into `groupHistoryDatoms`.
- Not `units/id-tail`. An entity id here is the path segment with the percent-encoding left in place. `id-tail`'s `uriTail` decodes. This one does not.

## How to take it

Package: `@kaigilb/gilbplatformcode-history-value`

```ts
import { valueSummarySync } from "@kaigilb/gilbplatformcode-history-value";
```

Path: `units/history-value/`.

## What you pass

`value` is the stored value, as it was served. `labels` is a map from a key to the words you want shown.

Lookup order, and only for a trimmed string that starts with `http` (lowercase) and contains `/base/e/`:

1. the opaque id, the segment after `/base/e/`, if the map has that key
2. the full trimmed address, if the map has that key

A stored empty string is a hit. The lookup does not skip it and try the next key.

A compact `base:e/…` form does not consult the map.

## What you get

| Value | Result |
|---|---|
| `null` or `undefined` | `∅` |
| a string of only spaces | `""` after trim |
| the word `null` | `null`, not the empty-set sign |
| `0` | `0` |
| `false` | `false` |
| `[]` | `[]` |
| a one-item list | the reading of that item |
| a longer list | `[2 items]`, the count, not the items |
| a string longer than 160 | the first 157 characters plus `…` |
| a string of length 160 | the whole string |
| an object with `@id` | the reading of that `@id`, including when `@id` is null (`∅`) |
| any other object | JSON, clipped at 120 characters the same way (117 plus `…`) |
| a value JSON cannot print, such as a cycle | `…` |

Address rules, after trim. The `http` test is case-sensitive. `HTTP://` is an ordinary string.

1. Starts with `http` and contains `/base/t/`: the type segment, decoded once. A broken `%` sequence is kept as written. It does not throw. A `/base/t/` wins over a later `/base/e/` in the same string.
2. Starts with `http` and contains `/base/e/`: `entity:<id>`, unless the label map answered. The id is not decoded. `/base/e/` with nothing after it returns the address itself, because there is no id.
3. Starts with `base:e/`: `entity:` plus the rest. No label lookup.
4. Starts with `base:t/`: the rest, with no `entity:` prefix.

The ellipsis is one character, `…`, not three dots. The empty value is `∅`, not the word empty.

## Examples

```ts
valueSummarySync(null); // "∅"
valueSummarySync(0); // "0"
valueSummarySync("http://example.test/base/t/A%20B"); // "A B"
valueSummarySync("http://example.test/base/e/a%20b"); // "entity:a%20b"
valueSummarySync("base:e/abc", new Map([["abc", "Ignored"]])); // "entity:abc"
valueSummarySync("http://example.test/base/e/abc", new Map([["abc", ""]])); // ""
valueSummarySync("a".repeat(161)); // 157 a's, then …
```

## What the host must supply

The value. The label map, if a name should replace `entity:<id>`. This unit does not know where names come from.

## Do not

- Do not decode the entity id to match `uriTail`. The history line shows the segment the address had.
- Do not look up a label for `base:e/…`. The http form is the only one that consults the map.
- Do not treat a map hit of `""` as a miss.
- Do not summarise the members of a list longer than one. The line is the count.
- Do not switch the 160 and 120 cuts. A string cuts at 160. JSON cuts at 120.

## Wrong readings

- "Empty and null are the same." `null` is `∅`. A blank string is `""`. The word `null` stays the word.
- "The map always applies." Only to an `http` entity address, id first, then the full trimmed address.
- "A type address and an entity address are the same shape." Type is checked first, and it is decoded. Entity is not decoded.

## Where it came from

GilbApp `src/lib/base/ontologyHistory.ts`, `valueSummarySync`. The label argument replaces the module cache. The fetch that fills that cache is not in this unit.
