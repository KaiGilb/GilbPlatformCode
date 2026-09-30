# place-kept

Whether the address that was read back still holds what was written. The audience is not compared.

## What this is

`factsSurvived(kept, written)` returns true or false.

Both sides have a label, a street line, and place ids. Those three are compared. Nothing else is.

## What this is not

- Not the read that finds the street. After an address is split, the street lives on its own field, and a blank field street wins over the old composite. That read is `place-lines`. If you pass the composite here, a good save looks like a loss.
- Not a claim type. Do not pass the whole claim and expect this to pick the field. The parameters are the three strings the accessors already returned.
- Not an audience check. The tier is left out on purpose. It round-trips through a default, so comparing it fails a good save.
- Not a search key. Whether a street may be searched is a different question. This function does not answer it.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-kept`

```ts
import { factsSurvived } from "@kaigilb/gilbplatformcode-place-kept";

const ok = factsSurvived(
  { label: readBackLabel, streetLine: fieldStreet, placeIds: fieldPlaceIds },
  { label: writtenLabel, streetLine: writtenStreet, placeIds: writtenPlaceIds },
);
```

## What you pass

`kept` is what the read-back holds, already taken through the field accessors. `written` is what the save sent.

Place ids are the catalogue ids, not labels. Pass the ids the accessor returned, including duplicates if it returned them. This function collapses duplicates itself.

## What you get

True only when all three match.

Label and street use `String.trim` on both sides. A spaces-only street and an empty street are the same for this check. Do not switch to an exact compare.

Place ids are a set. Order does not matter. `" a "` is not `"a"`, because ids are not trimmed. `["a", "a"]` and `["a"]` match, because a set collapses them.

## Examples

```ts
factsSurvived(
  { label: " Home ", streetLine: "  ", placeIds: ["city", "country"] },
  { label: "Home", streetLine: "", placeIds: ["country", "city", "city"] },
) === true;

factsSurvived(
  { label: "Home", streetLine: "Main", placeIds: ["a"] },
  { label: "Home", streetLine: "Main", placeIds: [" a "] },
) === false;
```

## The host must supply

The accessor results. A loading state is not this function. Do not pass null and expect false. Null is the wrong type. The screen decides what a failed read means, and a failed read is not "the facts were dropped".

## Do not

- Do not compare `kept.streetLine` off the composite when a field street exists. An empty composite against the typed street reports every good save as lost.
- Do not add the visibility tier to the compare.
- Do not join the ids into a string. Order would start to matter, and it does not.

## Wrong readings

- "Spaces in the street should count." They do not, for this check. Both sides are trimmed.
- "Duplicate ids are a different address." They are the same set.
- "False means the server rejected the save." It means the read-back does not hold these three facts. A read that failed never reaches this function.

## Where it was taken from

MyNetBase `src/lib/base/usePlaceClaims.ts`, `factsSurvived`. The accessors it calls (`claimStreetLine`, `claimPlaceIds`, `boundPlaceIds`) stay with the claim. The host runs those first, then calls this.
