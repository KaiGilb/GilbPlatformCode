# card

One card look for every app: a raised surface with a header, a title, a description, and content.

## What this is

Five parts, each a plain element with the card's classes:

| Part | Element | Look |
|---|---|---|
| `Card` | `div` | rounded, surface fill, faint border, small shadow |
| `CardHeader` | `div` | padding, a small gap |
| `CardTitle` | `h2` | serif, 19 px, semibold |
| `CardDescription` | `p` | 13.5 px, faint ink |
| `CardContent` | `div` | padding |

## What this is not

- Not a data card. What goes in it is the host's.
- Not a layout. Cards are placed by the host.

## How to take it

Package: `@kaigilb/gilbplatformcode-card`

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kaigilb/gilbplatformcode-card";

<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
    <CardDescription>What this card is for.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### Installing it into your app

Install it as a copy, not a link, so your app has one copy of React:

```sh
npm install --install-links <path-to-the-library>/units/card
```

Or put `install-links=true` in your app's own `.npmrc` before you install. The unit's own `.npmrc` does not apply to your app's install. A plain `npm install <path>` makes a link, the unit then brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist".

## What you pass

`Card`, `CardHeader` and `CardContent` take any `div` prop. `CardTitle` and `CardDescription` take `children` and `className` only. A host `className` is merged last, so it wins a conflict.

## What you get

Plain elements. No state, no events of its own.

## Host must supply

Tailwind and the `editorial-tokens` sheet (`--surface`, `--line-2`, `--ink`, `--ink-faint`, `--serif`, `--r-lg`, `--shadow-sm`).

## Do not

- Do not use `CardTitle` where the page already has an `h2` at a different level. It is always an `h2`.

## Wrong readings

- `CardTitle` does not forward other `h2` props, such as `id`. Wrap it, or use your own heading.

## Source

`Card` from the private `gilb-shell` package, which took it unchanged from GilbApp `src/components/ui/Card.tsx`. Classes are joined by `class-merge`.
