# owned-claim

Which already-read claims belong to one employment, and the title token inside a slot.

## What this is

`claimsForEmployment(claims, empKey)` returns the company claim whose slot is exactly `empKey`, and the job-title claims whose slot starts with `empKey` plus a colon.

`titleTokenOfSlot(slot, empKey)` returns `slot.slice(empKey.length + 1)`.

## What this is not

- Not the slot builder. Building `emp1` and `emp1:t0` is `units/claim-slot`. These two functions only select and slice. They must stay in agreement with that spelling: company slot is the key itself, job-title slot is `key + ":" + token`.
- Not a move, and not a proof that a move happened. The proof object cannot be copied into a library. It is identity in the app module that minted it.
- Not a trimmer, and not a checker that the slot starts with the key you passed.

## How to take it

Package: `@kaigilb/gilbplatformcode-owned-claim`

```ts
import { claimsForEmployment, titleTokenOfSlot } from "@kaigilb/gilbplatformcode-owned-claim";

const mine = claimsForEmployment(claims, empKey);
const token = titleTokenOfSlot(mine[0].slot, empKey);
```

## What you pass

Each claim has `kind` and `slot` strings. Other fields are kept on the same object.

`empKey` is the employment key, as stored. It is not trimmed.

## What you get

`claimsForEmployment`:

- kind `company` and `slot === empKey` — kept
- kind `job-title` and `slot` starts with `empKey + ":"` — kept
- kind `skill`, or any other kind — dropped, even when the slot text matches
- a company slot of `emp1:t0` — not a company match for `emp1`. Exact equality only
- a company slot of `"emp1 "` — not a match for `"emp1"`
- an empty `empKey` matches a company slot of `""` and a job-title slot that starts with `:`

Order is kept. The objects are the same objects, not copies.

`titleTokenOfSlot("emp1:t0:extra", "emp1")` is `"t0:extra"`. The second colon stays. This matches a single slice, not a split that stops at the next colon.

`titleTokenOfSlot` does not look for the key. `titleTokenOfSlot("emp1:t0", "zz")` is `"1:t0"`. `titleTokenOfSlot("emp1:t0", "")` is `"mp1:t0"`. Pass the key that owns the slot.

## Do not

- Do not split the title on every colon. A title token may contain colons.
- Do not treat a failed slice as "no title". A wrong key still returns a string.
- Do not use this to decide the kind of a new claim. Kind is exact, and `org` / `title` are not field-row kinds. That decision is `units/claim-slot`.

## Wrong readings

- "The function checks that the slot belongs to this employment before it slices." No. Selection and slicing are two functions. Call `claimsForEmployment` first if you need the check.
- "An empty employment key matches nothing." No. It matches an empty company slot and a title slot that starts with a colon.

## Where it came from

MyNetBase `src/lib/base/employmentClaimMove.ts` — `claimsForEmployment`, `titleTokenOfSlot`. The move itself stayed in the app.
