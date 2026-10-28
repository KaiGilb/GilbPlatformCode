# remove-control

The delete control of a record card: a named button drawn as a red round minus, which calls the host's `onClick`.

## What this is

The delete control of a record card: a named button drawn as a red round minus, which calls the host's `onClick`.

A red round (minus) button that deletes the row it sits in front of. It is one React component, `RemoveControl`, with these props:

- `label` (required): the accessible name. It must name the thing being removed, for example `Remove address home`. The glyph is `aria-hidden`, so `label` is the button's only name.
- `onClick`: called on a click. There is no confirm and no undo.
- `disabled` (default `false`): the button is disabled and a click does nothing.
- `className` (default `""`): a layout nudge, appended after the unit's own classes with one space. An empty value leaves no trailing space.
- `testId` (optional): written as `data-testid`. With no `testId` the button has no `data-testid`.

The button is `type="button"`, carries `data-remove-control="minus-circle"`, is a `size-6` (24 px) box with a `text-lg` glyph, and has a 40 px hit area (a `before:` box that reaches 8 px past every side) and a visible focus-visible outline. The glyph is an inline SVG: a filled circle with the minus cut out of it. It is coloured with `color: var(--color-error-dark, var(--bad, #b3261e))`.

Put it as the first child of the row it deletes, in front of the content, at the left.

## What this is not

- Not a confirm dialog and not an undo. It calls `onClick` at once; what stops a mis-tap is where you put it, next to the content it deletes.
- Not a deleter. It deletes nothing; the host's `onClick` does.
- Not an icon font. The glyph is an inline SVG, so nothing is loaded.
- Not a text "x" or text minus. Do not draw one in its place.

## How to take it

Package: `@kaigilb/gilbplatformcode-remove-control`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/remove-control
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/remove-control/src";`.

## Examples

```tsx
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";

function AddressRow({ address, onRemove, busy }: Props) {
  return (
    <div className="flex items-start gap-2">
      <RemoveControl
        label={`Remove address ${address.label}`}
        onClick={onRemove}
        disabled={busy}
        className="mt-1"
        testId="address-remove"
      />
      <span>{address.text}</span>
    </div>
  );
}
```

## What the host must supply

- React 19.
- Tailwind, scanning this unit's `src`, so the classes (`size-6`, `before:-inset-2`, `focus-visible:outline`, and the rest) are generated.
- The CSS variable `--color-error-dark`, which is optional. If it is not set, the colour is `--bad`; if that is not set either, it is `#b3261e`.
- The delete itself, inside `onClick`, and the guard against a second click while it runs (pass `disabled`).

## Do not

- Do not draw a text "x" or a text minus for a delete beside this control; use it for every delete in the same kind of card.
- Do not leave out `label`, and do not give it a vague name such as `Remove`: say what is being removed.
- Do not place it at the far edge of the row. Put it first in the row, in front of the content.
- Do not rely on it to ask the user to confirm. It does not.

## Wrong readings

- "`className` replaces the classes." It is appended after them; the base classes stay.
- "`disabled` hides the control." It stays visible at half opacity (`disabled:opacity-50`) and does not call `onClick`.
- "The colour is `--color-error-dark`." That is the first choice only; the fallbacks are `--bad`, then `#b3261e`.
- "It has a default test id." It has none; `data-testid` is written only when `testId` is given. The fixed attribute is `data-remove-control="minus-circle"`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/components/mynet/RemoveControl.tsx` lines 1-63 (whole file) to `src/RemoveControl.tsx`. Comments made generic; no code change.

The tests are ported from `src/components/mynet/RemoveControl.s8cardlook.test.tsx` (whole) and the `RemoveControl` cases of `src/components/mynet/RemoveControl.s8cardux.test.tsx` (the cases that need no other GilbApp module), with added cases for every attribute and class.
