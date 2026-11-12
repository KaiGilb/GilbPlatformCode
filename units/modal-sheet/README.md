# modal-sheet

A small modal dialog for React apps: a titled panel over a backdrop that closes on Escape or a backdrop click, keeps focus inside, locks the page scroll and gives focus back when it closes.

## What this is

A small modal dialog for React apps: a titled panel over a backdrop that closes on Escape or a backdrop click, keeps focus inside, locks the page scroll and gives focus back when it closes.

One component, `ModalSheet`. It is the shared dialog for sheets such as `vault-share-sheet`; a vault switcher can use it too. It draws a bottom sheet the full width of the screen under 600 px, and a centred card above that.

```tsx
function ModalSheet(p: { title: string; onClose(): void; children: ReactNode; closeLabel?: string /* "Close" */; className?: string; initialFocus?: "first" | "none" }): JSX.Element
```

- The panel is `role="dialog"` with `aria-modal="true"`, and `aria-labelledby` points at the title heading (an id from `useId`, so two dialogs never share one).
- Escape calls `onClose`. So does a click on the backdrop (not one inside the panel, and not a press that began inside the panel and was let go on the backdrop), and so does the close button (words from `closeLabel`).
- On open, focus moves to the first focusable thing in the panel (the close button when the children have none; with `initialFocus="none"`, the panel itself). A child that already took focus (an `autoFocus` field) keeps it. Tab on the last thing goes to the first, Shift+Tab on the first goes to the last, and Tab never leaves the panel, even when focus was lost to the page behind. When the dialog unmounts, focus goes back to the element that had it before it opened.
- While open the page does not scroll (`document.body.style.overflow` is `hidden`); on unmount the value that was there before is put back, not an empty string.
- The close button is last in the document and drawn top right, so the first Tab stop is the first thing in the children.

## What this is not

- Not a portal. The dialog draws where it is rendered (the sibling sheet `org-employees`'s `OrgListSheet` and `picture-viewer` use `createPortal`; this one does not, so an ancestor with a `transform` or `overflow: hidden` will clip a `position: fixed` panel; render it high in the tree).
- Not a confirm dialog and not a form: it holds what you give it.
- Not inert: the page behind is not made `inert`, only kept from scrolling and from taking Tab. Two dialogs open at once both listen to Escape and Tab; open one at a time.

## How to take it

Package: `@kaigilb/gilbplatformcode-modal-sheet`

From a clone of this repository, install the unit's folder:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/modal-sheet
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`) and one stylesheet; your bundler compiles the first. The component module imports the stylesheet itself, so the app has nothing to import. The same file is exported as `@kaigilb/gilbplatformcode-modal-sheet/modalSheet.css` for a host that wants it on its own.

## Styling

Plain CSS with `ms-*` class names; no `@import`, no `url(`. Every colour is a CSS variable with a neutral fallback, named as `style-runtime` names them: `--paper` (panel), `--ink` (text, and the backdrop mixed with transparency), `--lines` (borders), `--accent` (focus ring), `--r-lg` (radius) and `--shadow-lg`. Two own knobs: `--modal-sheet-z` (stacking, default 1000) and `--modal-sheet-scrim` (the backdrop colour). Add your own class with `className`, it lands on the panel beside `ms-panel`.

## Examples

```tsx
import { ModalSheet } from "@kaigilb/gilbplatformcode-modal-sheet";

{open ? (
  <ModalSheet title="Choose a vault" onClose={() => setOpen(false)}>
    <ul>{vaults.map((v) => <li key={v.id}><button onClick={() => pick(v)}>{v.name}</button></li>)}</ul>
  </ModalSheet>
) : null}
```

## What the host must supply

Nothing but `title` and `onClose`. Mount it to open it and unmount it to close it; `onClose` is what Escape, the backdrop and the close button ask for, and it is the host that removes the dialog.

## Module state

None. The scroll lock and the keyboard listener live in the component and are given back when it unmounts (also under React's StrictMode, which mounts effects twice).

## Do not

- Do not keep a `ModalSheet` mounted and hide it with CSS: focus, scroll lock and the listener stay on. Unmount it.
- Do not put a second dialog inside the first.
- Do not pass a new `onClose` expecting a re-subscribe: the latest one is used, and nothing is re-subscribed.

## Where it came from

Written for this repository in EESpeed round 7 (batch U2c), from the dialogs of two apps built on the library: PictureRecords run 7 (`app/src/share/ShareSheet.tsx`, `app/src/components/VaultChip.tsx`: a backdrop, `role="dialog"`, Escape on `window`) and run 6 (`app/src/ui/ShareSheet.tsx`). Both had the backdrop, the Escape key and the heading, and neither kept focus inside or gave it back. Base commit `19fb34ba7195055fbd0ef13e376d789756e2c9f6` of `KaiGilb/GilbPlatformCode`.

## Tests

31 tests in 4 files (`npx vitest run`): `ModalSheet.test.tsx` 14, `stylesheet.test.ts` 2, `exports.test.ts` 1, `hostAgnostic.test.ts` 14. The host-agnostic check allows the unit's own `./x.css` import and nothing else beyond `react`.
