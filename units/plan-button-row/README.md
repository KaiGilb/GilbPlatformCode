# plan-button-row

A right-aligned row of buttons for a card, in Mac order: the positive action is the rightmost one.

## What this is

A right-aligned row of buttons for a card, in Mac order, with the positive action (Done, Save, Add, Make…) as the rightmost child and Cancel, Clear, Remove or Discard to its left.

`<PlanButtonRow className?>children</PlanButtonRow>` draws one `div` with `data-plan-button-row=""` and the classes `flex w-full flex-wrap items-center justify-end gap-3`. A `className` is added after them. The caller passes the children in the order they should appear; the row only lays them out and does not restyle the buttons.

## What this is not

- Not a button. The buttons are the host's own.
- Not a reorder. The row does not sort, so the caller puts the positive action last.
- Not a form. It has no submit or cancel behaviour.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-button-row`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/plan-button-row
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link (one copy of React):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/plan-button-row/src";`.

## Examples

```tsx
import { PlanButtonRow } from "@kaigilb/gilbplatformcode-plan-button-row";

<PlanButtonRow>
  <button onClick={onCancel}>Cancel</button>
  <button onClick={onSave}>Save</button>
</PlanButtonRow>;

<PlanButtonRow className="mt-2">
  <button onClick={onRemove}>Remove</button>
  <button onClick={onDone}>Done</button>
</PlanButtonRow>;
```

## What the host must supply

- Tailwind, scanning this unit's `src`, so the classes are generated.
- React 19.

## Do not

- Do not pass the children with the positive action first; the row does not reorder them.
- Do not use it for a row that should be left-aligned or spread; it is `justify-end` by design.
- Do not put layout-changing classes in `className` expecting them to replace the base ones; they are appended, not merged.

## Wrong readings

- "It styles the buttons." It does not; it only sets the row's layout.
- "An empty `className` adds a space." It does not: the class string is trimmed.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/components/records/PlanButtonRow.tsx` (whole file, lines 1-13). The header comment is reworded; no code change.
