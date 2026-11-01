# Speed Lab

Speed Lab measures the speed of GilbPlatform and its apps with the same tool, so a run that gets slower is seen at once. It is also the worked example of an app built from the `units/speed-kit/README.md` alone. It was named `speed-kit-taking-app` until 2026-11-01. It takes speed-kit from this repository and shows a vault's catalogue entries the GilbPlatform-fast way: from memory at once, from the device after a reload, refreshed behind the screen, with nothing of one person left for the next. It grows a test for every kind of speed.

## Tests

| Id | Was | What it measures | How it runs |
|---|---|---|---|
| SL-001 to SL-007 | B1 to B7 | SL-001 (B1) cold first visit: first row and full list from the network. SL-002 (B2) back from an entry: rows from memory. SL-003 (B3) reload: rows painted from the device before any records answer. SL-004 (B4) sign-out and Ben: nothing of Ann seen. SL-005 (B5) hover warms: pointing at the nav sends the request. SL-006 (B6) tab closed without sign-out: nothing of Ann left. SL-007 (B7) slow disk: a late device copy still paints, labelled `device`. | stand-in: real Chromium + WebKit, fake vault (`npm run proof:browser`) |
| SL-008 | live cold first row | first row and full list on a cold first visit to one named test vault on production, read only (see "Measured live") | live, read only, Kai signs in |
| SL-009 | live writes | Add / Rename / End test entries, each said "done" only after a read-back | live, only with `--allow-write` and Kai's word |

The code and its output still print B1 to B7; this table is the mapping.

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

## Unit tests

`test/T1` to `test/T8` (13 tests): the real units, with only the platform (the stand-in), IndexedDB (`fake-indexeddb`) and storage faked. `test/helpers.tsx` `boot()` loads the app on a fresh module registry, and `reload()` is a page reload (the device stays, the module state goes).

## Browser proof

```sh
npm run proof:browser   # builds, serves `vite preview` on 5261, runs real Chromium and WebKit; about 4 minutes
```

It uses `playwright-core` 1.61.0 with the browsers already in `~/Library/Caches/ms-playwright/` (chromium 1228, webkit 2311; nothing is downloaded) at desktop (1280x800) and phone (`devices["iPhone 13"]`; in Chromium the phone also gets 400 ms / 1.6 Mbit down / 0.75 Mbit up) and writes a JSON file and a table to `proof-out/` in the app folder (ignored by git; `PROOF_OUT` names another folder); the server log is `~/Library/Logs/speed-lab-proof.log`. It is not part of `npm test` (CI has no browsers).

It proves, in a REAL browser engine with its real IndexedDB, real reloads and a real mouse: the first visit, the return from an entry, the reload painted from the device before any records answer, no trace of Ann after sign-out or after a tab closed without sign-out, and that pointing at the nav sends the request.
It does NOT prove: anything against the real platform (the vault is the in-page stand-in, so the result is "REAL browser, MOCK vault"), a real phone, or the network cost of the vault (the throttling slows only the page load, since the stand-in answers inside the page).
B7 holds the IndexedDB read to show a late device copy still paints. B5 first looks at a hover right after sign-in (the idle warm of sign-in has already started the warmer, so within 30 s the hover sends nothing; recorded in the table), then waits 31 s and checks that the hover sends the request.

The speed table of the latest run (REAL browser, MOCK vault; vault latency 600 ms; Ann has 500 entries, 3 walk pages). `firstRowMs` is the first row; `fullMs` is when the whole list is in (`partial` ended). B1 now shows the first page early (`source` preview, about 2 requests, 1.2 s) while the whole list takes the 5 requests (3.0 s). B7 holds the device read after a reload (0 ms and 600 ms from the sign-in click): the copy that arrives late still paints, and the label says `device`.

| engine | profile | scenario | firstRowMs | fullMs | source | wall ms | records req at row | records answered at row | records req total | rows | pass | failed | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | desktop | B1 cold first visit | 1212.8 | 3040.4 | preview | 1220.1 | 3 | 2 | 5 | 500 | pass |  |  |
| chromium | desktop | B2 back from an entry | 2.4 |  | memory | 2.6 |  |  |  | 500 | pass |  |  |
| chromium | desktop | B3 reload, from the device | 9.7 |  | device | 10.4 | 0 | 0 |  | 500 | pass |  |  |
| chromium | desktop | B4 sign-out and Ben |  |  |  |  |  |  |  | 5 | pass |  |  |
| chromium | desktop | B5 hover warms |  |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| chromium | desktop | B6 tab closed without sign-out |  |  |  |  |  |  |  |  | pass |  |  |
| chromium | desktop | B7 slow disk, held 0 ms | 10.8 |  | device |  |  | 0 |  | 500 | pass |  |  |
| chromium | desktop | B7 slow disk, held 600 ms | 201.3 |  | device |  |  | 0 |  | 500 | pass |  |  |
| chromium | phone | B1 cold first visit | 1214.6 | 3045.5 | preview | 1222.1 | 3 | 2 | 5 | 500 | pass |  |  |
| chromium | phone | B2 back from an entry | 2.4 |  | memory | 2.5 |  |  |  | 500 | pass |  |  |
| chromium | phone | B3 reload, from the device | 14.1 |  | device | 11.8 | 0 | 0 |  | 500 | pass |  |  |
| chromium | phone | B4 sign-out and Ben |  |  |  |  |  |  |  | 5 | pass |  |  |
| chromium | phone | B5 hover warms |  |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| chromium | phone | B6 tab closed without sign-out |  |  |  |  |  |  |  |  | pass |  |  |
| chromium | phone | B7 slow disk, held 0 ms | 8.2 |  | device |  |  | 0 |  | 500 | pass |  |  |
| chromium | phone | B7 slow disk, held 600 ms | 201.4 |  | device |  |  | 0 |  | 500 | pass |  |  |
| webkit | desktop | B1 cold first visit | 1208 | 3017 | preview | 1213 | 3 | 2 | 5 | 500 | pass |  |  |
| webkit | desktop | B2 back from an entry | 2 |  | memory | 2 |  |  |  | 500 | pass |  |  |
| webkit | desktop | B3 reload, from the device | 11 |  | device | 5 | 0 | 0 |  | 500 | pass |  |  |
| webkit | desktop | B4 sign-out and Ben |  |  |  |  |  |  |  | 5 | pass |  |  |
| webkit | desktop | B5 hover warms |  |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| webkit | desktop | B6 tab closed without sign-out |  |  |  |  |  |  |  |  | pass |  |  |
| webkit | desktop | B7 slow disk, held 0 ms | 3 |  | device |  |  | 0 |  | 500 | pass |  |  |
| webkit | desktop | B7 slow disk, held 600 ms | 201 |  | device |  |  | 0 |  | 500 | pass |  |  |
| webkit | phone | B1 cold first visit | 1211 | 3037 | preview | 1215 | 3 | 2 | 5 | 500 | pass |  |  |
| webkit | phone | B2 back from an entry | 4 |  | memory | 4 |  |  |  | 500 | pass |  |  |
| webkit | phone | B3 reload, from the device | 11 |  | device | 5 | 0 | 0 |  | 500 | pass |  |  |
| webkit | phone | B4 sign-out and Ben |  |  |  |  |  |  |  | 5 | pass |  |  |
| webkit | phone | B5 hover warms |  |  |  |  | 5 |  | 6 |  | pass |  | hover right after sign-in sent 0 records requests |
| webkit | phone | B6 tab closed without sign-out |  |  |  |  |  |  |  |  | pass |  |  |
| webkit | phone | B7 slow disk, held 0 ms | 13 |  | device |  |  | 0 |  | 500 | pass |  |  |
| webkit | phone | B7 slow disk, held 600 ms | 201 |  | device |  |  | 0 |  | 500 | pass |  |  |

## Live mode

A second mode of the same app: a real sign-in to GilbPlatform and a real `completeCopy` read of `t:CatalogEntry` in ONE named test vault, and (with `--allow-write`) three writes in that vault. It is chosen at build time (`VITE_PLATFORM=live`); the stand-in mode above is unchanged. Live and stand-in use different device databases (`speedkittaking-live-cache` and `speedkittaking-cache`), so their copies never meet.

```sh
npm run dev:live -- --vault https://<host>/vault [--allow-write]
# a vault not under gilb.com also needs: --id https://<identity host> --platform https://<platform apex>
```

`scripts/dev-live.mjs` refuses without `--vault`, refuses a value that is not `https://<host>/vault`, refuses when port 5251 is taken, sets every `VITE_` variable itself, prints the URL and both origins, and logs to `~/Library/Logs/speed-lab-live.log`. It never starts without you: you sign in yourself.

- **Two origins**, as in records-app (proven live on 2026-10-29). The identity origin (`--id`, default `https://id.gilb.com`) takes every sign-in call and `GET /lws/vaults`. The platform apex (`--platform`, default `https://gilb.com`) is only what the units treat as the platform (`setBaseOrigin`, the system hosts), and no request goes to it: a key-bound call at the apex fails the DPoP check. The vault's own data calls go to the vault's own host. The defaults apply to a vault under `gilb.com`; for any other host both flags are required.
- **Port 5251.** Production admits a local app only at `http://localhost:5197` or `http://localhost:5251`. Live mode uses 5251 (`strictPort`), the origin records-app's proven live run used.
- **A reload signs you out** on this local check. The DPoP key and the token live in memory only; sign in again with a new code (it arrives by email).
- **The person** on screen is the principal the server returns after sign-in, never the typed email. The page shows the vaults you reach (`complete`, `incompletePeers`) and which field matched the pinned vault (`vaultId`, or the origin of `@id`). If the pinned vault is not reached it says so and loads nothing; with `complete: false` it also offers "Try reading it anyway" (one read, status shown, read only). A 401 shows "Your sign-in has run out; sign in again."

### `--allow-write`: the three writes

Without the flag live mode only reads and none of the buttons exists. With it, every write passes one gate in `src/live/writes.ts` (the flag is on, and the URL's origin is the pinned vault's origin), and each is a background job that says "done" only after a read-back.

- **Rename** (the Entry page): a fresh read of that record, then `PATCH /lws/r/<id>` with `If-Match` and the write key `a:name`, then a read-back. A 412 shows "Someone changed it; look again" and is not retried. An ended record is refused.
- **Add test entries** (10, 50, 200 or 500): `POST /lws/vault/<vault>/c`, each with its own `Idempotency-Key` (`speedkit-proof.<runId>.<n>`), at most 4 in flight, named `speedkit-proof <runId> <n>`. The ids are kept in localStorage under `speedkittaking-live.made.<principal>.<vault>`, and "N made by this app" follows that list.
- **End my test entries**: `DELETE /lws/r/<id>` with `If-Match`, only for ids on that list whose name, read fresh, still starts with `speedkit-proof `. Each is read back.
- **An ended record reads 200, not 404.** The server serves it with `a:entityLifecycleState: "ended"` and no name or body (measured live on 2026-10-29: 207 of 207). The app treats ended and a 404 both as ended.

### Measured live

**2026-10-31, first page early (app 0.5.0, GilbPlatformCode f0eb55f)**

REAL browser (Chrome), production GilbPlatform, vault `testappvaultaccess`. Every visit cold: signed out (device copy wiped, 0 keys confirmed), page reloaded, Kai signed in himself.

| Visit | Entries | First row | From | Full list |
|---|---|---|---|---|
| 1 | 3 | 719 ms | preview | 1225 ms |
| 2 | 503 | 429 ms | preview | 1515 ms |
| 3 | 503 | 457 ms | preview | 1663 ms |

Before the first page early, the same cold first row at 503 entries was 1622 and 1744 ms (the table below).

Writes in the same run: Add 500 in about 25 s, read back 500. End 500 done; a fresh network read shows only the 3 originals.

Finding F5 (fixed in 0.5.1): End reported "Not ended: Something went wrong" after all 500 had ended, because only the list reload at the end failed. Since 0.5.1 a failed reload after a successful write keeps the success message and adds "The list could not be reloaded; press Refresh."

**2026-10-30/31, S2-D2b run**

REAL browser (Chrome), production GilbPlatform, vault `testappvaultaccess`, 503 entries, 2026-10-30/31, Kai signing in himself (S2-D2b run). Not a lab: one run.

| Step | Result |
|---|---|
| Add 500 (read back 500) | 26.5 s |
| Rename (If-Match, read back) | 2.5 s |
| End 500 (each read back ended); the 3 original entries untouched | done |
| Cold first visit (first row, from the network) | 1622 and 1744 ms |
| First row from memory | 14.2 ms |
| First row from the device (after a reload) | 58.8 ms |
| Sign-out | the live database held 0 keys |

With the 3 original entries (S2-D1b, same vault): network 1015 ms, memory 1.0 ms, device 4.2 ms.

Not proven: a real phone (all runs are on a desktop browser). Finding F4 (one device miss, 2026-10-30) has not recurred in the 2026-10-31 runs; once, a reload a few seconds after a rename and a fresh sign-in painted the first row from the network (1622 ms) although the device held the copy. The cause is still open, and the page shows what `start` answered (`start: disk yes|no, hydrated yes|no, N entries, M ms`, also `window.__speedProof.start`) so the next occurrence can be told apart.

### First real app: GilbApp (2026-10-31)

GilbApp took device-store, speed-kit and their peers (vendored tarballs from GilbPlatformCode a48825bc) to keep a device copy of the vault list and the home vault's first Records screen. Live at https://gilb.com/app/ revision 7386443 (GilbApp PR #401).

Reload, measured read-only in Chrome, 4 runs each:

- Vault list: 3.20–3.88 s before, 1.95–2.27 s after.
- First Records row: 2.41–4.87 s before, 1.90–2.29 s after.

What bounds it now: the session answer (`/base/auth/session/token`, 1.76 s that day). The device copy paints only after the session names the person, so the last person's list is never shown to the next.

Tests `test/L1` to `test/L10`, `test/W-live-writes` fake only the network, with answer shapes taken from the server source.
