# picture-pick

Lets a person add pictures the way their device allows: take a photo with the camera, choose one or many from the device, or paste or drop them onto the page, and hands the app the picture files.

## What this is

Lets a person add pictures the way their device allows: take a photo with the camera, choose one or many from the device, or paste or drop them onto the page, and hands the app the picture files.

On a phone the person taps "Take photo" (the camera opens) or "Choose photo" (the photo library opens; with `multiple`, "Choose photos" and several can be chosen at once). On a PC the person can also paste a picture from the clipboard or drop picture files onto the page. Every route ends in one call: `onPick(files)` with the pictures, in order. The unit makes no request and does not shrink or upload anything; the app sends the files on.

- `PicturePickButtons({ onPick, words?, multiple?, disabled? })`: the two buttons, a `div.row` of two `label.btn.secondary.grow`, each with a hidden file input. "Take photo" has `accept="image/*"` and `capture="environment"` and is never multiple. "Choose" has `accept="image/*"` and `multiple` when `multiple` is set. After each choice the input's value is reset to `""`, so the same file can be chosen twice. `disabled` disables both inputs and sets `aria-disabled` on both labels.
- `words`: `{ takePhoto, choosePhoto, choosePhotos }`, defaults `Take photo`, `Choose photo`, `Choose photos`.
- `pictureFiles(list)`: the picture files in a `FileList` or `File[]` (or `null`), in order. A file is a picture when its `type` starts with `image/`, or when its `type` is empty and its name ends (any letter case) in `.heic`, `.heif`, `.avif`, `.webp`, `.jpg`, `.jpeg`, `.png` or `.gif`.
- `usePictureDrop(target, onPick, { paste? })`: on the element in `target`, files dragged over it give it the class `picture-drop-active`, and a drop calls `onPick(pictureFiles(...))` when that is not empty. With `paste` (default `true`) pictures pasted anywhere on the page are taken too, unless the focus is in an `input`, a `textarea` or a `[contenteditable]` element; a paste of text is never touched. Returns `true` while a drag is over the target. Listeners are removed on unmount and when `target` or `paste` changes.
- `PictureDropZone({ onPick, children, className?, paste?, label? })`: a `div` that uses `usePictureDrop` on itself. `label` (default `Drop pictures here`) is a visually hidden `aria-live="polite"` status, filled only while pictures are dragged over.

## What this is not

- Not the next step. `pick()` of the source (which turned the file into a stored picture), the preview of the picture and the error line are the app's. The unit hands back `File[]`; the app sends them to its own shrink and upload steps.
- Not a camera. "Take photo" is a file input with `capture`; the phone's own camera app does the work. On a PC most browsers show a file chooser instead.
- Not a picture check. `pictureFiles` decides by type and name only; it does not read the bytes.

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-pick`

From a clone of this repository, install the unit's folder:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/picture-pick
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`) and one stylesheet, `src/picturePick.css`; your bundler compiles and imports them.

## Styling

Plain CSS, class-name styling, no variables, no `@import`, no `url(`: `import "@kaigilb/gilbplatformcode-picture-pick/picturePick.css";`. The rules are for `.row`, `.btn`, `.btn.secondary`, `.btn.grow` (the source app's, copied by script) and the new `.picture-drop-active` (a dashed outline in the current text colour). The names are the source app's and are plain: if your page already has classes of those names, load this stylesheet first, or the later rule wins. The source's `.btn.secondary` uses a fixed white background and a fixed border colour.

`usePictureDrop` adds and removes `picture-drop-active` on the element directly. If your own `className` for that element changes while a drag is over it, React may overwrite the class for that moment.

## Examples

```tsx
import { PictureDropZone, PicturePickButtons } from "@kaigilb/gilbplatformcode-picture-pick";
import "@kaigilb/gilbplatformcode-picture-pick/picturePick.css";

function AddPictures({ send, busy }: { send: (files: File[]) => void; busy: boolean }) {
  return (
    <PictureDropZone onPick={send}>
      <PicturePickButtons onPick={send} multiple disabled={busy} />
    </PictureDropZone>
  );
}
```

## What the host must supply

| Member | Replaces (source app TestFlowerPower, `e39e1732551d9d5e6abf681546b97a3a30311e30`) |
|---|---|
| `onPick(files)` | the call `void pick(e.target.files?.[0])`, `src/screens/PlantSheet.tsx:83,87`; `pick()` is the app's step and is not taken |
| `words` (optional) | the literal words "Take photo" and "Choose photo", `PlantSheet.tsx:82,86` |

Also: React 19, and the stylesheet.

## Do not

- Do not treat `onPick` as called only with pictures to send: the buttons call it with an empty list when the person chose only non-pictures. Check `files.length`.
- Do not put two `PictureDropZone`s with `paste` on one page: each would take the same pasted picture.
- Do not rely on `drop` reading the folder tree: dropped folders are not opened.

## Wrong readings

- "The source took many pictures." It took one: `e.target.files?.[0]`. Many, paste and drop are new here.
- "The buttons never call `onPick` with nothing." They do, with `[]`, when the chosen files are not pictures (the source's `pick(undefined)` was the same case).
- "`disabled` greys the labels." It sets `aria-disabled` and disables the inputs; the source had no disabled look and this unit adds none.
- "`dragenter` is the only way in." `dragover` also adds the class, for a drag that starts outside and enters through a child.
- "Paste is taken whenever the page has focus." Not in an `input`, `textarea` or `[contenteditable]` (even `contenteditable="false"`), and only when the clipboard holds a picture file.
- "A dropped file with an unknown type is dropped." An empty type with a picture extension is kept; a non-empty non-image type is not, whatever the name.

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named changes.

- `src/screens/PlantSheet.tsx` lines 80-89 (the `div.row` with two labels and hidden file inputs) to `src/PicturePickButtons.tsx`.
- `src/ui/styles.css` lines 87-90, 93, 98 and 109 to `src/picturePick.css`: the rules for `.btn`, `.btn.secondary`, `.btn.grow` and `.row`.

Named changes, and only these:

- **P1.** The row is wrapped in `PicturePickButtons({ onPick, words, multiple = false, disabled = false })`; the labels' words come from `words`.
- **P2.** Each `onChange`: `void pick(e.target.files?.[0]);` becomes `onPick(pictureFiles(e.target.files));`; `e.target.value = "";` stays, after it.
- **P3.** The "Choose" input gets `multiple={multiple}`; "Take photo" keeps `capture="environment"` and is never multiple.
- **P4.** `disabled` reaches both inputs; each label gets `aria-disabled` when disabled.
- **New:** `pictureFiles` (N1), `usePictureDrop` (N2), `PictureDropZone` (N3) and the `.picture-drop-active` rule.

`src/index.ts` is new.

## Tests

65 tests in 5 files (`npx vitest run`): `PicturePickButtons.test.tsx` 15, `PictureDropZone.test.tsx` 21, `pictureFiles.test.ts` 15, `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Ported from TestFlowerPower: none. The frozen source has no test file that checks the two buttons alone (a search of `src/` for "Take photo", "Choose photo" and `capture` finds only `src/screens/PlantSheet.tsx`, which is the code itself), so every test here is new. Left out: any test that mounts the plant sheet, since none exists for the buttons.

axe-core runs on the buttons (enabled, multiple, disabled) and on the zone (idle and while dragging); colour contrast and region rules are off in jsdom.

Mutation checks are logged outside the unit; the dispatcher's own are the ones that count.
