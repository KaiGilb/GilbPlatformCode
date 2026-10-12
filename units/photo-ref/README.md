# photo-ref

Which file a stored photo reference names, and the absolute address its bytes live at, on the door the record was read through.

## What this is

A stored profile photo is a short text value. These functions turn it into "which file, on which host".

| Function | Returns |
|---|---|
| `fileIdFromPhotoRef(ref)` | the file id in `/files/<id>`, `…/base/e/<id>`, `…/vault/e/<id>`, or a bare opaque id of 8 characters or more. The id is percent-decoded. Null for anything else, and for a mediated route. |
| `isMediatedPhotoRef(ref)` | true when the reference is the server-mediated `/base/connect/profile-photo` route, which answers with bytes for a person the viewer may see. Case-insensitive. |
| `photoRefOrigin(ref)` | the origin the reference carries itself, or null when it is host-less |
| `photoBytesUrl(ref, door)` | the absolute URL of the bytes. A reference with its own origin is returned as it is. A host-less one is joined to `door`. No door, no URL. |
| `entityIdTail(uriOrId)` | the trailing id of an entity or `/lws/r/` record URI on either vault segment. Empty for a WebID tail (`…/i`), a bare vault root, or a tail shorter than 8 characters. |
| `vaultSegmentOf(entityUri)` | `/vault` or `/base`, read off the URI; `/base` when there is no URI to read |

`VAULT_PATH_SEGMENTS` (`["base", "vault"]`) and `VAULT_SEGMENT_PATTERN` are the one place the two live segments are written.

## What this is not

- Not a fetch, and not an authorization header.
- Not `photo-location`. That unit rewrites a location the photo view already holds to a vault-relative `/files/<id>` path. This unit reads a stored reference into a file id and an absolute URL on a door. They differ on purpose, case by case:

| Input | `photo-location` `normalizePhotoLocation` | `photo-ref` |
|---|---|---|
| `note/e/abc` | `/files/abc` (any segment before `e/`) | `fileIdFromPhotoRef` null (only `base` or `vault`) |
| `https://h/base/connect/Profile-Photo` | not mediated (case-sensitive, must end or `?`) | mediated (case-insensitive, word boundary) |
| `https://h/files/a%20b?x=1` | `/files/a%20b` (query dropped, id not decoded) | id `a b`; `photoBytesUrl` returns the reference as it is |
| `abcdefgh` (bare id) | unchanged | id `abcdefgh` |

- Not the photo's access level. A mediated route is recognised, not checked.

## How to take it

Package: `@kaigilb/gilbplatformcode-photo-ref`

```ts
import { photoBytesUrl } from "@kaigilb/gilbplatformcode-photo-ref";

const url = photoBytesUrl(storedRef, originOfTheVaultYouReadItFrom);
if (url) {
  // fetch it, with whatever authorization that path needs
}
```

## What you pass

The stored reference string, and for `photoBytesUrl` the origin of the vault the record was read from.

## What you get

Strings or null, as in the table. Null means "this names no file I can address", never "the photo was deleted".

## Host must supply

The door: the origin of the vault the reference was read from.

## Do not

- Do not inline a `(base|vault)` alternation at a call site. Import `VAULT_SEGMENT_PATTERN`. Copies of that alternation drifted once, and a face painted blank with no error.
- Do not pass the app's default origin as the door. A host-less reference lives in the holder's vault; the apex answers 404, which looks exactly like a deletion.
- Do not feed a mediated route to the file loader. It is not a file path.

## Wrong readings

- A reference with its own origin keeps its query in `photoBytesUrl`. Only `fileIdFromPhotoRef` strips to the id.
- `entityIdTail` refuses a tail under 8 characters, so a short real id reads as empty.

## Source

`photoRef.ts` from the private `gilb-photo` package.
