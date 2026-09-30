# place-lines

Which street text and which place ids an address still holds. A street stored on a field wins even when that street is blank.

## What this is

An address can still be one composite, or a composite plus one field per street or place. Both shapes exist together until a save moves the address. These functions read the shape you already have. They do not save, and they do not decide who can see the address.

| Function | What it answers |
|---|---|
| `boundPlaceIds` | Country, then region, then city, from one picked place. |
| `claimStreetLine` | The street to show. |
| `claimPlaceIds` | The place ids to show. |
| `isDecomposed` | Whether any field claim exists. |
| `needsFieldMigration` | Whether the composite itself still holds a street or a place id. |

## What this is not

- Not a search, and not the list of who can see a field. `place-clear` clears rungs on a draft. This unit reads a stored address.
- Not a migration. `needsFieldMigration` only says the composite still carries something. The host does the write.
- Not a trim of place ids. A street on the composite is trimmed only inside `needsFieldMigration`, and only to decide yes or no. The street you show is not trimmed.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-lines`

```ts
import {
  boundPlaceIds,
  claimPlaceIds,
  claimStreetLine,
  isDecomposed,
  needsFieldMigration,
} from "@kaigilb/gilbplatformcode-place-lines";
```

Path: `units/place-lines/`.

## Rules that are easy to invert

`boundPlaceIds` drops a missing rung, a null rung, a non-string, and `""`. A string of spaces is kept. Order is country, region, city. Not city first.

`claimStreetLine` finds the first field whose subject is exactly `street`. `"Street"` does not count. If that field exists, its street is the answer, including `""`. The composite street is not a fallback for a blank field. No street field means the composite street.

`claimPlaceIds` collects fields whose subject is exactly `place` and whose place id is not null. `""` is kept. If that list has any member, `memberOf` is not used, even when the only id is blank. Otherwise `memberOf` is copied into a new array. Ids are not deduped and not trimmed.

`isDecomposed` is true when `fields` is non-empty. A blank street field counts.

`needsFieldMigration` does not look at fields. It is true when the composite street trims to something, or `memberOf` has any member, including `""`. A whitespace-only composite street is not a reason. An address whose street and places live only on fields is false here, which is what you want: there is nothing left on the composite to move.

## Examples

```ts
boundPlaceIds({ country: { id: "c" }, region: { id: "" }, city: { id: "city" } });
// ["c", "city"]

claimStreetLine({
  streetLine: "composite",
  memberOf: [],
  fields: [{ subject: "street", streetLine: "", placeId: null }],
});
// ""

claimPlaceIds({
  streetLine: "",
  memberOf: ["legacy"],
  fields: [{ subject: "place", streetLine: "", placeId: "" }],
});
// [""]

needsFieldMigration({ streetLine: "  ", memberOf: [] }); // false
needsFieldMigration({ streetLine: "", memberOf: [""] }); // true
```

## What the host must supply

The claim, with `streetLine`, `memberOf`, and `fields`. Who may see each field. The write that moves a composite onto fields. This unit will not drop a street from a find path, and it will not add one.

## Do not

- Do not fall through to the composite when the street field is blank.
- Do not treat `""` as "no place id". Null means no place id. `""` is an id that is blank.
- Do not make `needsFieldMigration` look at fields. A field is already migrated.

## Wrong readings

- "Blank street means use the old street." It means the field street is blank.
- "Migration is needed whenever fields exist." Fields existing is `isDecomposed`. Migration looks at the composite only.
- "Place ids are fine to city." They are country, then region, then city.

## Where it came from

MyNetBase `boundPlaceIds`, `claimStreetLine`, `claimPlaceIds`, `isDecomposed`, and `needsFieldMigration` in `src/lib/base/placeClaim.ts`.
