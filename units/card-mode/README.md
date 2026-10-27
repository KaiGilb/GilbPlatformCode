# card-mode

A record card's two modes, presentation and edit, as one React provider with a hook, and the Edit, Done and plus buttons that switch it.

## What this is

A record card's two modes: presentation (values read as text, no remove control, no empty field, no placeholder) and edit (the remove control and the add rows are shown and every field is editable in place). One flag, held by `CardModeProvider`, for the whole card; the components inside read it with `useCardMode()`.

The mode turns ON when the host calls `enter()` (a click into a value, or the card's Edit button) and OFF on Done, on Escape, on a click outside the card, or on Tab out of it.

- `CardModeProvider({ canEdit, startEditing?, rootClassName?, children })`: renders a `div` (`data-testid="card-mode-root"`, `data-card-mode` = `edit` or `presentation`, `className` = `rootClassName`) around the children. `canEdit` false means presentation for good (`enter` and `openGroup` do nothing, and a card that stops being writable goes back to presentation). `startEditing` opens the card in edit.
- `useCardMode()` returns a `CardMode`: `managed`, `canEdit`, `presentation`, `editing`, `enter()`, `leave()`, `groups`, `opened`, `focusKind`, `showAll`, `openGroup(kind)`, `clearFocus()`, `register(info)`, `chooserOpen`, `setChooserOpen(open)`.
- Groups: `register({ kind, label, section, shown, addable })` tells the card what a group is and whether it is shown, and returns the function that removes it. `groups` lists every registered group (an add chooser lists the ones not shown). `openGroup(kind)` turns edit on, adds `kind` to `opened` and sets `focusKind`; `clearFocus()` clears `focusKind`; `leave()` clears both `opened` and `focusKind`.
- `CardModeActions({ compact?, add? })`: the Edit / Done button (`data-testid` `card-edit` or `card-done`, `aria-pressed`, `aria-label` `Edit this card` or `Done editing this card`) and, unless `add={false}`, the plus button (`card-add-info`, `aria-label="Add information"`, which calls `setChooserOpen(true)`). `compact` draws an icon instead of the words. It draws nothing outside a provider or when `canEdit` is false.
- `CardModeHint()`: the line `Editing. Changes save as you leave a field.` (`card-mode-hint`), drawn in edit only.
- `CardModeBar()`: the hint and the actions on one row (`card-mode-bar`), for a host with no header band.
- `__startCardsInEditMode(on)`: a test seam (see Do not).

The edit mode is left by a click outside the card, but not by a click inside an element that matches `[role="dialog"], [aria-modal="true"], [data-card-keep-edit]`, and not while any modal dialog is open. Escape leaves only when nothing handled it (`defaultPrevented` false) and the target is not inside such an element; it blurs the focused field first. A blur to somewhere outside the card leaves after a zero-delay timer.

## What this is not

- Not the chooser. It holds the group registry the chooser reads and the `chooserOpen` flag; the host draws the chooser.
- Not the groups. The `card-group` unit is the group wrapper that registers into this mode.
- Not a form or a save. Fields save on their own blur; this unit only decides which mode the card is in.
- Not a router for permissions. `canEdit` is passed in by the host.

## How to take it

Package: `@kaigilb/gilbplatformcode-card-mode`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/card-mode
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/card-mode/src";`.

It must exist ONCE in an app. The mode is a React context created in this module: two installed copies are two contexts, and a component reading one never sees the provider of the other. Take it as a peer dependency of any unit that uses it (`card-group` does).

## Examples

```tsx
import { CardModeProvider, CardModeActions, CardModeHint, useCardMode } from "@kaigilb/gilbplatformcode-card-mode";

// Mount ONE provider above the card's header and body.
function Card({ canEdit }: { canEdit: boolean }) {
  return (
    <CardModeProvider canEdit={canEdit} rootClassName="contents">
      <header>
        <h2>Plan</h2>
        <CardModeActions compact />
      </header>
      <CardModeHint />
      <Body />
    </CardModeProvider>
  );
}

function Body() {
  const mode = useCardMode();
  return mode.presentation ? (
    <button type="button" onClick={mode.enter}>{value}</button> // a click on a value enters edit
  ) : (
    <input defaultValue={value} />
  );
}
```

## What the host must supply

- React 19.
- Tailwind, scanning this unit's `src`, so the classes are generated.
- The CSS variables `--accent` (the button colour and focus outline), `--ink-faint` (the hint) and `--serif` (the Edit word). They come from the `editorial-tokens` unit, or define them yourself.
- The header band that holds `CardModeActions`, and the group components that call `register`.

## Do not

- Do not mount more than one provider for the same card. Mount ONE above the card's header and body, so the header's buttons and the body read the same flag.
- Do not call `__startCardsInEditMode` from product code. It is a test seam and it is process-global: while it is on, every new provider starts in edit, `showAll` is true and `leave()` does nothing. Reset it with `__startCardsInEditMode(false)` in `afterEach`.
- Do not use `pointerdown` to leave. The unit listens on `click`, so the field being left has already blurred and saved.
- Do not rely on `canEdit` flipping to true later to start editing; `startEditing` is read when the provider first mounts.

## Wrong readings

- "Outside a provider the card is read-only." The reverse: outside a provider every card is always in edit mode (the LEGACY value: `managed` false, `canEdit` true, `presentation` false, `editing` true, `showAll` true, empty `groups` and `opened`, `focusKind` null, methods that do nothing).
- "`enter()` always starts editing." It does nothing when `canEdit` is false.
- "`leave()` always leaves." It does nothing while `__startCardsInEditMode(true)` is on.
- "`openGroup` only marks a group." It also turns edit on (when `canEdit`).
- "`KEEP_EDIT_SELECTOR` is exported." It is not; it is a module constant. Mark a host element with `data-card-keep-edit` to be inside the card's work.
- "`CardModeHint` says how to start editing." It says that changes save as you leave a field, and only in edit.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/components/records/cardMode.tsx` lines 1-318 (whole file) to `src/cardMode.tsx`. Comments made generic; no code change.

`src/index.ts` is new: it re-exports what the source exports. The tests are new; they pin the behaviour of the source.
