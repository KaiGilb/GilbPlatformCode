# qualifier-value-picker

One chooser for the value or values of a qualifier: the defined options with their definitions as hints, ALL ("every value"), a free-text "Other…" and Clear.

## What this is

One chooser for the value or values of a qualifier: the defined options with their definitions as hints, ALL ("every value"), a free-text "Other…" and Clear.

One chooser for the value or values of a qualifier: it lists the qualifier's defined options with their definitions as hints, ALL ("every value"), a free-text "Other…" and Clear. Several options may be ticked; ALL is exclusive. Enter or leaving commits ONE change; Escape commits nothing. It is shared by the level lines, the Meter qualifier and the Illustration filter of the Value card.

`PlanQualifierValue({ label, name, options, defaultOption?, value, used?, single?, notInScale?, onCommit, close })`:

- `label`: the accessible name, such as "Level 2 Country". `name`: the qualifier's name. `options`: the defined options, `{ name, definition }` each (a blank name is not offered). `defaultOption`: the option shown with the hint "Default" when it has no definition. `value`: the current value, a string, a list of strings or undefined. `used`: values used on other levels, offered as a datalist when the qualifier has no options. `single`: one value only (the Illustration filter and the Meter qualifier). `notInScale`: the name is no longer in the Scale; the choice is kept, greyed, with the note "Not in the Scale", and can be cleared.
- `onCommit(next)` is called with `""` (none), a string (one value), or a list (two or more), as `packQualifierValues` of the `qualifier-values` peer packs them; ALL alone is `"ALL"`. It is called at most once, and not at all when the result equals the current value (compared as lists, in order, without case or padding). `close()` is called once when the chooser ends, with or without a commit.
- Rows: ALL first (hint "Every value of <name>"), then the defined options in order (hint: the definition, else "Default" for the default option), then any current or ticked value that is not a defined option (once, without case). Each row is a checkbox named `<label> <row>` with `data-qv-row="<row>"`, in a container with `data-testid="qv-rows"`.
- Ticking: in the multi mode ticking ALL unticks the others, and ticking anything else unticks ALL. With `single` a tick replaces the last, and ticking it again unticks it.
- "Other…": a text box with `data-qv-row-free=""`, named `Other value for <label>`, placeholder "Other…". In the multi mode Enter in it ticks the typed word (dropping ALL, once, without case) and empties the box; Done adds any text still in the box. With no defined options the box is the main input: named `Edit <label>`, focused on mount, placeholder is `name`, filled with the current value, and Enter commits.
- Keys: Escape commits nothing, calls `close` and stops the key (`preventDefault` and `stopPropagation`). Enter on a row with nothing ticked and nothing typed commits that row's value at once; otherwise Enter commits like Done. ArrowDown and ArrowUp move focus between the rows, wrapping; from the Other box, down goes to the first row and up to the last.
- Leaving: when focus moves to something outside the group (a click outside included), or to nothing, the chooser commits and closes. Focus moving between its own controls does nothing.
- The group: `role="group"` with `aria-label="Choose <label>"` exactly, and `data-not-in-scale="yes"` only when `notInScale`. Another unit finds the open chooser by the selector `[role="group"][aria-label^="Choose "]`, so that label form is part of this unit's contract.
- Buttons: `Clear` (named `Clear <label>`) and `Done`, in a `plan-button-row`: Clear on the left, Done rightmost.

Exports: `PlanQualifierValue`, and the types `QualifierPick` (`string | string[]`) and `QualifierValueProps`.

## What this is not

- Not a store. It never writes; `onCommit` is told the new value.
- Not the popover. It draws no panel, backdrop or position: the host puts it where it should be, decides when it is open, and unmounts it on `close`.
- Not a place that knows what a qualifier is. The options and their definitions are given.
- Not the rules for packing a value. ALL, de-duplication and the list-or-string choice belong to `qualifier-values`.

## How to take it

Package: `@kaigilb/gilbplatformcode-qualifier-value-picker`

Take it together with its peers `plan-button-row` and `qualifier-values`. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of React):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/qualifier-value-picker
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/qualifier-value-picker/src";`.

## Examples

```tsx
import { PlanQualifierValue } from "@kaigilb/gilbplatformcode-qualifier-value-picker";

{open && (
  <PlanQualifierValue
    label="Level 2 Platform"
    name="Platform"
    options={[{ name: "iPhone", definition: "Apple phone" }, { name: "Android", definition: "" }]}
    defaultOption="Android"
    value={level.platform}            // "", "iPhone", or ["iPhone", "Android"]
    onCommit={(next) => saveQualifier(level, "Platform", next)} // "" | string | string[]
    close={() => setOpen(false)}
  />
)}
```

## What the host must supply

- React 19, and the peers `plan-button-row` and `qualifier-values`, each installed once.
- Tailwind v4 scanning this unit's `src`, so the classes are generated (arbitrary values such as `rounded-[var(--r-md)]`, `text-[14px]`, `max-h-[11rem]` are used).
- These CSS variables: `--focus` (the border), `--surface` (the panel and the box), `--ink` (the text), `--ink-soft` (the Clear button, and the fallback for the hints), `--ink-faint` (the hints; it falls back to `--ink-soft`), `--line` (the box's border), `--accent` (the Done button) and `--r-md` (the radius). They come from the `editorial-tokens` unit or your own theme.
- The place and the open state: the host mounts the chooser when it should show, positions it, and unmounts it in `close`.
- The saving, in `onCommit`.

## Do not

- Do not keep it mounted after `close`: it ends once (`onCommit` and `close` are never called again), so a second use needs a new mount (a new `key`).
- Do not change `label` to something else for the sake of looks: the group's `aria-label` is `Choose <label>`, and other code finds the chooser by it.
- Do not wrap it in a container that swallows Escape before it: the chooser stops Escape itself so that the layer around it does not close too.
- Do not expect `onCommit` for an unchanged value: nothing is committed then (`close` still is called).

## Wrong readings

- "Pressing Enter on Clear clears." Enter on the Clear button commits the ticks like Done; only a click clears.
- "Enter on an Other… word commits it." In the multi mode it only ticks the word; Done (or Enter in the empty box) commits. With no options, or with `single`, Enter commits.
- "`single` allows only one value." Ticking is one at a time, but text typed in the Other box is added to the tick when it commits, so `["iPhone", "Watch"]` is possible.
- "Typing `all` is a word." Any case of ALL is the ALL value: it commits `"ALL"`.
- "The same set in another order is not a change." The order is compared: re-ticking a value puts it last, and that is a change.
- "Leaving always commits." It commits what is ticked and typed; if that equals the current value nothing is committed. After Escape, Done or a commit, leaving does nothing.
- "Enter on a row picks it." Only when nothing is ticked and nothing is typed; with a tick, Enter commits the ticks.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: `src/components/records/PlanQualifierValue.tsx` (whole, 163 lines) to `src/PlanQualifierValue.tsx`. Comments made generic (internal tags removed from the header comment and from the `notInScale` comment). Code verbatim except the two imports: `./PlanButtonRow` is `@kaigilb/gilbplatformcode-plan-button-row`, and `../../lib/base/planValue` (`ALL_VALUE`, `packQualifierValues`, `qualifierValues`) is `@kaigilb/gilbplatformcode-qualifier-values`.

`src/index.ts` is new. The tests are ported from `src/components/records/PlanButtonRow.vaultit.test.tsx` (1 case: Clear then Done, right-aligned, Done commits); `src/PlanQualifierValue.test.tsx` is new and pins every prop, testid, aria name and data attribute.
