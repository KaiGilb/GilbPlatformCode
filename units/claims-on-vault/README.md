# claims-on-vault

Which claims belong on this seat vault.

## What this is

`claimsOnVault(claims, vaultId)` returns a new array.

- The seat is trimmed. Null, undefined, `""`, and a string of spaces are no seat. You get every claim, in the same order, as a new array. The claim objects are the same objects.
- A seat that trims to something keeps a claim when `vaultId` is missing, or when `vaultId` is `""`, or when `vaultId` is exactly the trimmed seat.
- A claim's `vaultId` is not trimmed. `" seat "` does not match a seat of `"seat"`. It also does not match a seat of `" seat "`, because the seat was trimmed to `"seat"` before the comparison. That claim is dropped whenever a seat is present.
- Other vault ids are dropped.
- Order is kept. Duplicates are kept. The input array is not changed.

## What this is not

- Not a photo reader and not a photo writer. The group-photo fetch stays in the app.
- Not a check that the vault exists.
- Not a copy of the claim bodies. The same object references come back. Do not mutate them if the caller still holds the input.

## How to take it

Package: `@kaigilb/gilbplatformcode-claims-on-vault`

```ts
import { claimsOnVault } from "@kaigilb/gilbplatformcode-claims-on-vault";

const mine = claimsOnVault(claims, seatVaultId);
```

Path: `units/claims-on-vault/`.

The claim type must mention `vaultId` as an optional string. A type that never names that field is refused by the type checker, even though a missing value at runtime would be kept. Add `vaultId?: string` to the type, or pass objects whose type already has it. Extra fields stay on the objects.

## Examples

```ts
claimsOnVault(
  [
    { id: "h", vaultId: "seat-a" },
    { id: "l" },
    { id: "b", vaultId: "" },
    { id: "o", vaultId: "seat-b" },
    { id: "p", vaultId: " seat-a " },
  ],
  "seat-a",
).map((claim) => claim.id);
// ["h", "l", "b"]

claimsOnVault([{ id: "p", vaultId: " seat-a " }], " seat-a ");
// []
```

## What the host must supply

The claims you already loaded, and the seat vault id for the vault you are showing. Pass undefined when you do not know the seat yet. That shows every claim, which is what the app does, rather than showing none.

## Do not

- Do not trim claim ids before calling if you need the app's answer. The mismatch above is the answer.
- Do not treat a blank seat as "show nothing". It shows everything.
- Do not treat a missing `vaultId` on a claim as "another vault". It stays.

## Wrong readings

- "Spaces around the seat and spaces around the claim cancel out." Only the seat is trimmed.
- "An empty claim vault id is a different vault." It is kept.
- "The result is a deep copy." It is a new array of the same objects.

## Where it came from

MyNetBase `claimsOnVault` in `src/lib/base/groupPhoto.ts`. The photo read and write stay in the app.
