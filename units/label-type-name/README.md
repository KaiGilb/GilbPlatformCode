# label-type-name

A type name made from a label. `work in teams` becomes `WorkInTeams`. The rest of each word is not lowercased.

## What this is

`labelToTypeName(label)` builds the PascalCase identity a new term would use, from words the person typed.

The label is trimmed. Runs of characters that are not ASCII letters or digits are breaks. Each remaining piece gets an uppercase first character. The other characters stay as typed. The pieces are joined with nothing between them.

## What this is not

- Not label-hyphen. That unit lowercases and joins with hyphens. `Work In Teams` there is not `WorkInTeams` here.
- Not search-words. That unit inserts spaces into a name that is already PascalCase, and it does not change case.
- Not type-spell and not ontology-ref. Those turn a name into an address. This function stops at the name. It does not decide that the name is free, and it does not build a URL.
- Not a slug. Underscores are breaks, not characters that stay. `a_b` is `AB`.
- Not Unicode-aware. `é` is a break. `café team` is `CafTeam`. Do not "fix" that with a Unicode letter class. The app splits on `A-Za-z0-9` only.

## How to take it

Package: `@kaigilb/gilbplatformcode-label-type-name`

```ts
import { labelToTypeName } from "@kaigilb/gilbplatformcode-label-type-name";

const name = labelToTypeName(label);
```

`""` means the label had no ASCII letter or digit. It does not mean "use the label unchanged".

## What you pass

One string. The label.

## What you get

A string. No spaces. No hyphens.

| Input | Result |
|---|---|
| `"work in teams"` | `"WorkInTeams"` |
| `"WORK in teams"` | `"WORKInTeams"` — `WORK` is not lowercased before the capital |
| `""`, `"---"`, `"   "` | `""` |
| `"html5 parser"` | `"Html5Parser"` |
| `"café team"` | `"CafTeam"` |
| `"a_b"` | `"AB"` |
| `"  5 teams "` | `"5Teams"` — a digit may start the name |

`toUpperCase` is called with no locale. Only `charAt(0)` is passed to it.

## Examples

```ts
labelToTypeName("work in teams"); // "WorkInTeams"
labelToTypeName("WORK in teams"); // "WORKInTeams"
labelToTypeName("café team");     // "CafTeam"
```

## Host must supply

The label. Uniqueness of the name is a catalogue question. This function will happily return `Person` from `person` even when that term exists. The host must not treat a non-empty result as permission to mint.

## Do not

- Do not lowercase the tail so `WORK` becomes `Work`. The app does not, and a later compare against a name that kept the capitals would miss.
- Do not keep `é`, apostrophes, or hyphens inside the name. They are breaks. `well-known` is `WellKnown`.
- Do not join with a space or a hyphen and then run this again. The second run sees one word.
- Do not use `""` as a type name on a write. An empty result means ask for a different label.

## Wrong readings

- "It title-cases." It does not. Title case would lowercase the rest of `WORK`. This leaves `ORK` in capitals.
- "A leading digit is rejected." It is not. `5 teams` is `5Teams`.
- A hyphenated label is two words, not one word with the hyphen removed. `a-b` is `AB`, not `Ab` and not `A-B`.
- The trim is only the ends. Spaces in the middle are breaks, which is why they do not appear in the result.

## Source

GilbApp `src/lib/base/ontologyWrite.ts`, `labelToTypeName`.
