# ontology-status

The status word a write may store. Retired and withdrawn become Deprecated. Anything else that is not Approved becomes Suggested. This function never returns the word Retired.

## What this is

`normalizeOntologyStatus(raw)` is the write-side spelling.

The screen used to store the word Retired. A row may still say that. A write must not say it again. Retired, withdrawn, and deprecated are all stored as Deprecated. Approved stays Approved. Every other string, including a blank, becomes Suggested.

## What this is not

- Not status-level. That unit is the list a screen shows: the label, the colour, and whether new data may be attached. It does not rewrite a word. This unit rewrites a word, and only for a write.
- Not a reader for the browse or search plane. Those planes show the word the store served, including a legacy Retired if one is still there. Running this function on a browse row renames a served vocabulary. That rename is not this app's to make.
- Not a check that the person may approve. It does not look at a session.
- Not a trim that preserves case. The match is lowercase. The return value is one of three capitals: `Suggested`, `Approved`, `Deprecated`.

## How to take it

Package: `@kaigilb/gilbplatformcode-ontology-status`

```ts
import { normalizeOntologyStatus } from "@kaigilb/gilbplatformcode-ontology-status";

const stored = normalizeOntologyStatus(draft);
```

## What you pass

A string, null, or undefined. The draft the person typed, or the word a legacy row held, at the moment of a write.

## What you get

`Suggested`, `Approved`, or `Deprecated`. Never `Retired`. Never `retired`. Never an empty string.

| Input | Result |
|---|---|
| `null`, `undefined`, `""`, `"  "` | `Suggested` |
| `"suggested"`, `"nope"`, `"approve"` | `Suggested` |
| `" Approved "` | `Approved` |
| `"RETIRED"`, `"deprecated"`, `"withdrawn"` | `Deprecated` |

`approve` without the final `d` is not Approved. The match is the whole word after trim and lowercase.

## Examples

```ts
normalizeOntologyStatus("RETIRED"); // "Deprecated"
normalizeOntologyStatus("approve"); // "Suggested"
normalizeOntologyStatus(" Approved "); // "Approved"
```

## Host must supply

The draft string. The field key the write uses stays in the host. This function does not know `a:ontologyStatus`.

## Do not

- Do not call this before showing a served status in a list. Show the served word. Call this when building the write body.
- Do not add `Retired` as a fourth return value so old rows round-trip. The whole point is that a write cannot emit that spelling.
- Do not treat Suggested as "the person chose Suggested". It is also the fallback for a word this function does not know. A typo becomes Suggested. If the host needs to reject a typo, it must do that before the call.
- Do not lowercase the return value. The stored word is `Deprecated`, not `deprecated`.

## Wrong readings

- "Blank means leave the old status." Blank becomes Suggested. If the write must omit the field instead, the host makes that choice and does not call this.
- "Withdrawn is its own standing." It is stored as Deprecated.
- status-level's seed also uses these three words. That does not make the two units the same. One describes. One rewrites.
- A number is not accepted. The type is a string or nothing. Do not stringify a number and expect a status.

## Source

GilbApp `src/lib/base/ontologyWrite.ts`, `normalizeOntologyStatus`. The constants there are the three words this function returns.
