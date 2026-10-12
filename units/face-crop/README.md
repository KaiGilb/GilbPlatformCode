# face-crop

A person marks the part of their picture that becomes their face, or uses the whole picture; the wire form of that mark; and the way back from the shown face to the master.

## What this is

Three parts, one meaning: the face crop.

**The surface.** `<FaceCropper source mode busy onUse onCancel>` is a modal sheet over the page. The person drags a square over their face (or moves it with the arrow keys, `+` and `-`), then presses **Use this area** or **Use the whole picture**. The two buttons have equal weight. Cancel and Escape back out without choosing. `onUse(rect)` gets the marked rectangle; `onUse(null)` means "use all of it", never "cancelled". `mode="recut"` changes only the words. Focus moves into the sheet and Tab stays inside it. Styles: `./facecrop.css` (`gp-crop` classes): layout, the selection, and 44 px hit targets. Colours read `--gp-crop-accent`, `--gp-crop-accent-ink`, `--gp-crop-ink`, `--gp-crop-surface`, each with a neutral fallback, so an app sets them from its own tokens.

**The rectangle and its wire form.** A `FaceRect` is `{ x, y, width, height }` as fractions of the displayed picture. `faceQueryValue(rect)` is the `?face=` value: `"whole"` for null, or `"x,y,w,h"` rounded to 6 decimals. `appendFaceQuery(params, rect)` sets it. `rectFromDisplayedBox(box, displayed)` converts a square in displayed pixels; `initialSquare(displayed)` is the centred starting square; `clampFaceRect(rect)` keeps a rectangle inside the picture. A rectangle with a non-finite member (NaN, Infinity) marks nothing: it reads as the whole picture, and `faceQueryValue` sends `whole`.

**The two pictures.** An upload with `?face=` makes a small "lean" face beside the master. From the upload ack:

| Function | Returns |
|---|---|
| `faceEntityFor(ack)` | the lean face's entity when one was stored, else the master's. Never nothing. |
| `faceLocationFor(ack)` | `/files/<id>` of that face |
| `faceFileId(ack, masterFileId)` | the id of that face, given the master's id you already hold |
| `leanFaceNotice(ack)` | a sentence to show when the small copy was not made, else null |

From the shown face's own facts: `masterBehindFace(facts)` reads `a:croppedFrom` (a plain string or an `{"@id": …}` node) and returns the master's URI, or null when this face is not a crop. `canRecut(lookup)` is true only for `{ kind: "master" }`. `fileIdFromEntityUri(uri)` is the last path segment, query and trailing slash removed.

## What this is not

- Not the upload. The transport stays in the app, because apps carry different credentials.
- Not a decoder check. Ask `image-displayable` before opening the surface on a file the browser cannot paint.
- Not a deletion of anything. A re-cut makes a NEW lean face pointing at the SAME master.

## How to take it

Package: `@kaigilb/gilbplatformcode-face-crop`

```tsx
import { FaceCropper, appendFaceQuery, faceLocationFor } from "@kaigilb/gilbplatformcode-face-crop";
import "@kaigilb/gilbplatformcode-face-crop/facecrop.css";

<FaceCropper
  source={file}
  busy={uploading}
  onUse={async (rect) => {
    const params = new URLSearchParams();
    appendFaceQuery(params, rect);
    const ack = await hostUpload(file, params); // the app's own transport
    await hostSetProfilePhoto(faceLocationFor(ack));
  }}
  onCancel={close}
/>;
```

### Installing it into your app

Install it as a copy, not a link, so your app has one copy of React. First put this line in your app's own `.npmrc` (the unit's own `.npmrc` does not apply to your app's install):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/face-crop
```

Every later `npm install` and `npm ci`, CI included, then keeps the copy. Without that line a plain install makes a link, the unit brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist". A one-off `npm install --install-links <path>` works only until the next plain install, and `npm ci` then refuses the lock file.

## What you pass

`source`: a `Blob`/`File`, or the URL of a stored master (the re-cut case). `onUse`, `onCancel`. Optional `mode` (`"new"` or `"recut"`) and `busy` (disables both actions, and Escape, the arrow keys, `+` and `-` do nothing while it is true).

## What you get

A rectangle or null from the surface; strings from the wire and ack functions; a `MasterLookup` is the host's to build: `master`, `none`, or `unknown` when the read failed.

## Host must supply

The upload and the read of the face's entity, with its own credentials; the profile-photo write (see `photo-term` for the spelling); a browser with Pointer Events and `ResizeObserver`.

## Do not

- Do not omit `?face=` when the person skipped the crop. Omitting it is how a document upload says "make no face". Send `whole`.
- Do not point the profile photo at the upload's `Location:` header. That names the master, the full-size original.
- Do not submit `initialSquare` on the person's behalf. It is only where the square starts: a centred square, 80% of the shorter side. If the person presses **Use this area** without moving it, that square is what they chose and it is sent. Only **Use the whole picture** sends `whole`.
- Do not copy width into height to make a "square" rectangle. On a picture that is not square, a square on screen is not square in fractions.
- Do not treat a failed read as "no master". Build `{ kind: "unknown" }`; it offers no re-cut and claims no absence.
- Do not report `linkedToMaster: false` as a failure. The server writes the edge only when the face is strictly smaller than its source.

## Wrong readings

- Escape is cancel, never "use the whole picture".
- `leanFaceNotice` is null for a picture that was already small enough. That is a quiet success.

## Source

`FaceCropper.tsx`, `faceRect.ts`, `leanFace.ts` and `facecrop.css` from the private `gilb-photo` package.
