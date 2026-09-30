# place-field-kind

Whether one address field is a street, a place, or not a field this reader can use.

## What this is

`placeFieldKind(streetLine, placeId)` returns `"street"`, `"place"`, or null.

| Street | Place id | Result |
|---|---|---|
| `""` | `null` | `null` |
| non-empty | not null | `null` |
| `""` | not null, including `""` | `"place"` |
| non-empty | `null` | `"street"` |

Null means do not treat the row as either kind. Two different nulls:

- Both empty: there is no street and no place. It is not an address field.
- Both filled: the row carries a street and a place. Do not pick a side. They would share one audience, and showing one would show the other.

Empty street means the exact string `""`. A string of spaces is a street. Nothing is trimmed. `""` as a place id is not null, so with an empty street the kind is `"place"`.

## What this is not

- Not who can see the field. An unknown audience is not turned into a default here.
- Not the street text or the place ids of a whole address. That is `place-lines`.
- Not a save. The host already read the two values. This is only the fork.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-field-kind`

```ts
import { placeFieldKind } from "@kaigilb/gilbplatformcode-place-field-kind";

const kind = placeFieldKind(streetLine, placeId);
if (kind === null) {
  // do not render it as a street or a place
}
```

Path: `units/place-field-kind/`.

## Examples

```ts
placeFieldKind("Road", "place-1"); // null
placeFieldKind("", null); // null
placeFieldKind("", "place-1"); // "place"
placeFieldKind("Road", null); // "street"
placeFieldKind(" ", null); // "street"
placeFieldKind(" ", "place-1"); // null
placeFieldKind("", ""); // "place"
```

## What the host must supply

The street string and the place id you already read. Null place id means the read found no place. Do not pass `""` for that. `""` means a place id that is blank, and the kind is still place when the street is empty.

## Do not

- Do not choose `"street"` when both are present because the street is what the person sees first.
- Do not trim before calling if you need the same answer as the app. The app does not trim these two values before this fork.
- Do not treat null as `"street"` so the row still renders.

## Wrong readings

- "Null means street, because a place would have had an id." Null also means both were present. Check the inputs if you need to tell the two nulls apart. The function will not.
- "`""` place id means no place." It means a blank id, and the kind is `"place"` when the street is empty.
- "Spaces are an empty street." They are not.

## Where it came from

The fork inside MyNetBase `toPlaceFieldClaim` in `src/lib/base/placeFieldClaim.ts`. The audience default beside that fork is not included.
