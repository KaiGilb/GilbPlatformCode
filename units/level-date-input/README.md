# level-date-input

The date field of a level's popover in the value graph: a labelled date input that reports change, Enter, blur and Escape to the host, and shows a year alert when the host asks for it.

## What this is

The date field of a level's popover in the value graph, as one component: a labelled date input that tells the host on change, on Enter, on blur and on Escape, and shows the year alert when the host asks for it.

`<LevelDateField defaultValue showYearError onYearCheck onCommit onEscape />` returns a fragment: the `Date` label with its input, then (only when `showYearError` is true) a paragraph with `role="alert"` and the text `Year must be 1900–2200`.

- Change: calls `onYearCheck(yearOutOfRange(value))`. The host sets its alert state from it.
- Enter: calls `onCommit(value)`.
- Blur: calls `onCommit(value)`.
- Escape: stops the event from going further, then calls `onEscape()`.
- Any other key does nothing.

`LEVEL_DATE_ERROR_TESTID` (`"plan-date-year-error"`) is the alert's `data-testid`.

The host keeps three things: the React `key` on the component, the alert state, and the decision to write. The field is uncontrolled (`defaultValue`), so give it a `key` that changes with the level and its date, for example `key={`${levelId}|${when}`}`; a new date then shows in the field. The write decision is the host's: `onCommit` also fires for a half-typed or out-of-range date. Use `levelDateWritable` from the peer unit `date-rules` to decide.

## What this is not

- Not a date picker widget. The input is the browser's own `<input type="date">`.
- Not the level popover, the value graph or any state. It holds none.
- Not a writer. It never writes a date; it passes the value to `onCommit`.
- Not the year rules. Those are the `date-rules` unit, which this one takes as a peer.

## How to take it

Package: `@kaigilb/gilbplatformcode-level-date-input`

Take it together with its peer `date-rules`. Put this line in your app's own `.npmrc` so both are installed as copies and not links (one copy of React):

```
install-links=true
```

Then install both:

```sh
npm install <path-to-the-library>/units/date-rules <path-to-the-library>/units/level-date-input
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/level-date-input/src";`.

## Examples

```tsx
import { useState } from "react";
import { LevelDateField } from "@kaigilb/gilbplatformcode-level-date-input";
import { levelDateWritable } from "@kaigilb/gilbplatformcode-date-rules";

function LevelDate({ level, onWrite, onClosePopover }: Props) {
  const [badYearFor, setBadYearFor] = useState<string | null>(null);
  return (
    <LevelDateField
      key={`${level.id}|${level.when}`}
      defaultValue={level.when}
      showYearError={badYearFor === level.id}
      onYearCheck={(bad) => setBadYearFor(bad ? level.id : null)}
      onCommit={(value) => {
        if (value === level.when || !levelDateWritable(value)) return;
        onWrite(value);
      }}
      onEscape={onClosePopover}
    />
  );
}
```

## What the host must supply

- Tailwind, scanning this unit's `src`, so the classes are generated.
- The CSS variable `--danger` for the alert's colour, if the fallback `#b91c1c` does not suit.
- React 19, and the `date-rules` unit installed beside this one.
- The `key`, the alert state (`showYearError` and what `onYearCheck` sets), and the write decision inside `onCommit`.

## Do not

- Do not list `date-rules` under this unit's `dependencies` or give the app a second copy of it.
- Do not write on every change. The field is written on Enter or when it is left, never per keystroke.
- Do not leave out the `key`: without it the field keeps showing what was typed after the stored date changes.
- Do not call `onCommit`'s value a valid date. It can be empty, half typed or out of range; check it.

## Wrong readings

- "It validates the date." It only reports whether the year is out of range, on change. Whether to write is the host's.
- "Escape closes the popover." It calls `onEscape` after stopping the event; closing is the host's.
- "The alert shows when the year is wrong." It shows when `showYearError` is true. The host sets that from `onYearCheck`.
- "Blur and Enter write twice." Both call `onCommit`; the host should skip a value equal to the stored one.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/components/records/PlanValueGraph.tsx` lines 1022-1048 (the date field and its year alert in the level popover); the write rule it is paired with is `commitWhen`, lines 597-602, and the test it is ported from is `src/components/records/PlanValueGraph.v30.test.tsx` lines 247-267.

Changes: the field is lifted into one component whose state and handlers are props (`setBadYearFor(...)` became `onYearCheck`, `commitWhen(openAt, value)` became `onCommit`, `setOpen(null)` became `onEscape`); the `key` stays with the host; the alert's visibility is the `showYearError` prop. The markup and classes are as in the source. Comments are rewritten.
