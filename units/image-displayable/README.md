# image-displayable

Whether the browser in front of you can paint this picture. It asks the browser; it keeps no list of formats.

## What this is

`browserCanDisplay(blob)` resolves true when this browser can decode the bytes well enough to paint them in an `<img>`.

1. Where `createImageBitmap` exists, it decodes the pixels. Success is true, a throw is false. The decoded surface is closed at once.
2. Otherwise it loads the blob into an `Image` through an object URL and awaits `decode()` when the engine has it, or reads `naturalWidth` when it does not. The object URL is revoked either way.

## What this is not

- Not a media-type list. The same HEIC file is true on iOS Safari and false on desktop Chrome. That difference is the point.
- Not a converter. When the answer is false, the host decides what to do: convert on a server, or ask for another file.
- Not a server check. "Can this server open it?" is a different question with a different answer.

## How to take it

Package: `@kaigilb/gilbplatformcode-image-displayable`

```ts
import { browserCanDisplay } from "@kaigilb/gilbplatformcode-image-displayable";

if (!(await browserCanDisplay(file))) {
  // do not open the crop surface on an empty box
}
```

## What you pass

A `Blob` or `File`: the picked file, or any image bytes.

## What you get

A promise of true or false. It does not reject.

## Host must supply

A browser. In Node there is no `createImageBitmap` and no `Image`; the probe is for the client.

## Do not

- Do not replace this with a check on `file.type`. A list encodes today's browsers as a permanent fact.
- Do not keep the decoded bitmap. On a 26 MP camera original it is about 100 MB of pixels held for a yes or no.

## Wrong readings

- False is about this browser, not about the file. The file may paint fine on another device.
- The stricter decode is used where it exists: a false negative costs a round trip, a false positive costs the person an empty crop box.

## Source

`displayable.ts` from the private `gilb-photo` package. Its tests stub the decoder: they prove the routing, not what a real browser decodes.
