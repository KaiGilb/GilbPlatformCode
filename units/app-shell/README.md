# app-shell

The frame of an app: three resizable regions on a wide window; below 840 px the centre alone, a bottom bar, and the side regions as drawers. The host fills the regions.

## What this is

`<ShellFrame layoutOptions header left center right ...>` draws:

- a top bar with the host's `header` in the middle and, on a wide window, a toggle for each side region that exists;
- at **expanded** width (840 px and up): left, centre and right as resizable regions (the `panes` unit);
- at **compact** (under 600 px) and **medium** (600 to 839 px): the centre alone, a fixed bottom bar with a button per side region, and each side region as a slide-over drawer (the `drawer` unit). The bottom bar stays above the drawer, so the button that opened a drawer also closes it. Going to a wide window closes any open drawer, so it does not reopen when the window narrows again.

Inside the frame, `useShellCore()` gives `sizeClass`, `layout`, `detailOpen`, `openDetail()` and `closeDetail()`. `openDetail` un-collapses the right region on a wide window and opens its drawer on a narrow one; it is not a toggle. An app's own shell context can `extend ShellCoreValue`, so a component written against the core works in every app.

`useShellLayout(options)` is the three-region state: both widths and whether each side is collapsed, kept in `localStorage` under the host's key, widths clamped to the limits (the host's default widths too). When the key changes, the layout stored under the new key is read; the old layout is not written over it. It also returns the limits in force, which the dividers report to assistive technology. A host or test double that builds its own `ShellLayoutApi` or `ShellCoreValue` must supply `leftMin`, `leftMax`, `rightMin` and `rightMax` too. `BottomButton`, `PanelLeftIcon` and `PanelRightIcon` are exported so a host's extra controls look the same.

## What this is not

- Not the app's sections, vault selection or sign-in. What a section is, what a vault is, and who is signed in stay in the host.
- Not a router. Opening a region does not change the address.
- Not vault data. The stored layout is a per-browser preference.

## How to take it

Package: `@kaigilb/gilbplatformcode-app-shell`

```tsx
import { ShellFrame, useShellCore } from "@kaigilb/gilbplatformcode-app-shell";

<ShellFrame
  layoutOptions={{ storageKey: "myapp.shell.layout.v1" }}  // one key per app
  header={<Wordmark />}
  left={<Selection />}
  center={<TopicList />}
  right={<TopicDetail />}
/>;
```

It depends on three units, by `file:` path: `panes` (the wide layout), `size-class` (the three widths) and `drawer` (the narrow side regions). Each unit's `.npmrc` sets `install-links=true`, so when you install inside the library, a sibling unit is installed as a copy with its own dependencies. That file does not govern your app's install: see below.

### Installing it into your app

Install it as a copy, not a link, so your app has one copy of React. First put this line in your app's own `.npmrc` (the unit's own `.npmrc` does not apply to your app's install):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/app-shell
```

Every later `npm install` and `npm ci`, CI included, then keeps the copy. Without that line a plain install makes a link, the unit brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist". A one-off `npm install --install-links <path>` works only until the next plain install, and `npm ci` then refuses the lock file.

## What you pass

| Prop | Meaning |
|---|---|
| `layoutOptions` | `storageKey` (required, one per app); optional `defaults`, `leftMin`, `leftMax`, `rightMin`, `rightMax` |
| `header` | the top bar's middle. Omit for no top bar. With no top bar there are no side toggles, so on a wide window a collapsed side region can only be reopened by the host, through `useShellCore().layout.expandLeft()` or `expandRight()`. |
| `left`, `right` | the side regions. Omit one and no toggle, button or drawer is drawn for it. |
| `center` | the centre region |
| `leftTitle`, `rightTitle` | drawer titles (default `Workspace`, `Detail`) |
| `leftLabel`, `rightLabel` | bottom-bar labels (default `Selection`, `Detail`) |
| `bottomExtras` | more bottom-bar buttons, between the two side buttons |

## What you get

The frame, and the core through `useShellCore()`. Defaults when nothing is stored: left collapsed at 300 px, right open at 376 px; left 180 to 440 px, right 280 to 520 px. A stored width outside the limits is clamped. A stored value that is not JSON gives the defaults. A missing collapsed flag keeps its default.

## Host must supply

- Tailwind and the `editorial-tokens` sheet (`--paper`, `--paper-2`, `--surface`, `--ink`, `--ink-soft`, `--line-2`, `--sel`, `--accent`, `--r-md`, ...).
- A bundler that compiles TSX with the automatic JSX runtime for packages too. Vite with `@vitejs/plugin-react` does. This unit's own `vitest.config.ts` sets `esbuild: { jsx: "automatic" }` for the same reason.
- A full-height parent. The frame is `h-full`.

## Do not

- Do not share one `storageKey` between two apps on one origin. They will fight over one stored layout.
- Do not call `useShellCore()` outside a `ShellFrame`. It throws.
- Do not open the detail region by calling `layout.expandRight()` from a narrow window. Call `openDetail()`; it picks the pane or the drawer.

## Wrong readings

- `detailOpen` is false when there is no `right` region, whatever the stored layout says.
- At 839 px the window is medium, not expanded. The panes start at 840.
- The left region starts collapsed. Its content is not in the page until the person opens it.

## Source

The private `gilb-shell` package 0.1.0: `ShellFrame` is the render frame of GilbApp's app shell; `useShellLayout` is GilbApp's layout hook with the storage key and limits passed by the host; `ShellCore` is the frame part of GilbApp's shell context. `gilb-shell`'s copies of `sizeClass`, `paneMath`, `Panes` and `tokens.css` are not repeated here: they are the `size-class`, `panes` and `editorial-tokens` units.
