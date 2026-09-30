# photo-location

Whether a photo address is ready to show, and the file path a stored location becomes.

## What this is

`isReadyPhotoSrc(location)` is true for a `blob:` or `data:` address.

`isMediatedProfilePhotoUrl(location)` is true for the rung-gated profile-photo path.

`normalizePhotoLocation(location)` turns a file address or an entity address into `/files/<id>`, and leaves a mediated address alone.

## What this is not

- Not a fetch, and not an authorization header.
- Not an entitled photo URL. Building that URL stays in the app.
- Not the raw-files-path unit. That unit says whether a value is a raw file path. This unit rewrites a location the photo view already holds.
- Not a decoder.

## How to take it

Package: `@kaigilb/gilbplatformcode-photo-location`

```ts
import {
  isReadyPhotoSrc,
  isMediatedProfilePhotoUrl,
  normalizePhotoLocation,
} from "@kaigilb/gilbplatformcode-photo-location";

if (isReadyPhotoSrc(location)) {
  // show it; do not fetch it again
}
const src = normalizePhotoLocation(location);
```

## What you pass

The location string the document or the upload already returned. `isReadyPhotoSrc` also accepts `undefined`.

## What you get

`isReadyPhotoSrc` trims. Undefined is false. `blob:` and `data:` are case-sensitive. `BLOB:` is false.

`isMediatedProfilePhotoUrl` trims, then looks for `/base/connect/profile-photo` followed by `?` or the end. A trailing slash does not match. Case-sensitive. The query is not read, only allowed.

`normalizePhotoLocation`, in this order:

1. Trim. Empty stays empty.
2. A mediated address is returned as trimmed, query included. It is not rewritten to `/files/<id>`.
3. A string that already starts with `/files/` is returned as trimmed.
4. An absolute `http://` or `https://` URL, either case, whose path starts with `/files/`, returns the pathname only. The query is dropped.
5. A string that ends in `/e/<id>` or `/base/e/<id>`, optional trailing slash, becomes `/files/<id>`. A query means this arm does not match, and the trimmed original is returned. This arm is wide: `note/e/abc` becomes `/files/abc`.
6. Anything else is the trimmed original.

```ts
normalizePhotoLocation("https://h.example/files/abc?x=1"); // "/files/abc"
normalizePhotoLocation("https://h.example/base/e/abc");    // "/files/abc"
normalizePhotoLocation("https://h.example/base/e/abc?x=1"); // unchanged
normalizePhotoLocation("https://h.example/base/connect/profile-photo?p=1"); // unchanged
```

## Host must supply

The location. The bytes stay a fetch in the app, with whatever authorization that path needs.

## Do not

- Do not fetch a `blob:` address again. That second fetch is the bug this ready-check exists for.
- Do not rewrite a mediated profile-photo URL to `/files/<id>`. The query names the person. Stripping it asks for the wrong bytes.
- Do not assume step 5 only matches `/base/e/`. `/vault/e/<id>` matches because `base/` is optional in front of `e/`.

## Wrong readings

- An absolute `/files/` URL drops the query. An entity URL with a query is not rewritten. Those are different on purpose.
- `https://h.example/files/e/abc` is already a `/files/` path, so it stays `/files/e/abc`. It is not passed to the entity arm.

## Source

MyNetBase `src/lib/base/fileStore.ts`, `isReadyPhotoSrc`, `isMediatedProfilePhotoUrl`, and `normalizePhotoLocation`.
