# picture-shrink

Reads a picture file once and makes upright copies no larger than the sizes you ask for: JPEG or WebP, a thumbnail, a screen copy and a full copy by default, never enlarged or cropped, with an optional host decoder for HEIC.

## What this is

Reads a picture file once and makes upright copies no larger than the sizes you ask for: JPEG or WebP, a thumbnail, a screen copy and a full copy by default, never enlarged or cropped, with an optional host decoder for HEIC.

- `shrinkPicture(file, maxEdge = 1600, quality = 0.82)`: one JPEG whose longest edge is at most `maxEdge`.
- `makePictures(file)`: one decode, two JPEGs of the same picture: the master (longest edge 1600, quality 0.82) and a thumbnail (longest edge 320, quality 0.72). Not cropped, so the thumbnail has the master's shape.
- `makePictureSet(file, options?)` (0.2.0): one decode, three copies of the same picture, not cropped, answered as `{ thumb, screen, full, width, height, type }`. `full` is `null` when the original's longest edge is at most the screen size (the screen copy already holds all its pixels). `width` and `height` are the original's. The copies are encoded in the order thumb, screen, full, so a list can show the thumbnail soonest.
- `webpSupported()` (0.2.0): `Promise<boolean>`; draws a 1x1 canvas, asks `toBlob` for `image/webp` and answers whether the blob's type is `image/webp`. Asked once, then remembered.
- `setHeicDecoder(fn | null)` and `HEIC_UNREADABLE` (0.2.0): see HEIC below.
- `PictureUnreadableError`: thrown when the file cannot be decoded, has no size, or cannot be drawn or exported. Its default message is `This picture format can not be read here. Try a JPEG or PNG.`

The browser does the work: `createImageBitmap(file, { imageOrientation: "from-image" })` where it exists, else an `<img>` (which current browsers draw with its EXIF orientation applied), then a `<canvas>`. The scale is `min(1, maxEdge / longest edge)`, each side is rounded and kept at least 1 px, and the bitmap or object URL is released once, also when encoding fails.

### Options of `makePictureSet` (0.2.0)

| Option | Default | Meaning |
|---|---|---|
| `sizes.thumb` | 320 | longest edge of the thumbnail |
| `sizes.screen` | 1600 | longest edge of the screen copy; also the line below which `full` is `null` |
| `sizes.full` | 4096 | longest edge of the full copy (never enlarged) |
| `quality.thumb` | 0.72 | encoder quality of the thumbnail |
| `quality.screen` | 0.82 | encoder quality of the screen copy |
| `quality.full` | 0.9 | encoder quality of the full copy |
| `type` | `"image/jpeg"` | `"image/jpeg"`, `"image/webp"`, or `"auto"` (WebP when `webpSupported()` says so, else JPEG) |

`makePictures` and `shrinkPicture` take no new option and behave exactly as in 0.1.0 (JPEG, the same sizes and qualities).

### HEIC (0.2.0)

`setHeicDecoder(fn)` sets a module-wide setting: one decoder per app. `fn(file)` must answer a JPEG or PNG blob. When the browser (`createImageBitmap`, then `<img>`) fails on a file that looks like HEIC (type `image/heic` or `image/heif`, or no type and a name ending `.heic` or `.heif`, any case), the decoder is called once and its result is decoded the normal way. If the decoder throws, or its result can not be read, or none is set, `PictureUnreadableError` carries `HEIC_UNREADABLE`: `This HEIC picture can not be read here. On an iPhone, choose Most Compatible in Settings → Camera → Formats, or pick a JPEG.` `setHeicDecoder(null)` clears it.

The unit ships no decoder because the open HEIC decoders on npm are LGPL or sit on an LGPL library. From each package's `package.json` `license` field, read with `npm view` (nothing installed): `libheif-js` LGPL-3.0, `heic-to` LGPL-3.0, `heic-decode` ISC but its only dependency is `libheif-js`, and `heic2any` MIT in its field with no dependencies listed, but it bundles libheif code (this last point is not checked here). The app chooses and takes the licence decision.

## What this is not

- Not an uploader: the bytes go nowhere. See `picture-upload`.
- Not a cropper or an editor. Nothing is cut, rotated by hand or filtered.
- Not a decoder of formats the browser cannot read. There is no library inside.

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-shrink`

From a clone of this repository, install the unit's folder. It has no peers:

```sh
npm install <path-to-the-library>/units/picture-shrink
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. It must run in a browser (it uses `document`, `Image`, `URL.createObjectURL`).

## Examples

```ts
import { makePictures, PictureUnreadableError } from "@kaigilb/gilbplatformcode-picture-shrink";

try {
  const { master, thumb } = await makePictures(fileFromInput);
  // master.type === "image/jpeg"; send both to your store
} catch (e) {
  if (e instanceof PictureUnreadableError) showToPerson(e.message);
  else throw e;
}
```

## What the host must supply

Nothing is passed in. The unit uses the page's own `createImageBitmap` (optional), `Image`, `document.createElement("canvas")` and `URL.createObjectURL` / `revokeObjectURL`. There is no host member and no writer.

## Do not

- Do not call it on the server or in a worker without a DOM: the fallback and the canvas need `document`.
- Do not keep the returned blobs as the original: they are re-encoded copies.

## Wrong readings

- "The picture keeps its format." `makePictures` and `shrinkPicture` always re-encode as JPEG; `makePictureSet` as JPEG unless you ask for WebP or `"auto"`. A PNG with transparency gets a black background, because JPEG has no alpha and the canvas starts transparent black.
- "The copy carries the photo's metadata." EXIF and location are dropped by the re-encode: every copy, also those of `makePictureSet`, is exported by `canvas.toBlob` (a test asserts each output is a blob the canvas made). Privacy.Metadata relies on this; keep it true. This is relied on by Privacy.Metadata: the stored copies carry no location. Do not add a path that sends the original.
- "Every picture type works." HEIC decodes only where the browser can, or where the app has set a HEIC decoder; elsewhere you get `PictureUnreadableError` with `HEIC_UNREADABLE`.
- "A small picture is made bigger." Never: the scale is capped at 1, so an 800x600 picture stays 800x600 (it is still re-encoded).

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named change.

- `src/data/errors.ts` lines 29-35 (`PictureUnreadableError`) to the top of `src/shrink.ts`.
- `src/data/pictures.ts` lines 11-80 (`decode`, `Decoded`, `encodeJpeg`, `shrinkPicture`, `makePictures`) to `src/shrink.ts`, after it.

Named change, and only this:

- K1. The imports of `pictures.ts` (lines 1-9) are not taken. `PictureUnreadableError` is now local to `shrink.ts`. `decode` and `encodeJpeg` stay unexported. Every number (1600, 0.82, 320, 0.72), the `imageOrientation: "from-image"` option, the `<img>` fallback and its comment, the `Math.max(1, ...)` rounding and the `!d.width || !d.height` guard are as in the source.

`src/index.ts` is new. `test/testCanvas.ts` is a test-only fake (canvas, `createImageBitmap`, `Image`, object URLs), outside `src/`.

## Changes in 0.2.0

Changes in 0.2.0, and only these (all additive; with no option given, `makePictures` and `shrinkPicture` give the 0.1.0 output, pinned by tests):

- S1. `encodeJpeg` now calls a new `encode(d, maxEdge, quality, type)` with `"image/jpeg"`; its output is the same. `webpSupported()` is new.
- S2. `makePictureSet(file, options?)` is new.
- S3. `setHeicDecoder`, `HEIC_UNREADABLE` are new; `decode` is the old `decode` (now `decodeNative`) with a HEIC retry around it. The one behaviour change for 0.1.0 callers: a HEIC file that fails now says `HEIC_UNREADABLE`, not the generic sentence. Every non-HEIC failure keeps the 0.1.0 message (pinned).
- `src/index.ts` also exports the types `PictureType`, `PictureSetOptions`, `PictureSet`. `test/testCanvas.ts` gains `blobs` and `noWebp`.

## Tests

85 tests in 4 files (39 in 3 files for 0.1.0, unchanged except the exports list; `src/pictureSet.test.ts` has the 0.2.0 tests, each in a fresh module so the WebP memo and the HEIC decoder start clean). New, written for this unit: sizes (4000x3000, 800x600 not enlarged, 3000x4000, 10000x1 and 1x10000), quality, the `createImageBitmap` option, one decode for `makePictures`, the `<img>` fallback and its revoke, the unreadable cases (load error, zero width or height, `toBlob` null, no 2d context), and one release per decode, also when encoding throws. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory. The source app had no test for these functions.
