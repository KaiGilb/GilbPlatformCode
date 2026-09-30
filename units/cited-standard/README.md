# cited-standard

Every standard one checklist question cites. A single string and a list are both read.

## What this is

`checkedStandards(question)` reads `checksStandard`.

One citation often arrives as a string. Two citations arrive as a list. A reader that only accepts a string keeps the first shape and drops the second citation on the questions that have one.

## What this is not

- Not the string-list unit. string-list has its own one-or-many rules for other fields. This function is this field, with this trim.
- Not a fetch of the standard, and not a check that the standard exists.
- Not a reader of `a:checksStandard`. Only `checksStandard`. A document that still has the raw key returns `[]` until the host maps that key across.

## How to take it

Package: `@kaigilb/gilbplatformcode-cited-standard`

```ts
import { checkedStandards } from "@kaigilb/gilbplatformcode-cited-standard";

const cited = checkedStandards(question);
```

## What you pass

An object that may have `checksStandard`.

## What you get

A new list. The question is not modified.

| `checksStandard` | Result |
|---|---|
| missing, `null`, a number, an object | `[]` |
| `""` or a string that is empty after trim | `[]` |
| any other string | one entry, not trimmed. `"  a  "` is `["  a  "]` |
| a list | strings that are not empty after trim, in order, not trimmed. Other members are dropped. A nested list is dropped. |

## Host must supply

The question object, with the field already on `checksStandard` if the wire used another spelling.

## Do not

- Do not read `question.checksStandard` in a component and branch on `typeof === "string"`. That is the bug. Call this.
- Do not trim the entries after they come back and then write them as if the store had no spaces. The spaces were kept on purpose.
- Do not treat `[]` as "this question failed to load". It means the field cited nothing this function can see.

## Wrong readings

- A whitespace string is an empty citation list, not a citation of a space.
- `"  a  "` is one citation, spaces included. The trim is only the emptiness test.
- The raw key `a:checksStandard` on the same object is invisible. Map it first if that is the shape you hold.

## Source

GilbApp `src/lib/base/checklistTypes.ts`, `checkedStandards`.
