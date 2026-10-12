# drawer

A slide-over panel from the left or the right, for a narrow window. Escape, the backdrop, or Close shuts it, and focus comes back.

## What this is

`<Overlay open onClose side title>` draws, while `open`:

- a backdrop that closes it on click,
- a panel at 86 % of the width, at most 380 px, sliding in from `side`,
- a header with the title and a Close button,
- your content, scrolling inside the panel.

It is a modal dialog (`role="dialog"`, `aria-modal="true"`), named by `ariaLabel` or else by `title`. While open, Escape closes it and the page behind does not scroll. Focus moves into the panel on the next frame and goes back to what had it when the panel closes. A new `onClose` function on each render is fine: Escape calls the latest one, and focus moves only when `open` changes.

It stops 64 px above the bottom of the window, so a fixed bottom bar stays visible and tappable below it. The same bottom-bar button that opened the drawer can close it. `app-shell` uses it that way.

## What this is not

- Not a router. Opening it does not change the address.
- Not a focus trap. Tab can leave the panel.
- Not a wide-screen panel. At wide widths, `app-shell` shows the same regions as panes instead.

## How to take it

Package: `@kaigilb/gilbplatformcode-drawer`

```tsx
import { Overlay } from "@kaigilb/gilbplatformcode-drawer";

<Overlay open={open} onClose={() => setOpen(false)} side="left" title="Workspace">
  <Selection />
</Overlay>
```

### Installing it into your app

Install it as a copy, not a link, so your app has one copy of React:

```sh
npm install --install-links <path-to-the-library>/units/drawer
```

Or put `install-links=true` in your app's own `.npmrc` before you install. The unit's own `.npmrc` does not apply to your app's install. A plain `npm install <path>` makes a link, the unit then brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist".

## What you pass

`open`, `onClose`, `side` (`"left"` or `"right"`), `title`, optional `ariaLabel`, and `children`.

## What you get

Nothing while closed. The dialog while open.

## Host must supply

Tailwind and the `editorial-tokens` sheet (`--ink`, `--ink-faint`, `--paper-2`, `--line-2`, `--sel`, `--serif`, `--shadow-lg`). The slide and fade keyframes ship inside the component.

## Do not

- Do not count on Escape closing the drawer when a control inside it already handled Escape and called `preventDefault()`. The drawer then stays open, so a menu or picker inside it can close itself first.
- Do not put a second bottom bar under it. It already leaves 64 px for one.

## Wrong readings

- Escape closes. It does not confirm anything.
- The backdrop is a button named "Close panel". It is the second way out; the bottom-bar toggle and the Close button are the others.

## Source

`Overlay` from the private `gilb-shell` package, which took it unchanged from GilbApp `src/components/ui/Overlay.tsx`. Classes are joined by `class-merge`.
