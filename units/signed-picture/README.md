# signed-picture

Shows a vault picture that needs a signed request: fetches its bytes with the person's access, keeps one object URL per file until sign-out, lets only a few fetches run at once, and draws a React thumbnail that loads when it nears the screen.

## What this is

Shows a vault picture that needs a signed request: fetches its bytes with the person's access, keeps one object URL per file until sign-out, lets only a few fetches run at once, and draws a React thumbnail that loads when it nears the screen.

An `<img src>` cannot carry the request signature, so the picture is fetched with `fetch`, turned into an object URL and handed to the `<img>`.

- `pictureObjectUrl(fileEntityUri, vaultOrigin)`: the picture as an object URL. The file id is `fileIdFromPhotoRef(address) ?? entityIdTail(address)` (peer `photo-ref`); the GET goes to `<vaultOrigin>/files/<encoded id>` with the headers of `dpopReadAuth("GET", url)` (peer `lws-session-bridge`) and `credentials: "omit"`. A refused read throws `The picture could not be read (HTTP <status>).`; an address with no id throws `This picture has no file address.` The promise is cached, so a second call for the same file gets the same promise and no second request. A failed fetch is removed from the cache, so the next call tries again.
- `forgetPictures()`: revokes every cached object URL and empties the cache. Call it on sign-out.
- `queuePicture(job)`: runs `job` when fewer than 4 are running, in the order asked; a job that rejects frees its slot.
- `SignedImage({ fileUri, vaultOrigin, previewUrl?, placeholder?, className?, alt? })`: a `div` (class `thumb` unless you give `className`) that fetches only when it is within 200 px of the screen (an `IntersectionObserver` with `rootMargin: "200px"`, or at once where there is none), through `queuePicture`. `previewUrl` (a local picture) wins and nothing is fetched. It shows `placeholder` until the picture arrives, then an `<img>` with `alt` (default empty).

`SignedImage` marks its state on the `div`: `data-state="loading"` (nothing shown, no failure), `"shown"` or `"failed"`. When the fetch fails it draws the placeholder and, after it, `<span class="signed-image-failed">This picture could not be loaded.</span>`. Style these yourself.

## What this is not

- Not a public-image loader: a picture that needs no signature can be a plain `<img src>`.
- Not an uploader or a shrinker: see `picture-upload` and `picture-shrink`.
- Not a sign-in or a session. The headers come from `lws-session-bridge`, which you import and set up; this unit never changes it.
- Not a stylesheet. The source app's tile art (the leaf glyph and the `.thumb` look) is app art and is not taken: pass your own `placeholder` and style `.thumb` (or your `className`).

## How to take it

Package: `@kaigilb/gilbplatformcode-signed-picture`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/signed-picture` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/photo-ref <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/signed-picture
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { SignedImage, forgetPictures } from "@kaigilb/gilbplatformcode-signed-picture";

<SignedImage fileUri={record.photo} vaultOrigin={vault.origin} placeholder={<LeafArt />} alt="" />;

// on sign-out:
forgetPictures();
```

## What the host must supply

| Member | Replaces (source app TestFlowerPower, `e39e1732551d9d5e6abf681546b97a3a30311e30`) |
|---|---|
| `vaultOrigin` (second parameter of `pictureObjectUrl`, prop of `SignedImage`) | `VAULT_ORIGIN` from the app's config, `src/data/pictures.ts:120` |
| `placeholder` | the app's `<LeafGlyph />`, `src/ui/Thumb.tsx:61` |
| `className`, `alt` | the literals `"thumb"` and `""`, `src/ui/Thumb.tsx:60,61` |

Also: React 19; the peers `lws-session-bridge` (with its own peers, set up with `setLwsAuth` so `dpopReadAuth` can sign) and `photo-ref`. The demo mode of the source app (`demoBackend()`, `pictures.ts:113-114`) is not taken.

## Do not

- Do not call `pictureObjectUrl` with the origin of another vault than the file's: the cache will keep whichever came first.
- Do not forget to call `forgetPictures()` on sign-out: the object URLs, and so the picture bytes, stay in memory until you do.
- Do not install two copies of this unit (see "Wrong readings").

## Wrong readings

- "The cache knows the origin." It is keyed by the file address only. A second call with another `vaultOrigin` for the same address gets the first call's URL and sends no request.
- "Object URLs go away by themselves." They live until `forgetPictures()`. Nothing frees one when a `SignedImage` unmounts.
- "There is one queue per `SignedImage`." The queue (4 at once) is module state, one per page. Two installed copies of this package give two queues, two caches and so up to 8 fetches at once (RuleGhsSingletonPeer: install it once, as the peer rules above say).
- "`data-state` says the picture is on its way." A `SignedImage` with no `fileUri` and no `previewUrl`, or one that is far from the screen, also says `loading` and never fetches.
- "A `SignedImage` that failed tries again." It does not: `failed` is not reset when `fileUri` changes, and a picture already shown for an earlier `fileUri` stays until the new one arrives (both as in the source, which kept `src` too).
- "The `<img>` has no size." It has none; the host's CSS gives the tile its size.

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named changes.

- `src/data/pictures.ts` lines 109-136 (`cache`, `pictureObjectUrl`, `forgetPictures`) to `src/pictureUrl.ts`.
- `src/ui/pictureQueue.ts` lines 1-23 to `src/pictureQueue.ts`, verbatim.
- `src/ui/Thumb.tsx` lines 14-64 (`Thumb`) to `src/SignedImage.tsx`. `LeafGlyph` (lines 5-12) is app art and is not taken.

Named changes, and only these:

- G1. `pictureObjectUrl(fileEntityUri, vaultOrigin)`: the second parameter replaces `VAULT_ORIGIN` (pictures.ts:120). The cache stays keyed by `fileEntityUri` only.
- G2. The demo branch (pictures.ts:113-114) is deleted.
- G3. Imports: `dpopReadAuth` from `lws-session-bridge`; `entityIdTail` and `fileIdFromPhotoRef` from `photo-ref` (the same symbols the app imported, pictures.ts:2,4). `SignedImage.tsx` imports React, `./pictureUrl` and `./pictureQueue`.
- G4. `Thumb` is `SignedImage`, with props `fileUri`, `vaultOrigin`, `previewUrl`, `placeholder` (default `null`, in place of `<LeafGlyph />`), `className` (default `"thumb"`) and `alt` (default `""`); the fetch is `queuePicture(() => pictureObjectUrl(fileUri, vaultOrigin))` and `vaultOrigin` is in that effect's dependency list.
- G5. The fetch's rejection handler, `() => undefined` in the source (it waited silently for ever), is `() => live && setFailed(true)`, with `const [failed, setFailed] = useState(false)`. The `div` carries `data-state` (`loading`, `shown`, `failed`); when failed and nothing is shown it draws the placeholder and then `<span className="signed-image-failed">This picture could not be loaded.</span>`.
- Comment edits: none needed beyond the file split.

`src/index.ts` is new.

## Tests

56 tests in 6 files. New, written for this unit (the source app's tests of these functions run on its own fake vault and are not ported: `test/plants.test.ts:264` is re-expressed here): the GET (address, headers, `credentials: "omit"`, encoded id, the given origin); a photo-ref address, a plain entity address and a record address (id tail); no file address; one promise and one fetch; the cache keyed by address only; a failed fetch forgotten; a refused read (HTTP 404); `forgetPictures`; the queue (never more than 4, in order, a rejection frees its slot); `SignedImage` (preview wins, shown, class and alt, placeholder while loading, failure, with and without `IntersectionObserver`, the 200 px margin and the 200 px edges, a late result for a file the component has left, unmount before the answer, the arguments given to `pictureObjectUrl`, a later `previewUrl`, five pictures through the queue of four). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory. `lws-session-bridge` is replaced by a fake in the tests; `photo-ref` is the real one.
