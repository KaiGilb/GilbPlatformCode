# picture-shrink

Reads a picture file once and makes upright JPEG copies no larger than the sizes you ask for, a 1600 px master and a 320 px thumbnail by default, never enlarged or cropped.

## What this is

Reads a picture file once and makes upright JPEG copies no larger than the sizes you ask for, a 1600 px master and a 320 px thumbnail by default, never enlarged or cropped.

- `shrinkPicture(file, maxEdge = 1600, quality = 0.82)`: one JPEG whose longest edge is at most `maxEdge`.
- `makePictures(file)`: one decode, two JPEGs of the same picture: the master (longest edge 1600, quality 0.82) and a thumbnail (longest edge 320, quality 0.72). Not cropped, so the thumbnail has the master's shape.
- `PictureUnreadableError`: thrown when the file cannot be decoded, has no size, or cannot be drawn or exported. Its default message is `This picture format can not be read here. Try a JPEG or PNG.`

The browser does the work: `createImageBitmap(file, { imageOrientation: "from-image" })` where it exists, else an `<img>` (which current browsers draw with its EXIF orientation applied), then a `<canvas>`. The scale is `min(1, maxEdge / longest edge)`, each side is rounded and kept at least 1 px, and the bitmap or object URL is released once, also when encoding fails.

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

- "The picture keeps its format." A picture is always re-encoded as JPEG. A PNG with transparency gets a black background, because JPEG has no alpha and the canvas starts transparent black.
- "The copy carries the photo's metadata." EXIF and location are dropped by the re-encode. This is relied on by Privacy.Metadata: the stored copies carry no location. Do not add a path that sends the original.
- "Every picture type works." HEIC decodes only where the browser can; elsewhere you get `PictureUnreadableError`.
- "A small picture is made bigger." Never: the scale is capped at 1, so an 800x600 picture stays 800x600 (it is still re-encoded).

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named change.

- `src/data/errors.ts` lines 29-35 (`PictureUnreadableError`) to the top of `src/shrink.ts`.
- `src/data/pictures.ts` lines 11-80 (`decode`, `Decoded`, `encodeJpeg`, `shrinkPicture`, `makePictures`) to `src/shrink.ts`, after it.

Named change, and only this:

- K1. The imports of `pictures.ts` (lines 1-9) are not taken. `PictureUnreadableError` is now local to `shrink.ts`. `decode` and `encodeJpeg` stay unexported. Every number (1600, 0.82, 320, 0.72), the `imageOrientation: "from-image"` option, the `<img>` fallback and its comment, the `Math.max(1, ...)` rounding and the `!d.width || !d.height` guard are as in the source.

`src/index.ts` is new. `src/testCanvas.ts` is a test-only fake (canvas, `createImageBitmap`, `Image`, object URLs) and is left out of the host-agnostic check, with the test files.

## Tests

39 tests in 3 files. New, written for this unit: sizes (4000x3000, 800x600 not enlarged, 3000x4000, 10000x1 and 1x10000), quality, the `createImageBitmap` option, one decode for `makePictures`, the `<img>` fallback and its revoke, the unreadable cases (load error, zero width or height, `toBlob` null, no 2d context), and one release per decode, also when encoding throws. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory. The source app had no test for these functions.
