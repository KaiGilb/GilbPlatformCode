# facet-errors

The failures of one people search, as one string, or null when there were none.

## What this is

`facetErrorText` reads three fields, in this order, and no others:

1. `nameError`
2. `skillError`
3. `placeError`

Null, undefined, and `""` are dropped. A string of spaces is kept. Nothing is trimmed. The kept strings are joined with ` · ` (space, middle dot U+00B7, space). One failure has no dot. No failures returns null, not an empty string.

## What this is not

- Not a search, and not a decision that an empty result is a failure. An empty list with null errors is a real empty result. Show the empty state.
- Not a place-catalogue flag. Some results also say the place catalogue cannot be asked. That is an answer, not a failure. This function does not read that flag. Do not add it. Showing it as an error hides the empty state.
- Not a sentence you compose at each screen. Three screens that each pick two of the three fields will disagree the next time a fourth facet exists. Add the fourth field here, in one place.

## How to take it

Package: `@kaigilb/gilbplatformcode-facet-errors`

```ts
import { facetErrorText } from "@kaigilb/gilbplatformcode-facet-errors";

const line = facetErrorText({ nameError, skillError, placeError });
```

Path: `units/facet-errors/`.

## Examples

```ts
facetErrorText({ nameError: "name", skillError: "", placeError: "place" });
// "name · place"

facetErrorText({ skillError: "skill" });
// "skill"

facetErrorText({ nameError: null, placeError: "" });
// null

facetErrorText({ placeError: " " });
// " "
```

## What the host must supply

The three error strings from the search you already ran. Pass null for a facet that was not run or that succeeded. Do not pass "no matches" as an error.

## Do not

- Do not treat null as `""` and render a blank error line. Null means show no error.
- Do not trim. A space is a string the caller stored. This function does not know it was accidental.
- Do not reorder the fields. Name, then skill, then place.
- Do not fold a "catalogue cannot be asked" flag into this string.

## Wrong readings

- "Null means the search failed and the message was lost." Null means that facet did not fail.
- "A space-only error is dropped." It is not. Only `""`, null, and undefined are dropped.
- "This function searches." It joins strings you already have.

## Where it came from

MyNetBase `facetErrorText` in `src/lib/base/findPeople.ts`.
