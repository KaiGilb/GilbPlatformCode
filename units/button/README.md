# button

One button look for every app: primary, secondary, ghost, or danger. Every size is at least 44 px tall. The `icon` size is also 44 px wide.

## What this is

`<Button variant size className ...>` renders one `<button>`. It forwards the ref and every native button prop.

| Variant | Look |
|---|---|
| `primary` (default) | accent fill, on-accent text, small shadow |
| `secondary` | surface fill, a line border |
| `ghost` | no fill; soft ink, darkens on hover |
| `danger` | no fill; the bad colour, a faint bad-coloured border |

| Size | Look |
|---|---|
| `sm` | smaller text and padding |
| `md` (default) | the normal button |
| `icon` | a 44 px square |

## What this is not

- Not a link. A control that navigates is an `<a>`.
- Not a colour sheet. The colours are the `editorial-tokens` variables.

## How to take it

Package: `@kaigilb/gilbplatformcode-button`

```tsx
import { Button } from "@kaigilb/gilbplatformcode-button";

<Button variant="secondary" onClick={save}>Save</Button>
```

### Installing it into your app

Install it as a copy, not a link, so your app has one copy of React. First put this line in your app's own `.npmrc` (the unit's own `.npmrc` does not apply to your app's install):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/button
```

Every later `npm install` and `npm ci`, CI included, then keeps the copy. Without that line a plain install makes a link, the unit brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist". A one-off `npm install --install-links <path>` works only until the next plain install, and `npm ci` then refuses the lock file.

## What you pass

Any native button prop, plus `variant` and `size`. A host `className` is merged last, so it wins a conflict (`px-8` replaces `px-4`).

## What you get

A `<button>` with `type="button"` unless you pass a type.

## Host must supply

Tailwind and the `editorial-tokens` sheet (`--accent`, `--on-accent`, `--surface`, `--ink`, `--line`, `--focus`, `--bad`, `--r-md`, `--shadow-sm`, ...). Without them the button renders, unstyled.

## Do not

- Do not trim the tap target with a host class on `sm`. `sm` trims the text and the padding, never the hit area.
- Do not put a hex colour in a host class. One anchor edit in the token sheet is meant to recolour every button.

## Wrong readings

- No `type` does not mean submit. Inside a form this button does not submit unless you pass `type="submit"`.

## Source

`Button` from the private `gilb-shell` package, which took it unchanged from GilbApp `src/components/ui/Button.tsx`. Classes are joined by `class-merge`.
