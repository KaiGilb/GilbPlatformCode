A small app that takes speed-kit from this repository and shows a vault's catalogue entries the GilbPlatform-fast way: from memory at once, from the device after a reload, refreshed behind the screen, with nothing of one person left for the next.

# speed-kit-taking-app

Vite + React 19 + TypeScript. It takes the eight speed units and `speed-kit` exactly as `units/speed-kit/README.md` says (`.npmrc` with `install-links=true`, then the README's install line with `<path-to-the-library>` = `../..`). `RUNLOG.md` lists every place that README was wrong or silent.

## Run

```sh
npm ci
npm run dev        # http://localhost:5261 (port 5261 is this app's; strictPort)
npm run typecheck && npm test && npm run build
```

`?latency=<ms>` on the URL sets the stand-in's delay per request (default 600).

## What it shows

- Sign in as Ann (30 entries) or Ben (5), the screens `Entries` and `Entry` (a Rename job), the header, and a speed panel.
- The speed panel and `window.__speedProof` (for a browser run): `requests` (what the stand-in received, by route: `records`, `patch`, `other`), `log`, and `lastPaint = { page, ms, source }`: the milliseconds from the Entries page's mount (first render) to the first effect that saw rows, and where the first rows came from (`memory`, `device` or `network`).

## Stand-in (this batch only)

`src/fakePlatform.ts` is NOT the platform. It answers in memory, after a delay, `GET /lws/vault/<vault>/records` (the shape `completeCopy` reads; any other query parameter answers 400) and `PATCH /lws/vault/<vault>/records/<id>` (the route form is this stand-in's own; the real platform's write differs). `src/session.ts`'s client and `src/entries.ts`'s loader are the seams to the real platform.

## Tests

`test/T1` to `test/T8` (13 tests): the real units, with only the platform (the stand-in), IndexedDB (`fake-indexeddb`) and storage faked. `test/helpers.tsx` `boot()` loads the app on a fresh module registry, and `reload()` is a page reload (the device stays, the module state goes).
