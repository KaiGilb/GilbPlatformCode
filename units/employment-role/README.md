# employment-role

The dates and the place on one employment role: what a stored role means, and what a save is allowed to write.

An end month and "still current" are never written together. The end wins.

## What this is

| Function | You pass | You get |
|---|---|---|
| `roleMonth` | Anything. | `YYYY` or `YYYY-MM`, or `""`. |
| `fullPlaceIri` | A string, `{ "@id" }`, or anything else, plus the catalogue origin. | A full `http(s)` address, or `""`. |
| `readRole` | The four stored values, plus the origin. | `{ start, end, current, placeId }`. |
| `roleWire` | That object, plus the four attribute names. | `{ set, clear }`. Every name is in one of them. |

## What this is not

- Not the date line on a card. That is `role-when`. A missing end there is not the word Present unless the holder said current. This unit is the stored facts, not the sentence.
- Not a place search. A bare name such as `Oslo` is `""`. It is not looked up.
- Not a request. Nothing is loaded or saved.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-role`

```ts
import { readRole, roleWire } from "@kaigilb/gilbplatformcode-employment-role";
```

Path: `units/employment-role/`.

## Months

`roleMonth` accepts `2011` and `2019-03`. It rejects `2019-3` (the month must be two digits), `2019-13`, `2019-03-01`, a number, and blank. The result is the trimmed input when it matches. It is not reformatted.

## Current

On the way out (`readRole`): current is the boolean `true` on `ongoing`, and only when the end is not a readable month. The string `"true"` is not current. A garbage end (`"soon"`) is not an end, so ongoing true with that garbage still reads as current. Ongoing true together with `2023-06` reads as not current.

On the way in (`roleWire`):

| `end` readable? | `current` | Written |
|---|---|---|
| yes | true or false | end set, ongoing cleared |
| no | true | ongoing `true`, end cleared |
| no | false | ongoing `false`, end cleared |

A start that is not a month is cleared. It is not written as the bad text.

## Place

`fullPlaceIri` returns an address that already starts with `http://` or `https://` unchanged. It does not trim it. A leading space fails.

`base:e/<one segment>` becomes `<origin>/base/e/<id>`. Trailing slashes on the origin are removed, then one slash is inserted. Pass the origin only. An origin that already ends in `/base` doubles that segment.

`roleWire` does not expand. It writes `{ "@id": placeId }` only when the trimmed place is `http://` or `https://` with no spaces. A compact `base:e/…` is cleared. Call `fullPlaceIri` first, then pass that result as `placeId`.

## What the host must supply

The catalogue origin, and the four attribute names (`RoleAttrs`). This unit does not pick the names. The app passes the names it was given for start, end, ongoing, and work location.

## Do not

- Do not write `ongoing: true` in the same patch as an end month. This function will not. Do not add it back at the call site.
- Do not save a compact place id. Expand it, or clear it.
- Do not treat `""` from `fullPlaceIri` as "the place is the empty address". It means the value was not an address this function knows.

## Wrong readings

- "`current: true` in the editor is what gets stored when an end is also filled in." No. The end is stored and ongoing is cleared.
- "A year-month-day is a better month." It is rejected. The stored shape is `YYYY` or `YYYY-MM`.

## Where it came from

MyNetBase `src/model/employmentRole.ts`: `roleMonth`, `fullPlaceIri`, `roleWire`, `readRole`.
