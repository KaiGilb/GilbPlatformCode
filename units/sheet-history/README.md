# sheet-history

Ties an open sheet to the browser's Back button.

## What this is

Ties an open sheet to the browser's Back button.

A full-window sheet is a history entry, so on a phone the system Back button closes the sheet and does not leave the card.

- `useSheetHistory(open, onClosed)`: returns `{ requestClose(after?) }`.
  - When `open` becomes true it pushes ONE entry: the same address, the router's own history state kept, a marker (`gilbSheet: true`) added.
  - The system Back (a `popstate` with the marker gone) calls `onClosed` and does nothing else.
  - `requestClose()` (a Back button in the sheet, Escape, a pick) calls `onClosed` at once and removes the entry it pushed with `history.back()`, only if the marker is still there, so it can never leave the card. With `after`, `after` runs once the entry is gone (on the `popstate`), or after 400 ms if the browser never answers.
  - A sheet unmounted while its entry is still the current one removes the entry too (not when it was already closed or removed).
  - `onClosed` is read fresh at each call.
- `dropStaleSheetEntry()`: call it when a card mounts. A reload (or a forward press) that landed on a sheet's entry steps back off it ONCE, even when several cards, or StrictMode, call it together; calls in the next 500 ms do nothing.
- `__resetSheetHistory()`: a test seam, never called by product code.

**It reads the browser history, not app state.** Nothing in it reads a session, a router, a query client, a setting or an origin: `window.history.state`, `pushState`, `back`, `popstate` listeners and two timers. It is safe to use without a provider. (A router that keeps its own state in `history.state`, such as React Router's, is respected: its keys are copied into the pushed entry.)

## What this is not

- Not a router and not the sheet: it draws nothing.
- Not a modal manager: it does not trap focus or handle Escape; the sheet calls `requestClose`.

## How to take it

Package: `@kaigilb/gilbplatformcode-sheet-history`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/sheet-history` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/sheet-history
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { dropStaleSheetEntry, useSheetHistory } from "@kaigilb/gilbplatformcode-sheet-history";

function Card() {
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => dropStaleSheetEntry(), []);
  const { requestClose } = useSheetHistory(sheetOpen, () => setSheetOpen(false));
  return sheetOpen ? <MySheet onBack={() => requestClose()} onPick={(p) => requestClose(() => openPerson(p))} /> : <button onClick={() => setSheetOpen(true)}>Open</button>;
}
```

It is the `useSheetHistory` and `dropStaleSheetEntry` host members of `org-employees` (`OrgEmployeesHost`): pass the two functions, `{ useSheetHistory, dropStaleSheetEntry }`. The types are equal.

## What the host must supply

None. The unit takes no host. It reads `window.history` and `window.addEventListener`, so it runs in a browser (or jsdom).

## Module state

`useSheetHistory.ts` holds one piece of module state: `dropping`, a boolean that makes `dropStaleSheetEntry` step back once when several cards call it together (cleared by a 500 ms timer). Two installed copies of this unit would each allow one `back()`, and two `back()` calls would leave the card. Install it once; it is a singleton peer of every unit or app that draws a sheet. `__resetSheetHistory()` clears it, for a test.

## Do not

- Do not install a second copy of this unit beside another one (see "Module state").
- Do not call the hook conditionally: it calls `useRef` three times and then `useEffect`, in that order, every render.
- Do not call `history.back()` yourself to close the sheet: use `requestClose`.
- Do not call `__resetSheetHistory` from product code.

## Wrong readings

- "The sheet's entry has its own address." It has the same address; only the history state differs.
- "`after` runs before the sheet closes." The sheet closes first (`onClosed`), then `after` runs when the entry is gone.
- "`dropStaleSheetEntry` steps back on every call." Once per 500 ms, and only on a marked entry.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/useSheetHistory.ts` (whole, 98 lines) to `src/useSheetHistory.ts`.

Imports: `react` only. No unit is needed. Named changes, and only this: comments that name a cycle, an agent, a ticket or a ruling are reworded; no code changed. `src/index.ts` is new.

## Tests

37 tests in 3 files (`npx vitest run`):

- `useSheetHistory.test.tsx` 21, all new. The source has no test of the hook itself. Two component tests reach it: `OrgEmployeesSheet.history.s12.test.tsx` (17 cases) is already ported by `org-employees`, and `AddInformation.history.s12.test.tsx` (5 cases) tests `AddInformation`, a component of the app that is in no unit. The cases here draw a tiny sheet with jsdom's own history: opening (one entry, router state kept, marker, address unchanged, a null state, a re-render), closing from inside (the order `onClosed` then back then `after`, the fallback timer at 400 ms, the marker already gone, a second close), the system Back, unmounting (the entry removed once, not after a close), `onClosed` read fresh, and `dropStaleSheetEntry` (once for several callers for 500 ms, the reset seam). `history.back()` is a fake that pops the entry and fires `popstate` at once, and the timers are fake: no wall-clock waits.
- `exports.test.ts` 3 (the three exports, the fit with `org-employees`' host members, and no `window`).
- `hostAgnostic.test.ts` 13.

Left out: the 5 `AddInformation.history` cases (they need the app's overlay, card group and add-information components).
