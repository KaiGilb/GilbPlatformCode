# open-popups

The one registry of what is open (create dialogs and portalled popovers), so Escape, Tab and outside-click go to the top-most one.

## What this is

The one registry of what is open in a page, create dialogs and portalled popovers alike, so that Escape, Tab and an outside click go to the top-most one. It is module state and two small React helpers, and it draws nothing.

- `registerOpen(entry)`: a popover or menu that is portalled out of its layer registers here while it is open, and gets back the function that removes it. An `OpenEntry` has `el()` (its root element), `close()`, an optional `dismiss()` (close without moving focus; default `close`) and an optional `exclusive` flag. Opening an exclusive entry closes the other exclusive ones first (`dismiss`, else `close`).
- `topOpen()`: the newest registered entry, or `null`.
- `tabInside(event, el)`: Tab inside `el`. It wraps at both ends and brings focus from outside `el` back in. With nothing focusable inside it focuses `el`. `FOCUSABLE_SELECTOR` is the selector it uses (disabled controls and `tabindex="-1"` are skipped).
- `openPortalRoots`, `modalIsOpen()`, `eventTargetInTopDialog(target)`: the list of open create-dialog portal roots (oldest first, the last one owns the keyboard), whether any is open, and whether an event target is inside the newest.
- `ModalPortalContext` and `useModalPortalTarget()`: a component inside an open dialog portals into the dialog's root; anywhere else it portals to `document.body`.
- `MODAL_LAYER_Z`: 100, the create dialog's layer. Set it as an inline style, not a `z-[100]` class.
- `insideOpenLayer(node)`: true for the whole time a create dialog is open, and true when a node sits inside a modal layer (`[data-testid="connected-create-root"]`, `[aria-modal="true"]` or `[role="dialog"]`). A text node is read through its parent element.

## What this is not

- Not a dialog or a popover. It draws nothing; the host's components register themselves here.
- Not a focus trap for the whole page. `tabInside` is called by the layer that owns the keyboard, for the top-most entry.
- Not a keyboard handler. The host's layer reads `topOpen()` on Escape and Tab and acts on it.
- Not a z-index system for pages. Only the create dialog's layer is named here.

## How to take it

Package: `@kaigilb/gilbplatformcode-open-popups`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/open-popups
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

It must exist ONCE in an app. The registry is module state: two installed copies are two registries, and Escape and Tab then go to the wrong layer. Take this unit as a peer dependency of any other unit that uses it, and check that your lockfile holds one copy.

## Examples

```tsx
import { registerOpen, topOpen, tabInside } from "@kaigilb/gilbplatformcode-open-popups";

// A popover registers while it is open.
useEffect(() => {
  if (!open) return;
  return registerOpen({ el: () => rootRef.current, close: () => setOpen(false), dismiss: () => setOpenNoFocus(false), exclusive: true });
}, [open]);

// The layer that owns the keyboard asks the registry.
function onKeyDown(e: KeyboardEvent) {
  const top = topOpen();
  if (!top) return;
  if (e.key === "Escape") { e.stopPropagation(); top.close(); }
  if (e.key === "Tab" && top.el()) tabInside(e, top.el()!);
}
```

```tsx
import { ModalPortalContext, useModalPortalTarget, openPortalRoots, insideOpenLayer } from "@kaigilb/gilbplatformcode-open-popups";

// The dialog pushes its portal root while open, and offers it to children.
// <ModalPortalContext.Provider value={rootEl}>...</ModalPortalContext.Provider>
// A child popover: createPortal(menu, useModalPortalTarget())

// A field that must not treat a blur into a dialog as leaving:
if (insideOpenLayer(event.relatedTarget as Node | null)) return;
```

## What the host must supply

- React 19.
- The create dialog itself: it pushes its portal root onto `openPortalRoots` while open (and pops it on close), and its root carries `data-testid="connected-create-root"`. The host's create dialog portals to `document.body`.
- The popovers: each calls `registerOpen` while open and returns the remover.
- The layer that owns Escape and Tab: it reads `topOpen()` and calls `close()` or `tabInside`.

## Do not

- Do not install this unit twice in one app. One registry, one keyboard.
- Do not mutate `openPortalRoots` except to push your dialog's root on open and remove it on close.
- Do not call `entry.close()` for another popover that is taking over; use `dismiss` for that, so focus is not moved.
- Do not give a modal layer another test id and expect `insideOpenLayer` to find it by that; other modals are found by `[aria-modal="true"]` or `[role="dialog"]`.

## Wrong readings

- "`insideOpenLayer` checks only the node." While a create dialog is open it answers true for every node, `null` included.
- "Opening an exclusive entry closes every other entry." It closes only the other exclusive ones.
- "`modalIsOpen` counts popovers." It counts create-dialog portal roots only; popovers are in the stack read by `topOpen`.
- "`tabInside` always prevents the default." It does so only when it moves focus (a wrap, a return from outside, or an empty container); a Tab from the middle is left to the browser.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`:

- `src/components/ui/layers.ts` (whole file) to `src/layers.ts`. No change.
- `src/components/ui/openStack.ts` (whole file) to `src/openStack.ts`. Header comment made generic; no code change.
- `src/components/records/planLeave.ts` (whole file) to `src/openLayer.ts`. Comments made generic; the import became `./layers`; no other code change.
