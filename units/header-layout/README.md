# header-layout

Chooses the record card header's layout tier from its width.

## What this is

Chooses the record card header's layout tier from its width.

The record card's header band is one row: the picture, the name, and the Edit / Done and "+" buttons at the right. This unit holds the arithmetic that keeps the row inside its width, as numbers, so a test can hold it (jsdom has no layout), and the hook that measures the width.

- `headerLayout(width, placement)` returns a `HeaderLayout`: `{ tier, avatar, compact, gap, actionsWidth, padX }`, all in px except `tier` and `compact`.
  - Under 270 px: tier `s`, picture 40, compact (icon) buttons, gap 6, buttons 80, padding 16.
  - 270 px up to under 440 px: tier `m`, picture 48, compact, gap 8, buttons 84, padding 16.
  - 440 px and over, and an unknown width (`null`, `0`, negative): tier `l`, picture 96 when `placement` is `"content"` and 128 otherwise, words not icons (`compact: false`), gap 12, buttons 98, padding 32.
- `nameBudget(width, pictureMenu, placement)` is the px left for the name: the width, less the padding, less the picture (and `AVATAR_MENU` more when a picture menu button sits beside it), less two gaps, less the buttons.
- `AVATAR_MENU` is 32: what the picture's menu button adds (4 gap + 28).
- `useElementWidth(ref)` returns the element's border-box width, kept current while it is resized, and `null` until it is measured or when the element has no width (no layout). It reads the width when the component mounts and again each time a `ResizeObserver` says the element changed size. Where there is no `ResizeObserver` it reads once.
- Types `HeaderTier` (`"s" | "m" | "l"`) and `HeaderLayout`.

`placement` is `"full"`, `"content"` or `"actions"`. Only the regular tier looks at it, and only `"content"` changes anything.

## What this is not

- Not the header. It draws nothing and sets no style: the caller turns the numbers into classes.
- Not a layout engine. The tiers are three fixed sets of numbers, chosen by two edges (270 and 440 px).

## How to take it

Package: `@kaigilb/gilbplatformcode-header-layout`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/header-layout` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/header-layout
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { useRef } from "react";
import { headerLayout, nameBudget, useElementWidth } from "@kaigilb/gilbplatformcode-header-layout";

function Header({ canChangePicture }: { canChangePicture: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const layout = headerLayout(width, "full");
  const room = width === null ? null : nameBudget(width, canChangePicture, "full");
  return (
    <div ref={ref} style={{ display: "flex", gap: layout.gap, padding: `0 ${layout.padX / 2}px` }}>
      <span style={{ width: layout.avatar }}>picture</span>
      <span style={{ maxWidth: room ?? undefined }}>name</span>
    </div>
  );
}
```

## What the host must supply

Nothing. The hook uses `ResizeObserver` when the browser has it.

## Module state

None.

## Do not

- Do not call `useElementWidth` with a ref that is never attached: it stays `null` and watches nothing.
- Do not treat `null` as 0: an unknown width gives the regular layout, on purpose.
- Do not call the hook conditionally (it calls `useState` and `useLayoutEffect`, in that order, on every render).

## Wrong readings

- "`placement` picks the tier." The width picks the tier. `placement` only changes the regular tier's picture size.
- "`nameBudget` can be negative only by mistake." It can be: it is plain arithmetic, and in a header narrower than the picture, the gaps and the buttons together the result is under zero. Use it as a hint for a clamp.
- "`useElementWidth` measures on every render." It measures when it mounts and when the observer fires.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/components/records/headerLayout.ts` (whole, 62 lines) to `src/headerLayout.ts`.

Imports: `react` only (`useLayoutEffect`, `useState`, `RefObject`). No unit is needed. Named changes, and only this: the file's header comment is reworded (it named a cycle, an agent and a round); no code changed. The comment-stripped file, imports excluded, equals the source's (0 diff lines). `src/index.ts` is new.

## Tests

38 tests in 4 files (`npx vitest run`):

- `headerLayout.test.ts` 14: the 6 cases of the source's `headerLayout.s10iter1drawer.test.ts`, ported as they are; and 8 new (the three tiers number for number, the two edges, an unknown / zero / negative width in each placement, `placement`, `nameBudget` number for number, the menu's 32 px, monotone in the width).
- `useElementWidth.test.tsx` 8, all new (the source has no test of the hook). It uses a fake `ResizeObserver` and a fake box width, and calls the observer's callback itself, so nothing waits: measures at mount, 0 is `null`, an unattached ref, watches the element once, follows a resize, disconnects on unmount, no `ResizeObserver`, no second watch on a re-render.
- `exports.test.ts` 3.
- `hostAgnostic.test.ts` 13.

Nothing from the source is left out.
