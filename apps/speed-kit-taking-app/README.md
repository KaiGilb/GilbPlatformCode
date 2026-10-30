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

## Browser proof

```sh
npm run proof:browser   # builds, serves `vite preview` on 5261, runs real Chromium and WebKit; about 4 minutes
```

It uses `playwright-core` 1.61.0 with the browsers already in `~/Library/Caches/ms-playwright/` (chromium 1228, webkit 2311; nothing is downloaded) at desktop (1280x800) and phone (`devices["iPhone 13"]`; in Chromium the phone also gets 400 ms / 1.6 Mbit down / 0.75 Mbit up) and writes a JSON file and a table to `proof-out/` in the app folder (ignored by git; `PROOF_OUT` names another folder); the server log is `~/Library/Logs/speed-kit-taking-app-proof.log`. It is not part of `npm test` (CI has no browsers).

It proves, in a REAL browser engine with its real IndexedDB, real reloads and a real mouse: the first visit, the return from an entry, the reload painted from the device before any records answer, no trace of Ann after sign-out or after a tab closed without sign-out, and that pointing at the nav sends the request.
It does NOT prove: anything against the real platform (the vault is the in-page stand-in, so the result is "REAL browser, MOCK vault"), a real phone, or the network cost of the vault (the throttling slows only the page load, since the stand-in answers inside the page).
B5 first looks at a hover right after sign-in (the idle warm of sign-in has already started the warmer, so within 30 s the hover sends nothing; recorded in the table), then waits 31 s and checks that the hover sends the request.

The speed table of the second run (REAL browser, MOCK vault; vault latency 600 ms; Ann has 500 entries, 3 walk pages):

| engine | profile | scenario | firstRowMs | source | wall ms | records req at row | records answered at row | records req total | rows | pass | failed | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | desktop | B1 cold first visit | 3020.4 | network | 3027.6 | 5 | 5 | 5 | 500 | pass |  |  |
| chromium | desktop | B2 back from an entry | 1.8 | memory | 1.9 |  |  |  | 500 | pass |  |  |
| chromium | desktop | B3 reload, from the device | 8.4 | device | 10.5 | 0 | 0 |  | 500 | pass |  |  |
| chromium | desktop | B4 sign-out and Ben |  |  |  |  |  |  | 5 | pass |  |  |
| chromium | desktop | B5 hover warms |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| chromium | desktop | B6 tab closed without sign-out |  |  |  |  |  |  |  | pass |  |  |
| chromium | phone | B1 cold first visit | 3019.4 | network | 3026.8 | 5 | 5 | 5 | 500 | pass |  |  |
| chromium | phone | B2 back from an entry | 1.6 | memory | 1.8 |  |  |  | 500 | pass |  |  |
| chromium | phone | B3 reload, from the device | 9.9 | device | 9.7 | 0 | 0 |  | 500 | pass |  |  |
| chromium | phone | B4 sign-out and Ben |  |  |  |  |  |  | 5 | pass |  |  |
| chromium | phone | B5 hover warms |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| chromium | phone | B6 tab closed without sign-out |  |  |  |  |  |  |  | pass |  |  |
| webkit | desktop | B1 cold first visit | 3014 | network | 3019 | 5 | 5 | 5 | 500 | pass |  |  |
| webkit | desktop | B2 back from an entry | 2 | memory | 2 |  |  |  | 500 | pass |  |  |
| webkit | desktop | B3 reload, from the device | 10 | device | 5 | 0 | 0 |  | 500 | pass |  |  |
| webkit | desktop | B4 sign-out and Ben |  |  |  |  |  |  | 5 | pass |  |  |
| webkit | desktop | B5 hover warms |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| webkit | desktop | B6 tab closed without sign-out |  |  |  |  |  |  |  | pass |  |  |
| webkit | phone | B1 cold first visit | 3013 | network | 3018 | 5 | 5 | 5 | 500 | pass |  |  |
| webkit | phone | B2 back from an entry | 2 | memory | 3 |  |  |  | 500 | pass |  |  |
| webkit | phone | B3 reload, from the device | 10 | device | 5 | 0 | 0 |  | 500 | pass |  |  |
| webkit | phone | B4 sign-out and Ben |  |  |  |  |  |  | 5 | pass |  |  |
| webkit | phone | B5 hover warms |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| webkit | phone | B6 tab closed without sign-out |  |  |  |  |  |  |  | pass |  |  |

## Live mode (read only)

A second mode of the same app: a real sign-in to GilbPlatform and a real `completeCopy` read of `t:CatalogEntry` in ONE named test vault. It reads and never writes (rename comes in the next batch). It is chosen at build time (`VITE_PLATFORM=live`); the stand-in mode above is unchanged. Live and stand-in use different device databases (`speedkittaking-live-cache` and `speedkittaking-cache`), so their copies never meet.

```sh
npm run dev:live -- --vault https://<host>/vault     # for a vault not under gilb.com also: --id https://<identity host> --platform https://<platform apex>
```

`scripts/dev-live.mjs` refuses without `--vault`, refuses a value that is not `https://<host>/vault`, refuses when port 5251 is taken, sets every `VITE_` variable itself, prints the URL and both origins, and logs to `~/Library/Logs/speed-kit-taking-app-live.log`. Two origins are used, as in records-app (proven live on 2026-10-29): the identity origin (`--id`, default `https://id.gilb.com`) takes every sign-in call and `GET /lws/vaults`, and the platform apex (`--platform`, default `https://gilb.com`) is only what the units treat as the platform, so no request goes to it. The defaults apply to a vault under `gilb.com`; for any other host both flags are required. Production admits a local app only at `http://localhost:5197` or `http://localhost:5251`; live mode runs at 5251.

What you do and see: open the URL; type your email; the code arrives by email; type it. A page reload ends the session (the key and token live in memory only), so sign in again with a new code. The person on screen is the principal the server returns after sign-in, not the email you typed. The page shows the vaults you reach (with `complete` and `incompletePeers`). If the pinned vault is not among them it says so and loads nothing; when `complete` is false it also offers "Try reading it anyway", which makes one read and reports the status. A 401 shows "Your sign-in has run out; sign in again." The speed panel works as in stand-in mode.

Tests `test/L1` to `test/L8` fake only the network, with answer shapes taken from the server source.

### Live writes (`--allow-write`)

`npm run dev:live -- --vault https://<host>/vault --allow-write` turns on three writes, all in the pinned vault and nowhere else. Without the flag live mode only reads, and none of the buttons exists. Every write passes one gate in `src/live/writes.ts` (the flag is on, and the URL's origin is the pinned vault's origin), and each is a background job that says "done" only after a read-back.

- Rename (the Entry page): a fresh read of that record, then `PATCH /lws/r/<id>` with `If-Match` and the write key `a:name`, then a read-back. A 412 shows "Someone changed it; look again" and is not retried.
- Add test entries (10, 50, 200 or 500): `POST /lws/vault/<vault>/c`, each with its own `Idempotency-Key` (`speedkit-proof.<runId>.<n>`), at most 4 in flight, named `speedkit-proof <runId> <n>`. The ids are kept in localStorage under `speedkittaking-live.made.<principal>.<vault>`.
- End my test entries: `DELETE /lws/r/<id>` with `If-Match`, only for ids on that list whose name, read fresh, still starts with `speedkit-proof `. Each is read back, and the ended list is checked.
