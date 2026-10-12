# class-merge

Joins class names. When two Tailwind classes set the same thing, the later one wins.

## What this is

`cn(...inputs)` returns one class string. It reads its inputs as `clsx` does, then `tailwind-merge` drops the earlier of two classes that set the same property.

## What this is not

- Not a style sheet, and not a design token. Colours live in `editorial-tokens`.
- Not a CSS-in-JS runtime. It only joins strings.

## How to take it

Package: `@kaigilb/gilbplatformcode-class-merge`

```ts
import { cn } from "@kaigilb/gilbplatformcode-class-merge";

<div className={cn("rounded-[var(--r-lg)] p-5", className)} />
```

## What you pass

Strings, conditional objects (`{ "font-semibold": active }`), arrays, and falsy values.

## What you get

One string. A falsy value adds nothing. No input is `""`.

## Examples

```ts
cn("p-4", "p-2");                        // "p-2"
cn("a", false, { b: true, c: false });   // "a b"
```

## Host must supply

Tailwind, when the classes are Tailwind classes. Without it the string is still joined; it just styles nothing.

## Do not

- Do not concatenate a host class onto a component's own classes with `+`. Two padding classes then both apply, and which wins depends on the order of the style sheet, not on the order you wrote.

## Wrong readings

- Not every repeated word is dropped. Only classes that set the same property conflict. `"p-4 m-4"` keeps both.

## Source

`cn` from Kai's `gilb-shell` package, which took it unchanged from GilbApp `src/lib/cn.ts`. `button`, `card` and `drawer` use it.
