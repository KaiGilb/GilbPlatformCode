# person-address

Whether a paste should be treated as an address, whether it is already a principal, and whether a connection-list key is a person key.

These four functions do not look anyone up. They do not decide that a vault is a person. A group vault and a person vault can share a path shape. Personhood is the server's answer. This unit only stops the client from picking the wrong route, or from sitting on "resolving" for an address that was already a principal.

## What this is

| Function | True when |
|---|---|
| `isNamedVaultNamespaceUri` | The path is exactly `/base`. |
| `isResolvedPrincipalUri` | The path is `/base/p/<id>`, or exactly `/base`, or exactly `/vault`. |
| `isPersonConnectionKey` | The path is `/base/p/<id>`, or exactly `/i`. |
| `looksLikePersonAddress` | The box should use the address route, not a name search. |

A string that is not a URL is false for the first three. Nothing is thrown.

## What this is not

- Not the resolver. The fetch stays in the app. Do not invent a principal from a name or from the last path segment.
- Not `seat-address`. That one picks a public address off a seat. This one classifies a paste.
- Not `vault-address`. That one asks whether a string is a vault. This one asks which route a search box should take.
- Not a person test. `/base` is a vault namespace. It is also a resolved principal. It is not a person connection key.

## How to take it

Package: `@kaigilb/gilbplatformcode-person-address`

```ts
import { isResolvedPrincipalUri, looksLikePersonAddress } from "@kaigilb/gilbplatformcode-person-address";
```

Path: `units/person-address/`.

## What you pass

The raw string from the box, or a connection-list key. Leading and trailing spaces are removed. One trailing slash on the path is removed. A query is ignored because the path is taken from the URL. The host is not inspected. `https://example.test/BASE` is not `/base`, because the path case is kept.

## What you get

Booleans. Read them separately. They disagree on purpose.

| Paste | Namespace `/base` | Already a principal | Person key | Address route |
|---|---|---|---|---|
| `https://…/base` | yes | yes | no | no |
| `https://…/vault` | no | yes | no | yes |
| `https://…/i` | no | no | yes | yes |
| `https://…/card` | no | no | no | yes |
| `https://…/base/e/abc` | no | no | no | yes |
| `https://…/base/p/Ab_1` | no | yes | yes | yes |
| `Lars Larson` | no | no | no | no |

`looksLikePersonAddress` is true for every `http` or `https` string except a path that is exactly `/base`. A record address is therefore an address paste. Do not narrow this to `/i` and `/card`. The server accepts more than those two, and a record-shaped paste is still not a person's name.

Without a scheme, only three shapes count:

- `/base/p/` plus exactly 36 characters from `0-9`, `a-f`, and `-`. A short id fails this test. The same short id on a full `https` URL can still be a resolved principal, because that test allows any letter, digit, `_`, or `-` and does not check length. Do not make the two patterns match.
- `host/i` or `host/card`, with an optional final slash. `host/i/extra` is false.
- `host/base/p/` plus the same 36-character id.

## What the host must supply

The raw paste. If the address route returns, the host calls its own resolver. This unit will not add `https://` and will not name a host.

## Do not

- Do not treat `/vault` as "not a principal". A person's vault can be `/vault`. An older check that only allowed `/base` left the card spinning.
- Do not put a `/base` vault on the home people list. It is a namespace, not a person key.
- Do not treat `/card` as a person connection key. It is an address paste only.
- Do not lowercase the path before comparing. `/BASE` is not `/base`.

## Wrong readings

- "Already a principal means this is a person." It means there is nothing left to look up. A group vault is also `/base`.
- "The address route found a person." It only chose the route. The server can still refuse.
- "A failed URL should throw." It is false.

## Where it came from

MyNetBase `src/lib/base/resolvePerson.ts`, the four predicates only. `resolvePersonInput` stays in the app because it fetches.
