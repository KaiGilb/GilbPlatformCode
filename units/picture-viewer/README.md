# picture-viewer

A full-screen picture viewer for React apps that works like a phone's photo app: swipe, pinch and double-tap zoom, drag, keys, wheel and full screen, with the picture shown at once and sharpened when its full file arrives.

## What this is

A full-screen picture viewer for React apps that works like a phone's photo app: swipe, pinch and double-tap zoom, drag, keys, wheel and full screen, with the picture shown at once and sharpened when its full file arrives.

A modal dialog over the page with one picture, its caption, a counter, and buttons for close, previous, next, zoom out, fit, zoom in and (where the browser can) full screen. While it is open the page behind is inert and does not scroll, Tab stays inside, and Escape closes from anywhere. A finger swipes left or right between pictures and down to close; two fingers pinch; a double tap (or double click) zooms; a zoomed picture is dragged; a trackpad pinch (a wheel with the ctrl key) zooms; a single tap on the picture hides or shows the controls; a tap on the dark edge closes. Every gesture has a button or a key (`+` `-` `0` zoom, the arrows move, `f` full screen).

It is a React port of the Vue unit `web-units/image-lightbox` (`LightboxViewer.vue` and `lightboxCore.ts`), with five named additions (see "Where it came from").

- `usePictureViewer(options?)`: returns `{ open(items, index?), viewer }`. Render `viewer` once; it is `null` while closed. Closing gives focus back to the element that had it when `open` was called. `options` are `words`, `showCaption`, `maxZoom` and `resolveSrc`, passed to every viewer it opens.
- `PictureViewer({ items, index, words?, showCaption?, maxZoom?, onClose, onIndexChange?, resolveSrc? })`: the viewer itself, for an app that holds the open state. It draws into `document.body` (a portal).
- `LightboxItem`: `{ src, alt, caption, el?, fallback?, thumbSrc?, fileUri? }`. `alt` is never empty. `fallback` is the file tried when `src` fails. `thumbSrc` is a small version already in memory, shown at once. `fileUri` is the vault address of the file, for a host whose pictures need a signed fetch.
- `LightboxWords`, `defaultWords`, `resolveWords`: every word the viewer shows or speaks, English by default, yours over them. New here: `fullScreen` ("Full screen") and `exitFullScreen` ("Leave full screen").
- Everything `lightboxCore.ts` exports, for an app that builds items from a page: `whySkipped`, `itemFromImg`, `collectSet`, `isTooSmall`, and the pure gesture and zoom arithmetic (`readSwipe`, `stepIndex`, `clampPan`, `zoomAround`, `pinchScale`, `isTap`, `isDoubleTap`, the numbers).

## What this is not

- Not the page and Markdown wrappers of the Vue unit. `ImageLightbox.vue` (a picture that opens itself), `LightboxScope.vue` (every picture in an article) and `ProseImg.vue` (a Nuxt Content image) are for websites and are not ported. A React app opens the viewer with its own list of items.
- Not a picture source. It takes plain URLs, or a host function (`resolveSrc`) that answers a URL. It imports no other unit and reaches no network and no app by itself.
- Not a picture editor, and it does not shrink, sign or upload anything.

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-viewer`

From a clone of this repository, install the unit's folder:

```sh
npm install react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/picture-viewer
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`) and one stylesheet; your bundler compiles the first. Import the stylesheet once:

```ts
import "@kaigilb/gilbplatformcode-picture-viewer/pictureViewer.css";
```

## Styling

`pictureViewer.css`, plain CSS with `ilb-*` class names; it pulls nothing in. Theme it with CSS variables, all with neutral fallbacks: `--site-block-overlay` (the dark backdrop), `--site-block-on-overlay` (its text and buttons), `--site-block-accent` (the focus ring), `--site-block-radius`, `--site-block-z-overlay` (the stacking order, default 1000) and `--site-block-motion` (the length of the fade and the zoom glide, default 150 ms). The fade and the glide run only for people who have not asked for reduced motion.

## Examples

```tsx
import { usePictureViewer, type LightboxItem } from "@kaigilb/gilbplatformcode-picture-viewer";

function Album({ pictures }: { pictures: LightboxItem[] }) {
  const { open, viewer } = usePictureViewer();
  return (
    <>
      {pictures.map((p, i) => (
        <button key={p.src} type="button" onClick={() => open(pictures, i)}>
          <img src={p.thumbSrc} alt={p.alt} />
        </button>
      ))}
      {viewer}
    </>
  );
}
```

Pictures that need a signed fetch (the host answers the address to load; the small version is shown meanwhile):

```tsx
const { open, viewer } = usePictureViewer({
  resolveSrc: async (item) => myApp.signedUrlFor(item.fileUri!),
});
open([{ src: "", fileUri: vaultAddress, thumbSrc: listThumb, alt: "Ann at the lake", caption: "Ann at the lake" }], 0);
```

## What the host must supply

Nothing is required. The one optional member is `resolveSrc(item): Promise<string>`: with it the viewer loads the file it answers instead of `item.src` (a rejection counts as a failed load and tries `item.fallback`, then shows the failed message). Without it, `item.src` is loaded. The words are the host's too (`words`, partial over the English ones). The page must load `pictureViewer.css`.

## Module state

None. Every viewer keeps its own state; the page lock (body styles, `inert` on the page's other children, scroll position) is taken when the viewer mounts and given back when it unmounts, also if it unmounts while open.

## Do not

- Do not give an item an empty `alt`: the picture would be read as nothing. The viewer does not check; the page that builds the items does (`whySkipped` and `collectSet` do).
- Do not render two viewers at once: each takes the page lock, and the second would save the first one's locked styles as the page's own.
- Do not hide the viewer with CSS to "close" it; unmount it (`usePictureViewer` does this when `onClose` runs), or the page stays inert.
- Do not hand `resolveSrc` a function that returns a picture the person may not see; it is called for the shown picture and for its two neighbours.

## Wrong readings

- "The neighbours load first means it loads the whole set." It loads exactly the picture before and the picture after the one shown, once the shown one is ready, and each picture once.
- "The small version is the picture." It is a stand-in drawn at once (class `ilb-img-thumb`), with no loading cue; the full file loads unseen beside it and replaces it. If the full file fails (and its `fallback` too), the small version stays visible behind the failed message.
- "A tap on the dark edge and a tap on the picture do the same." The edge closes at once. A tap on the picture waits the length of a double tap (350 ms), and only if no second tap comes does it hide or show the controls.
- "Hidden controls are gone." They are `visibility: hidden` (so the focus order stays); any key press shows them again, and Tab then moves into them.
- "`resolveSrc` is asked once per picture." It is asked each time a picture is shown and for each neighbour once; cache in the host if the answer is costly.
- "The effect reloads when the items array changes." It reloads when the shown item's `src`, `fallback` or `fileUri` changes, or the index does, so an inline `items` array in a parent that re-renders does not flash the picture.

## Where it came from

The Vue unit `web-units/image-lightbox` 0.1.1 of this repository (`KaiGilb/GilbPlatformCode`), commit `ca9ca73386de9576b75eda5d03ed793e839f3e46`:

- `web-units/image-lightbox/src/lightboxCore.ts` (lines 1 to 167) to `src/lightboxCore.ts`, copied by script; only named change V2.
- `web-units/image-lightbox/src/types.ts` (1 to 34) to `src/types.ts`, copied by script; named changes V1 and V2.
- `web-units/image-lightbox/src/LightboxViewer.vue` (1 to 434) to `src/PictureViewer.tsx`, ported to a React function component; its `<style scoped>` block (lines 371 to 433) to `src/pictureViewer.css`, copied by script.
- `web-units/image-lightbox/src/lightboxCore.test.ts` (1 to 111) to `src/lightboxCore.test.ts`, verbatim.

Named changes, and only these:

- **V1** `LightboxItem` gains two optional fields after `fallback`: `thumbSrc` and `fileUri`.
- **V2** `LightboxWords` and `defaultWords` gain `fullScreen` ("Full screen") and `exitFullScreen` ("Leave full screen").
- **The port** (Vue to React): `ref` to state, with a ref kept in step wherever a handler may run twice before a render (the shown index, the zoom, the load state, the hidden state); `computed` to plain expressions; `watch(item, startLoad, { immediate: true })` to a layout effect on the shown index and the item's `src`, `fallback` and `fileUri`; `onMounted` and `onBeforeUnmount` to one effect with cleanup; `<Teleport to="body">` to `createPortal(..., document.body)` (the Vue source teleports to body too); the wheel listener is added natively with `{ passive: false }`, because React's own wheel listeners are passive and could not keep the page from zooming. Every handler body, number, threshold and order is the source's.
- **A1 Full screen.** A button after the zoom buttons (drawn only when `document.fullscreenEnabled`), the key `f`, and leaving the viewer while full screen leaves full screen.
- **A2 Neighbours load first.** When the shown picture is ready, the picture before and the one after are loaded (through `resolveSrc` when given, else `new Image().src`); never more, each once.
- **A3 Shown at once.** `thumbSrc` is drawn at once (`ilb-img ilb-img-thumb`) with no loading cue; the full file replaces it when loaded; if it fails the small version stays behind the failed message.
- **A4 Signed sources.** `resolveSrc` answers the file to load; a rejection counts as a failed load (same fallback rule).
- **A5 Tap shows and hides the controls.** A single tap on the picture, after the double-tap window, toggles `ilb-chrome-hidden` on the dialog (CSS `visibility: hidden`); any key shows them again.
- **usePictureViewer.** The one new helper that stands in for the three Vue wrappers.

## Tests

133 tests in 6 files (`npx vitest run`): `lightboxCore.test.ts` 27 (verbatim), `PictureViewer.test.tsx` 34, `gestures.test.tsx` 15, `additions.test.tsx` 41, `exports.test.ts` 3, `hostAgnostic.test.ts` 13.

Ported from the Vue unit (commit `ca9ca73`), by source line: `src/ImageLightbox.test.ts` 97, 122, 129, 136 (the close button; the edge tap is in `gestures.test.tsx`), 142, 149, 155, 173, 181, 191, 211, 221, 226; 375, 382, 385, 391 and 408 (the style tests, against `pictureViewer.css`); `src/fixes.test.ts` 101, 111, 119, 131 (with items instead of a wrapper) and 141 (loading and failed, with the ready state added). Left out: `ImageLightbox.test.ts` 110 (Enter and Space on the wrapper's picture: a wrapper), 396 (imports of Vue files: the host-agnostic test covers imports), and everything outside lines 89 to 235 and 371 to 412 (the picture wrapper, the scope, ProseImg, server HTML and hydration tests); `fixes.test.ts` 27 to 96 (D1, D2: the scope); `neutralAccent.test.ts`; `hostAgnostic.test.ts` of the Vue unit (replaced by this unit's own).

Mutation checks are logged outside the unit; the dispatcher's own are the ones that count.
