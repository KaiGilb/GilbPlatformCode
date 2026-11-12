# style-app-files

The Node side of the app's style: the dev save endpoint for the Style Studio, and the chosen fonts copied out of `@fontsource` for the app to serve.

## What this is

Writes the app's style files on the developer's machine: the dev save endpoint for `style.tokens.json` and the logo, and the chosen fonts and `fonts.css` copied out of `@fontsource`.

- `createStudioSaveMiddleware({ appRoot })` is a Connect-style handler (Vite's `server.middlewares.use` takes it). The Studio's `makeDevServerSave()` posts `{ sheet, logoPng? }` to it; it writes `public/style.tokens.json` and `public/brand-logo.png`, then exports the fonts.
- `exportFonts(sheet, { appRoot })` copies the latin woff2 files (weights 400 and 600) of the sheet's bundled fonts into `public/fonts/<slug>/` and writes `public/fonts.css`, whose `@font-face` rules name only those woff2 files.
- `style-app-fonts [appRoot]` is the same export as a command, for the app's `prebuild` script.
- Node only. No browser, no React, no network. It imports Node built-ins and, as a type only, `style-runtime`.

## API

All of it is exported from the package root (`src/index.mjs`, with `src/index.d.mts` for types).

| Export | What it does |
|---|---|
| `fontsourceSlug(family)` | The `@fontsource` package name: lower case, spaces to hyphens, anything but letters, digits and hyphens dropped. `"Source Sans 3"` is `source-sans-3`. |
| `rewriteFontCss(css, slug, urlBase = "/fonts")` | Keeps only the woff2 source of one `@fontsource` stylesheet and points it at `<urlBase>/<slug>/`. Returns `{ css, files }`. The woff and other formats are dropped. |
| `exportFonts(sheet, { appRoot, publicDir = "public", urlBase = "/fonts", cssFile = "fonts.css", weights = [400, 600] })` | Returns `{ families, warnings }`. For each of `sheet.fonts.sans`, `serif` and `mono` whose `source` is `"bundled"`: copies the woff2 files and writes the css. A font with `source: "system"` writes nothing. |
| `writeStyleFiles({ sheet, logoPng? }, { appRoot })` | Returns `{ status, message, fontsWarning? }`. 400 (nothing written) when `sheet` is not an object or `logoPng` is not a `data:image/png;base64,` URL whose bytes start with the PNG signature. Otherwise writes the tokens (pretty JSON), the logo if sent, then the fonts. A font problem is `fontsWarning` and the status stays 200. Every file is written to a temp name and renamed. |
| `createStudioSaveMiddleware({ appRoot, maxBytes = 8 MB })` | `(req, res)`. 405 with `Allow: POST` for other methods; 413 when the body is bigger than `maxBytes` (reading stops); 400 for JSON that does not parse; otherwise the answer of `writeStyleFiles` as JSON. The message never holds a path of the machine. |
| `MARKER` | `".style-app-files"`, the file this tool leaves in each font folder it makes. |

`writeStyleFiles` checks that `sheet` is an object and no more. It does not import `style-runtime`'s validator (that would make `style-runtime` a runtime peer); the app's runtime validates the sheet when it loads it.

### Rules

- **Stale folders.** A folder under `public/fonts` that this tool made (it holds a `.style-app-files` marker listing the files written) and that the export no longer needs has the listed files removed, then the marker, then the folder if it is empty. A folder without a marker is never touched, and neither is a file in a marked folder that the marker does not list.
- **Safe names.** The family name must not hold `/`, `\`, `..` or a NUL, and its slug must match `/^[a-z0-9-]+$/`. Anything else is a warning ("is not a usable font package name") and is skipped; no path is built from it.
- **Missing package.** `@fontsource/<slug>` not installed is a warning; the other families are still exported.
- **No fonts.** A sheet with no bundled font still writes an empty `fonts.css`, so a `<link>` to it never 404s.

## The app must have the fonts installed

Packages are found with `createRequire(<appRoot>/package.json)`, so `@fontsource/<slug>` must be installed where the app can resolve it. Taking `style-studio` brings every font it offers; or install the ones you use.

## After taking it (the app)

```ts
// vite.config.ts: dev only, so no build holds it
import { createStudioSaveMiddleware } from "@kaigilb/gilbplatformcode-style-app-files";
const studioSave = (): Plugin => ({
  name: "studio-save",
  apply: "serve",
  configureServer: (s) => {
    s.middlewares.use("/__studio/save", createStudioSaveMiddleware({ appRoot: s.config.root }));
  },
});
```

```jsonc
// package.json
"scripts": { "prebuild": "style-app-fonts" }
```

```html
<!-- index.html -->
<link rel="stylesheet" href="/fonts.css" />
```

In the Studio page, `onSave={makeDevServerSave()}` (from `style-studio`) posts to `/__studio/save`.

## What this is not

- Not a font loader in the browser: it only prepares files; the page loads them with the `<link>`.
- Not the sheet's validator: that is `validateStyleSheet` in `style-runtime`.
- Not for production: the save endpoint writes the developer's files, so mount it with `apply: "serve"` and never in a deployed server.

## How to take it

Package: `@kaigilb/gilbplatformcode-style-app-files`. Put `install-links=true` in your app's `.npmrc`. It ships plain ES modules (`.mjs`), so Node and a Vite config can import it as it is. The bin is `style-app-fonts`. Peer: `@kaigilb/gilbplatformcode-style-runtime` `^0.2.0`, used for types only.

## Where it came from

New code, written for EESpeed Round 7 (U4) from the hand-written files of the PictureRecords run-7 app (not in a repository): `vite.config.ts` (`studioSave`) and `scripts/exportFonts.mjs`, with its test. Repository `KaiGilb/GilbPlatformCode`, commit `4340ee4838d77dabd5ed3f3eea9e3a2048f97fde`. No source file was copied. Added over the original: the PNG signature check, the body limit answered 413, the method answered 405 with `Allow`, atomic writes, the safe-name rule, and the marker that makes stale-folder removal safe.
