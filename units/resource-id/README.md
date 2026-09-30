# resource-id

The opaque id at the end of a resource address. An address that is not one of the three shapes is returned unchanged.

## What this is

`idFromResourceUri(uri)` reads the id from:

- `/lws/r/<id>`
- `/base/e/<id>` or `/vault/e/<id>`
- `base:e/<id>` at the start of the string

The id must finish the string. It is not decoded. Nothing is trimmed.

## What this is not

- Not the id-tail unit. id-tail's `slashTail` always returns the last segment and keeps a query on that segment. `uriTail` strips the query and decodes, and a broken `%` is caught. This function does neither. A string that does not match is returned whole, not as a tail.
- Not a check that the resource exists.
- Not a decoder. `a%20b` stays `a%20b`.

## How to take it

Package: `@kaigilb/gilbplatformcode-resource-id`

```ts
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";

const id = idFromResourceUri(uri);
```

## What you pass

The address string, whole.

## What you get

The id, or the same string.

| Input | Result |
|---|---|
| `https://h.example/lws/r/abc` | `abc` |
| `https://h.example/base/e/abc` | `abc` |
| `https://h.example/vault/e/abc` | `abc` |
| `base:e/abc` | `abc` |
| `https://h.example/base/e/abc?x=1` | the whole string |
| `base:e/abc/extra` | the whole string |
| `BASE:e/abc` | the whole string |
| `not-an-address` | `not-an-address` |

`base:e/` is lowercase only. A query or a hash after the id means "not this shape".

## Host must supply

The address. If you need the id from a string this function returns unchanged, you do not have one of these three shapes. Do not then take the last path segment and call it the same id.

## Do not

- Do not decode the id here. A broken `%` is not this function's problem, because it does not decode. id-tail's `uriTail` catches a broken `%`. type-curie throws. Leave those as they are.
- Do not treat a returned string that still contains `/` as an id. That means the input did not match.

## Wrong readings

- A query is not stripped. The whole address comes back. That is how a caller can see that it did not match.
- `/base/e/abc/extra` does not match, because the id would have to include `/` or the match would not reach the end.

## Source

MyNetBase `src/lib/base/lws.ts`, `idFromResourceUri`.
