# button

One button look for every app: primary, secondary, ghost, or danger. Every size keeps a 44 px tap target.

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

`Button` from Kai's `gilb-shell` package, which took it unchanged from GilbApp `src/components/ui/Button.tsx`. Classes are joined by `class-merge`.
