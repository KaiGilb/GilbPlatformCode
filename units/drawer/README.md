# drawer

A slide-over panel from the left or the right, for a narrow window. Escape, the backdrop, or Close shuts it, and focus comes back.

## What this is

`<Overlay open onClose side title>` draws, while `open`:

- a backdrop that closes it on click,
- a panel at 86 % of the width, at most 380 px, sliding in from `side`,
- a header with the title and a Close button,
- your content, scrolling inside the panel.

It is a modal dialog (`role="dialog"`, `aria-modal="true"`), named by `ariaLabel` or else by `title`. While open, Escape closes it and the page behind does not scroll. Focus moves into the panel on the next frame and goes back to what had it when the panel closes.

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

## What you pass

`open`, `onClose`, `side` (`"left"` or `"right"`), `title`, optional `ariaLabel`, and `children`.

## What you get

Nothing while closed. The dialog while open.

## Host must supply

Tailwind and the `editorial-tokens` sheet (`--ink`, `--paper-2`, `--line-2`, `--sel`, `--serif`, `--shadow-lg`). The slide and fade keyframes ship inside the component.

## Do not

- Do not pass a new `onClose` function on every render if you can avoid it. The effect that wires Escape, the scroll lock and focus runs again each time `onClose` changes.
- Do not put a second bottom bar under it. It already leaves 64 px for one.

## Wrong readings

- Escape closes. It does not confirm anything.
- The backdrop is a button named "Close panel". It is the second way out; the bottom-bar toggle and the Close button are the others.

## Source

`Overlay` from Kai's `gilb-shell` package, which took it unchanged from GilbApp `src/components/ui/Overlay.tsx`. Classes are joined by `class-merge`.
