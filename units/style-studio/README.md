# style-studio

App Style Studio: choose the app's colours, fonts, buttons, windows and logo before building, and save them to the app's resource vault.

## What this is

`<StyleStudio />` is a React screen for choosing the app's colours, fonts, buttons, windows and logo before building, and `saveStyle` writes the result to the app's resource vault.

A developer tool. Not loaded by the app at runtime; the app takes style-runtime. You take it once, in a Studio page of your own, to make the app's style sheet. It gives you:

- `<StyleStudio />`, a React screen with tabs Palettes, One colour, From website, Fonts, Buttons, Windows, Logo and Save & export, and a live preview.
- Palettes: "Popping" and "Classic", and 348 palettes after Sanzo Wada (loaded as a separate chunk fetched when the Studio opens). Pick one, or give one seed colour, or read the colours from your website. Contrast is always enforced.
- 48 open-licence fonts (latin, weights 400 and 600), fetched only when chosen or scrolled into view. Eight one-click pairings.
- Buttons and windows styles, and a logo (PNG, JPEG, WebP, or SVG that is cleaned and turned into PNG).
- `saveStyle`, which writes the sheet into the app's resource vault as three typed records (palette, brand kit, style sheet) and makes them public-read, so the app can load its style at start without signing in.
- `ThemeToggle` (a light/dark button), `ActionRow` (a Mac-order button row), the palette catalogues, and the vault reader `loadStyleFromVault` and `makeVaultFetchRemote`.

## What this is not

- Not what the app loads. The app takes `style-runtime` (`loadStyle`), which has no React, no fonts and no catalogue. Importing the Studio into an app puts the 48 font loaders, the catalogues, DOMPurify and a React screen into its bundle.
- Not the place to keep the app's style. The saved record in the vault, or the `style.tokens.json` file the app ships, is.
- Not a font host. It loads fonts from the `@fontsource` packages.

## How to take it

Package: `@kaigilb/gilbplatformcode-style-studio`. It takes `@kaigilb/gilbplatformcode-style-runtime` with it (a `file:../style-runtime` dependency), so install both as copies. Put this line in your app's own `.npmrc` first:

```
install-links=true
```

Then:

```sh
npm install <path-to-the-library>/units/style-runtime <path-to-the-library>/units/style-studio
```

Your app brings its own React (peer `^19.0.0`). Install it as a dev dependency; it is not for the production bundle.

## Examples

```tsx
import { StyleStudio } from "@kaigilb/gilbplatformcode-style-studio";

<StyleStudio
  appName="My app"
  vault={{ vaultBase, vaultId, publicGrantee, auth }}   // omit to get onSave(sheet) instead
  savedIds={ids}
  onSaved={(saved) => setIds(saved)}
/>
```

```ts
import { saveStyle } from "@kaigilb/gilbplatformcode-style-studio";

const ids = await saveStyle({ auth }, { vaultBase, vaultId, publicGrantee, sheet, logoPng, existing }); // existing = ids from the last save
```

Then, in the app itself, take `style-runtime` and call `loadStyle` at start. Without a vault, `onSave(sheet)` gives you the sheet as JSON to keep as the app's `style.tokens.json`.

## What the host must supply

- **`publicGrantee`** (a string, required). The address of the vault's "public" grantee: the principal that every public-read grant goes to. It is a required field of `saveStyle`'s options and of the `vault` prop. On GilbPlatform it is `https://veda.gilb.com/base/t/PublicGrantee`. The unit holds no such address itself.
- **`vaultBase`, `vaultId`.** Where the app's resource vault is.
- **`auth(method, url)`**, returning the headers (DPoP) for that exact request. Auth is injected; the unit never reads a key.
- Optional: `fetch`, `toFetchUrl`, `toEntityUri` for a host whose addresses differ from the vault's; `extractFromUrl` (from `makeExtractFromUrl`) for the From website tab, which needs a server of yours that reads a page's colours.
- React `^19.0.0`.
- Wire contract (measured on GilbPlatform): create `POST {vaultBase}/lws/vault/{vaultId}/c`; replace `PUT {entityUri}` with `if-match`; public read `POST {origin}/base/authz/grant-direct`; logo `PUT .../files?name=logo.png`. A stale `etag` (412 or 428) is a `StaleEtagError`. Any failed step throws `StyleSaveError{step, status, message}` with the ids written so far in `.ids`; grants run only after every write succeeded.

## Do not

- Do not import this unit in the app's runtime code. It is a developer tool; the app takes `style-runtime`.
- Do not hard-code `publicGrantee` into a copy of the source. Pass it.
- Do not build CSS from a sheet that did not pass `validateStyleSheet`.
- Do not store an SVG logo as is. The Studio turns it into a PNG; SVG is never stored.
- Do not edit `src/catalogue/wada.generated.ts` or `src/studio/fonts.generated.ts` by hand. Run `npm run build:wada` or `npm run build:fonts`.

## Wrong readings

- "Public read" does not make the vault public. Only the three style records and the logo files are granted.
- `ok`, `warn`, `bad` and `onAccent` are not stored in the vault. They are rebuilt on load from the stored colours, so they always meet the contrast rules. The dark override and the sheet name are not stored either.
- Wada is not a list of ready-made themes with a fixed paper and ink. A palette's own paper and ink are used, then contrast is enforced, so a colour can change slightly.
- Saving without a `vault` prop is not a failure. It calls `onSave(sheet)`.

## Where it came from

The private package `gilb-style` (KaiGilb/gilb-style), commit `234a8fcd8bdf9022a81883ca9e5026327f64d10c`: `src/studio/`, `src/catalogue/`, `src/save/`, `src/ActionRow.tsx`, `src/ThemeToggle.tsx`, `scripts/build-wada.mjs`, `scripts/build-fonts.mjs`, `vendor/wada/colors.json`, with their tests. The colour and sheet engine it used from the same package is now the separate unit `style-runtime`; its imports became `@kaigilb/gilbplatformcode-style-runtime`. The source's `PUBLIC_GRANTEE` constant is gone: the address is the `publicGrantee` option. The Wada data is after Sanzo Wada, *A Dictionary of Color Combinations* (1933-34), from mattdesl/dictionary-of-colour-combinations (MIT). Licences: `LICENSE.md` (the Wada data) and `THIRD-PARTY-NOTICES.md` (fonts OFL-1.1, culori MIT, DOMPurify used under Apache-2.0, Tailwind MIT, Open Color MIT).
