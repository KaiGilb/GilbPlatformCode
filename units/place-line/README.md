# place-line

One line of place names the host has already resolved.

## What this is

`placeLine(places)` joins `label` with a space, a middle dot (U+00B7), and a space.

- No places is `""`.
- One place is the label alone. There is no dot.
- Order is the order you pass. Nothing is sorted.
- A blank label is kept. `""` then `"Oslo"` is ` · Oslo` with the dot still there.
- Labels are not trimmed. `"  Oslo  "` stays `"  Oslo  "`.
- Extra fields on the object are ignored. Only `label` is read.

## What this is not

- Not a count. Do not substitute "2 places" when the names have not arrived. Wait, or pass the names you have.
- Not a fetch. Ids that failed to resolve are the host's problem. This function will not drop them, because it never sees the ids. If you pass a blank label for a failure, the blank is shown.
- Not the card heading. City, region, and country headings are `place-display`.
- Not a sentence about an unnamed person.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-line`

```ts
import { placeLine } from "@kaigilb/gilbplatformcode-place-line";

const line = placeLine(places);
```

Path: `units/place-line/`.

Pass the labels in the order the address stores them. The app uses coarse to fine as stored. This unit does not reorder.

## Examples

```ts
placeLine([{ label: "Oslo" }, { label: "Norway" }]); // "Oslo · Norway"
placeLine([{ label: "Oslo" }]); // "Oslo"
placeLine([]); // ""
placeLine([{ label: "" }, { label: "Oslo" }]); // " · Oslo"
```

The dot in the first example is U+00B7, not a hyphen, a bullet, or the word "and".

## What the host must supply

The labels you already resolved. While the read is in flight, do not call this with an empty list and render "no places". An empty list is a real empty answer. The app uses null for "not loaded yet" and only calls this once it has a list. Keep that distinction in the host.

## Do not

- Do not join with a comma, a slash, or an ASCII middle dot from another code point. The character is U+00B7.
- Do not trim unless you mean to change what was resolved.
- Do not drop blanks here. Drop a failed id before you build the list, if that is what you mean.

## Wrong readings

- "Empty string means still loading." It means the list you passed was empty.
- "One name gets a trailing dot." It does not.
- "The function sorts country first." It does not.

## Where it came from

MyNetBase `placeLine` in `src/lib/geo/usePlaceNames.ts`. The catalogue read stays in the app.
