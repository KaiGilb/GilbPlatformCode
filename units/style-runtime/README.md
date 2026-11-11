# style-runtime

Applies the app's style at start: loads one `style.tokens.json`, checks it, and writes the CSS custom properties before the first render, with no flash and an offline fallback.

## What this is

`loadStyle({ fetchRemote, fallbackUrl, cacheKey })` reads the app's style sheet, validates it, and keeps exactly one `<style id="gilb-style">` in `<head>`. Every new app takes it by default.

- The cached sheet (from the last visit) is applied at once, so there is no flash.
- A fresh sheet from `fetchRemote` replaces it when it is valid.
- The app's own `/style.tokens.json` is used only when the remote fails and nothing was cached.
- `loadStyle` never throws; it returns `{ source, errors }` (`source` is `cache`, `remote`, `fallback` or `none`).

It also holds the rest of the runtime: `validateStyleSheet`, `toCssVars`, `toCssText`, `applyStyleSheet`, `paletteFromSeed`, `checkPalette`, the contrast helpers (`contrastRatio`, `ensureContrast`, `meetsAA`, `parseColor`, `toHex`), the light/dark functions `initTheme`, `toggleTheme`, `currentTheme`, and the types (`StyleSheet`, `Palette`, `Theme`, ...). The only dependency is `culori`. There is no React, no font, no colour catalogue and no studio in it.

## What this is not

- Not the Studio. Choosing colours, fonts and a logo is the developer tool `style-studio`; the app does not load that.
- Not a font loader. A sheet names a font family; getting its bytes onto the page is the app's job.
- Not a place to build CSS by hand. Every string that reaches CSS has passed `validateStyleSheet`; `toCssText` validates first and throws on invalid input.

## How to take it

Package: `@kaigilb/gilbplatformcode-style-runtime`

Install it as a copy, not a link. First put this line in your app's own `.npmrc`:

```
install-links=true
```

Then:

```sh
npm install <path-to-the-library>/units/style-runtime
```

### Use at app start

Call it before the first render:

```ts
import { loadStyle } from "@kaigilb/gilbplatformcode-style-runtime";

loadStyle({
  cacheKey: "style:myapp",
  fetchRemote: () => fetch("/api/style").then((r) => r.json()), // or your own reader of the saved style
  fallbackUrl: "/style.tokens.json",
});
```

To read the style from the app's operating vault (public-read records, no sign-in), use the vault reader in this unit; the Studio is not needed:

```ts
import { loadStyle, makeVaultFetchRemote } from "@kaigilb/gilbplatformcode-style-runtime";

loadStyle({ cacheKey: "style:myapp", fetchRemote: makeVaultFetchRemote(sheetUrl), fallbackUrl: "/style.tokens.json" });
```

`loadStyleFromVault`, `recordsToSheet` and `makeVaultFetchRemote` are here (added in 0.2.0); the Studio re-exports them. `toFetchUrl` maps an identity URL to the URL the browser fetches.

Put a copy of `examples/style.tokens.json` in your app's public folder as `/style.tokens.json` and edit it, or let the Studio write it. Then call `initTheme()` once if the app has a light/dark switch.

## Examples

```ts
import { validateStyleSheet, toCssText, paletteFromSeed, checkPalette, toggleTheme } from "@kaigilb/gilbplatformcode-style-runtime";

const r = validateStyleSheet(json);          // { ok: true, value } or { ok: false, errors }
if (r.ok) document.head.append(Object.assign(document.createElement("style"), { textContent: toCssText(r.value) }));

const p = paletteFromSeed("#3b6fd4", { mode: "light", harmony: "analogous" });
checkPalette(p).filter((row) => !row.pass);  // [] : every pair meets its contrast minimum
toggleTheme();                               // flips <html data-theme>, stores the choice
```

`examples/style.tokens.json` is a good default sheet: a blue seed, system fonts, soft shadow, filled buttons, card windows.

## What the host must supply

- A `fetchRemote` function that returns the saved style (any JSON; it is validated), or one that rejects when there is none, so the cache or the fallback is used.
- A `style.tokens.json` at `fallbackUrl` for the first visit when the remote is down.
- A `cacheKey` that is unique to the app. The sheet is cached in `localStorage` under it; a missing or failing storage is ignored.
- The app's own CSS reads the properties (`--accent --paper --ink --surface --lines`, `--r-*`, `--shadow-*`, fonts, `--gs-button-*`, `--gs-window-*`) and derives the rest from them.

## Do not

- Do not write CSS from a sheet any way other than `toCssText`. A colour such as `url(x)`, or a value with `; { } < > \\ @import expression( /*`, is refused by validation on purpose.
- Do not put a second `<style id="gilb-style">` in the page. The runtime owns that one element.
- Do not wait for `loadStyle` before the first render. It applies the cached sheet synchronously; the awaited part is only the remote refresh.
- Do not load the Studio into the app. The app takes this unit alone.

## Wrong readings

- `errors` filled does not mean the page is unstyled. A bad remote sheet leaves the cache or the fallback in place; read `source` to see which won.
- `source: "none"` is not a crash. It means no valid sheet was found anywhere, and the app's own default CSS shows.
- A sheet's `mode: "system"` does not set `data-theme`. The sheet's media rule follows the operating system until `toggleTheme()` stores a choice.

## Where it came from

The private package `gilb-style` (KaiGilb/gilb-style), commit `234a8fcd8bdf9022a81883ca9e5026327f64d10c`: `src/schema.ts`, `color.ts`, `css.ts`, `palette.ts`, `runtime.ts` and `theme.ts`, with their tests. The React toggle `ThemeToggle` stays in `style-studio`; only the non-React theme functions are here. Colour parsing and conversion use `culori` (MIT); see `THIRD-PARTY-NOTICES.md` in `style-studio`.
