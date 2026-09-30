# claim-handle

Two kinds of token for an employment or a title, and the wall between them.

A position in a list is `emp1`, `emp2`, `t0`, `t1`. An identity that must survive a reorder is `empx-` plus random text. Those strings must never be the same token. A later read that derives `emp1` from "first row" will point at the wrong employment if `emp1` was also stored as an identity.

## What this is

| Function | You pass | You get |
|---|---|---|
| `isPositionalHandle` | A string. | True for `emp` plus digits, or `t` plus digits, whole string. |
| `isMintedHandle` | A string. | True when it starts with `empx-` or `ttlx-`. The rest is not checked. |
| `positionalEmploymentHandle` | A whole number, 1 or more. | `emp1`, `emp2`, … Throws otherwise. |
| `positionalTitleHandle` | A whole number, 0 or more. | `t0`, `t1`, … Throws otherwise. |
| `mintEmploymentHandle` | An optional function that returns the tail. | `empx-` plus that tail, after the minted check. |
| `nextFreeEmploymentHandle` | Keys already used, and keys still reserved. | The next `empN` in neither set. |
| `nextFreeTitleHandle` | Title keys already used. | The next `tN`, starting at `t0`. |
| `assertMintedHandle` / `assertPositionalHandle` | A string. | Nothing, or a throw. They do not return false. |

The throw type is `DisjointTokenSpaceViolation`.

## What this is not

- Not a title minter. There is no `mintTitleHandle`. `ttlx-` is recognised so a title token from another writer is still refused as a position. Do not add a minter here.
- Not the employment dates. That is `employment-role`.
- Not the old `orgName2` keys. That is `legacy-employment-key`.
- Not a vault write. The caller stores the string.

## How to take it

Package: `@kaigilb/gilbplatformcode-claim-handle`

```ts
import {
  mintEmploymentHandle,
  nextFreeEmploymentHandle,
  positionalTitleHandle,
} from "@kaigilb/gilbplatformcode-claim-handle";
```

Path: `units/claim-handle/`.

The app calls the free-key helpers `nextEmploymentKey` and `nextTitleKey`, and passes keys from the profile model. Here you pass the sets yourself.

## What you pass

For a new identity, call `mintEmploymentHandle`. Tests may pass a tail function. Production should pass nothing, so the tail comes from `crypto.getRandomValues`. Do not pass `Math.random`.

For the next positional slot, pass every key that is spoken for. `reserved` is not a cache. A delete that failed can leave `emp1` live. If you only pass the keys still on the model, the next employment is `emp1` again and lands on the old claim.

Indexes must be whole numbers. `1.5`, `NaN`, and `Infinity` throw. Employment starts at 1. Title starts at 0. `t0` is a real title slot, not a missing one.

## What you get

`emp` plus digits, or `t` plus digits, or `empx-` plus the tail. `emp` alone is not positional. `empx-` alone is minted. `emp1` is not minted.

The checks throw. A boolean a caller can ignore is not the guard. Catch `DisjointTokenSpaceViolation` only to stop the save. Do not store the token that threw.

## Examples

```ts
positionalEmploymentHandle(1); // "emp1"
positionalTitleHandle(0);      // "t0"
mintEmploymentHandle(() => "fixed"); // "empx-fixed"
nextFreeEmploymentHandle(new Set(["emp1"]), new Set(["emp2"])); // "emp3"
isPositionalHandle("empx-abc"); // false
isMintedHandle("ttlx-t0");      // true
```

## What the host must supply

The sets of keys it already knows about, including keys a failed withdrawal may still hold. And a place to store the minted string. This unit does not remember them.

## Do not

- Do not build `` `emp${n}` `` at the call site. Use the function, so a fractional index cannot slip through.
- Do not store a positional token as the identity of an employment.
- Do not treat `ttlx-` as dead just because this unit does not mint titles. The exclusion has to recognise it.
- Do not omit `reserved`.

## Wrong readings

- "emp1 and empx-1 are obviously different, so the assert is decorative." The assert is the wall. Softening it to a warning is how the collision comes back.
- "The next free key is the next number after the ones on screen." Keys that are not on screen can still be reserved.
- "t0 means no title." It means the first title slot.

## Where it came from

MyNetBase `src/model/employmentHandle.ts`. The free-key loops are the same loops as `nextEmploymentKey` and `nextTitleKey` in `src/model/profile.ts`, with the sets passed in so this folder does not need the profile model.
