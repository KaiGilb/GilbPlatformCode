# plan-button-row

The action row: every row of buttons in an app (dialog buttons, form Save/Cancel, a record's Edit and Delete, a Delete confirm).

## What this is

The action row: every row of buttons in an app (dialog buttons, form Save/Cancel, a record's Edit and Delete, a Delete confirm). It is a right-aligned row in Mac order, with the positive action (Done, Save, Add, Make…) as the rightmost child and Cancel, Clear, Remove or Discard to its left.

`<PlanButtonRow className?>children</PlanButtonRow>` draws one `div` with `data-plan-button-row=""` and the classes `gs-actionrow flex w-full flex-wrap items-center justify-end gap-3`. A `className` is added after them. With the children API the caller passes the children in the order they should appear; the row only lays them out and does not restyle the buttons. The structured API (`primary`, `cancel`, `destructive`) orders them for you; see "The Mac order (required)".

## The Mac order (required)

Every app built on GilbPlatform uses the Mac order in every row of two or more buttons: a dialog, sheet, form, confirmation, or a record's own actions (Edit, Delete, Share). The row is right-aligned. The positive action is rightmost and is the default: Return triggers it. Its label is a verb that names the act (Save, Add bicycle, Give access), never OK or Yes. Cancel (or Close) sits immediately to its left: Esc triggers it. A destructive or third action (Delete, Don't save) sits alone at the far left. When the destructive act is the row's whole purpose (a 'Delete this bicycle?' confirmation), it is the rightmost, red button and Cancel stays the default. On a phone the order stays the same: if the row is too narrow, the buttons share the width in equal parts. Never put the positive action first. Build the row with the code bank's PlanButtonRow (t:ScreenButton.row).

(RuleUiActionRowMacOrder, Kai 2026-11-11; widened to every row of two or more buttons, 2026-11-14.)

### The three-slot API

`<PlanButtonRow primary={…} cancel={…} destructive={…} />` puts the slots in the right order whatever order the props are written in: `destructive` at the far left (pushed there with `margin-right:auto`), then `cancel`, then `primary` rightmost, the whole row right-aligned. Any slot may be left out. Below 360px of container width (a Tailwind v4 container query, `@max-[360px]`) the slots share the width in equal parts, in the same order. The children API below is unchanged and still works.

```tsx
<PlanButtonRow cancel={<button onClick={onCancel}>Cancel</button>} primary={<button onClick={onSave}>Save</button>} />

<PlanButtonRow
  destructive={<button onClick={onClear}>Clear</button>}
  cancel={<button onClick={onCancel}>Cancel</button>}
  primary={<button onClick={onSave}>Save</button>}
/>

// A "Delete this bicycle?" confirmation: the destructive act is the whole purpose, so it is
// the rightmost (red) button and Cancel stays the default. Use the primary slot for the red one.
<PlanButtonRow cancel={<button autoFocus onClick={onCancel}>Cancel</button>} primary={<button className="bg-red-600" onClick={onDelete}>Delete bicycle</button>} />
```

`confirm` marks the row whose whole purpose is the destructive act: the far slot is dropped (a `destructive` prop is ignored), the order is Cancel then `primary`, and the row carries `data-confirm` and `data-default="cancel"`. Paint the primary red yourself (class `gs-btn gs-btn--danger gs-btn--primary` from the style-runtime button looks, or your own). The structured row also carries the class `gs-actionrow` and marks the destructive slot `gs-actionrow__far`; it writes the shared action-row CSS once (a copy of style-runtime's `ACTION_ROW_CSS`, kept identical by a test), so the equal-share rule on a narrow row works without Tailwind too. The children API row carries `gs-actionrow` and the same CSS too, with every Tailwind class kept as before.

A host without Tailwind can pass `style` (applied to the row itself, e.g. `display:flex; justifyContent:flex-end; gap:12`); the order is then still right, but the narrow-width sharing needs Tailwind v4 container queries.

### A record's Edit and Delete

A record view is a row of two buttons too: Delete alone at the far left, Edit (the primary) rightmost.

```tsx
<PlanButtonRow
  destructive={<button className="gs-btn gs-btn--danger" onClick={onDelete}>Delete</button>}
  primary={<button className="gs-btn" onClick={onEdit}>Edit</button>}
/>
// [Delete] .................. [Edit]

// "Delete this camera?": the destructive act is the whole purpose.
<PlanButtonRow
  confirm
  cancel={<button className="gs-btn gs-btn--secondary" autoFocus onClick={onCancel}>Cancel</button>}
  primary={<button className="gs-btn gs-btn--danger gs-btn--primary" onClick={onDelete}>Delete camera</button>}
/>
// .................. [Cancel] [Delete camera]
```

### Return and Esc are the host's job

The unit is host-agnostic and does not know the dialog around it, nor the handlers inside the buttons you pass. It wires no keys. The host binds Return to the primary button and Esc to the cancel button on its dialog or form (a `<form>` with a `type="submit"` primary gives Return for free; the dialog's `onKeyDown` or `<dialog>` cancel event gives Esc).

### Wrong readings

- Positive action first (`Save  Cancel`). The positive action is rightmost.
- Left-aligned, or spread across the width on a wide screen. The row is right-aligned; never two full-width buttons on a wide screen.
- A record view with Edit and Delete in any other order, or Delete beside Edit. Delete is alone at the far left.
- `Delete` rightmost next to `Save`. A destructive third action goes alone at the far left; it is rightmost only when it is the row's whole purpose, and then there is no Save.
- A label of OK or Yes. Use the verb that names the act.
- In dev, a children row whose last child reads Cancel, Close, No or Back logs a `console.warn` ("positive action must be rightmost").

## What this is not

- Not a button. The buttons are the host's own.
- Not a reorder of children. With the children API the row does not sort, so the caller puts the positive action last; the structured API places the three slots itself.
- Not a form. It has no submit or cancel behaviour, and no keyboard keys.

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

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/components/records/PlanButtonRow.tsx` (whole file, lines 1-13). The header comment is reworded; no code change. Added after the copy (0.1.1): the optional `primary` / `cancel` / `destructive` slots, the narrow-width rule and the dev warning; the children API is unchanged.
