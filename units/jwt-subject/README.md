# jwt-subject

The `sub` string inside a token the caller already holds. The signature is not checked.

## What this is

`subFromJwt(jwt)` decodes the middle segment and returns `sub` when that claim is a string.

The app uses this only to pre-fill an email box from a token it just received from its own sign-in. The server, not this function, decided that the token was acceptable.

## What this is not

- Not a verifier. A tampered signature still returns `sub` when the middle segment parses.
- Not an access decision. Do not grant, deny, or choose a vault from this string.
- Not an email parser. A `sub` that is not an email is still returned. The app's own email-shaped test stays in the app.
- Not a trimmer. Spaces in `sub` stay.

## How to take it

Package: `@kaigilb/gilbplatformcode-jwt-subject`

```ts
import { subFromJwt } from "@kaigilb/gilbplatformcode-jwt-subject";

const sub = subFromJwt(accessToken);
```

## What you pass

The whole token string: three segments separated by `.`. Only the middle segment is read.

## What you get

A string, or `undefined`.

- Missing `sub`, a number, or `null` is `undefined`.
- An empty token, a token with no middle segment, or a middle segment that is not JSON is `undefined`.
- The third segment is ignored. Changing it does not change the result.
- The middle segment is base64url. `-` becomes `+`, `_` becomes `/`, then `=` is added so the length is a multiple of 4. The padding length is counted from the original segment.

## Host must supply

A token it already holds. This unit does not ask for one.

## Do not

- Do not show this string as "who is signed in" without the session the server returned.
- Do not treat `undefined` as "the token was refused". It only means `sub` could not be read as a string.
- Do not log the whole token in order to use this. Pass the token in, keep the return value, and do not print the token.

## Wrong readings

- A successful return is not proof. Anyone can build a middle segment.
- `"  a@b.example  "` comes back with the spaces. Do not trim it here and then claim the app did.
- This does not read an `email` claim. Only `sub`.

## Source

MyNetBase `src/lib/base/token.ts`, `subFromJwt`. The private email-shaped test next to it was not copied.
