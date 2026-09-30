# credential-surface

Whether an error must be shown to the person, instead of being turned into a shorter list. Five names, exact. A different error is not one of them.

## What this is

`isCredentialSurfaceError(error)` is a gate for the connections list. A credential failure, a refused credential, an expired credential, a public-card viewer mismatch, or an origin that is not allowed must stay visible. Collapsing any of those into "this person has no connections" is the bug this function exists to stop.

True means: rethrow, or show the failure. Do not drop the row and continue as if the list were complete.

False means: this function does not recognise the error. It does not mean the error is harmless. The host still decides. The "not a person" ruling is false here on purpose. It has its own unit.

## What this is not

- Not the not-a-person unit. `PublicCardError` is false here. A group that the server says is not a person leaves the people list by that other check. Do not add that name to this set.
- Not the contact-card copy. The card module has a private function of the same shape that also accepts `ContactCardReachError`. This unit is the connections-list function. That sixth name is absent on purpose. Do not add it to make the two copies match. A card screen that needs the sixth name must not pretend this set includes it.
- Not a message builder. It does not turn the error into a sentence.
- Not an `instanceof` test. Only `error.name` is read. The prototype chain of the error class is not walked, except that the `in` operator sees an inherited `name`.
- Not a sign-in check. It does not look at a session, a cookie, or a token.

## How to take it

Package: `@kaigilb/gilbplatformcode-credential-surface`

```ts
import { isCredentialSurfaceError } from "@kaigilb/gilbplatformcode-credential-surface";

if (isCredentialSurfaceError(error)) throw error;
```

## What you pass

`unknown`. Anything the `catch` clause gave you.

## What you get

A boolean. True only when all of these hold:

- `error` is truthy
- `typeof error === "object"`
- `"name" in error`
- `error.name` is a string
- that string is exactly one of:
  - `NotSignedInError`
  - `CredentialRefusedError`
  - `CredentialExpiredError`
  - `PublicCardViewerMismatchError`
  - `OriginNotAllowedError`

| Input | Result |
|---|---|
| `{ name: "NotSignedInError" }` and the other four names | `true` |
| `{ name: "PublicCardError" }` | `false` |
| `{ name: "ContactCardReachError" }` | `false` |
| `{ name: " notsignedinerror " }` or `"notsignedinerror"` | `false` |
| `"NotSignedInError"` as a bare string | `false` |
| `null`, `undefined`, `{}`, `{ name: 1 }` | `false` |

The name is not trimmed and not folded.

## Examples

```ts
isCredentialSurfaceError({ name: "CredentialExpiredError" }); // true
isCredentialSurfaceError({ name: "PublicCardError" });        // false
isCredentialSurfaceError("NotSignedInError");                 // false
```

## Host must supply

The error object, with the `name` string the client already set. This function does not classify HTTP status codes. A `401` with no matching `name` is false. If the host only has a status, it must set the name itself before the call, or handle the status outside this function.

## Do not

- Do not treat false as "show an empty list". False includes network failures, decode failures, and the not-a-person ruling. Those are different branches.
- Do not lowercase the name before the call. `notsignedinerror` is not a match, and folding it would hide a typo that should stay visible as an unknown error.
- Do not add `PublicCardError` or `ContactCardReachError` in the host by wrapping this function and calling the result "the same check". Say which list the check belongs to.
- Do not read `error.message` here. The words in the message are not the gate.

## Wrong readings

- A string that equals one of the five names is still false. The value has to be an object with that `name`.
- An object whose `name` is a number is false, even when the number is truthy.
- Silence is not a credential error. `{}` is false. The host must not invent `NotSignedInError` just because a list came back empty.
- This does not say the person is signed out. It says the object is one of the five failures that must not be swallowed. `CredentialRefusedError` is not the same sentence as `NotSignedInError`. The host keeps the original error.

## Source

MyNetBase `src/lib/base/myConnections.ts`, `isCredentialSurfaceError`.

Not `src/lib/base/contactCard.ts`. That private function adds `ContactCardReachError` and is a different surface.
