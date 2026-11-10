# pictures-example

A one-screen React 19 + Vite app, "Pictures", that gives a signed-in person the whole picture capability from this repository: add, see, view. It was written by a Sonnet coder from the units' READMEs alone, as the measurement of the Ease.Reuse Value ("coding hours for a developer to give a new GilbPlatform app the whole picture capability"). The measured hours and every README gap are under "Reuse findings".

## What it shows

1. Add: `picture-pick` (Take photo, Choose photos, paste and drop on the page through `PictureDropZone`).
2. Prepare: `picture-shrink` `makePictureSet(file, { type: "auto" })`; a failure (HEIC where the browser cannot read it, any other) is shown with `picture-errors` `PictureFailureNote`.
3. Show at once: the new tile appears with its local thumbnail (`SignedImage` `previewUrl`), marked "Saving…".
4. Store: `save-queue` (one queue per person, `setQueueDbName("pictures-example")`, `listOpsFor`, `stampOp`, `classifyWith`, `afterFailure`, `busyDelayMs`, `stopsFlush`, `resetForRetry`) and `picture-set` `uploadWithThumb(master, thumb, sink, target, full)`, so a retry never uploads a finished step twice. The full copy is sent only when `onCellular() === false`; otherwise the op stays in the queue and `linkFullLater` runs when Wi-Fi is seen (the `connection` change event, `online`, or the next start). Tile badge: "Full size waits for Wi-Fi".
5. See: `signed-picture` 0.2.0 `SignedImage` (`setPictureQueueLimit(6)`, `enablePictureDeviceCache({ name: <per-person> })`, `forgetPictures({ device: true })` on sign-out).
6. View: `picture-viewer` `usePictureViewer`; `thumbSrc` is the grid's object URL, `resolveSrc` is the largest stored copy (`buildCopyMap` + `pickBySize(copies, Infinity)` + `pictureObjectUrl`).
7. Refused: a 403 on the listing shows `refusal-detail` `AccessDeniedScreen` with the server's own line.
8. Remove: not offered. See finding 9.

## Install (per unit)

Each unit is a `file:../../units/<name>` dependency of this app (`install-links=true` in `.npmrc`). The install line a unit's README gives, in its own order:

| Unit | Install line (from its README) |
|---|---|
| picture-pick | `npm install react@^19.0.0 <lib>/units/picture-pick` |
| picture-shrink | `npm install <lib>/units/picture-shrink` |
| picture-errors | `npm install react@^19.0.0 <lib>/units/{base-origin,picture-shrink,record-types,server-error,refusal-detail,signin,vault-origin-rule,lws-session-bridge,lws-records,picture-upload,picture-errors}` |
| picture-upload | the same list without `picture-shrink`, ending `picture-upload` |
| picture-set | `npm install react@^19.0.0 <lib>/units/{base-origin,photo-ref,record-types,server-error,refusal-detail,signin,vault-origin-rule,lws-session-bridge,lws-records,picture-upload,picture-set}` |
| save-queue | `npm install <lib>/units/save-queue` |
| signed-picture | `npm install react@^19.0.0 <lib>/units/{base-origin,photo-ref,signin,vault-origin-rule,lws-session-bridge,signed-picture}` |
| picture-viewer | `npm install react@^19.0.0 react-dom@^19.0.0 <lib>/units/picture-viewer` |
| refusal-detail | `npm install react@^19.0.0 <lib>/units/{server-error,refusal-detail}` |
| signin, lws-session-bridge, vault-list | for `dev:live` only |

This app's `.npmrc` is `install-links=true` only (the `legacy-peer-deps` workaround of finding 1 is gone since #200; a clean `npm ci` works). npm does not install file: peers by itself, so every peer of the table is listed in `package.json`.

## Two modes

- `npm run dev:fake` on `http://localhost:5301`: no network at all. `fetch` is replaced by the shared `fake-platform` unit (`createFakePlatform`, seeded in `src/main.fake.tsx`), which answers the platform's routes with the platform's shapes on its own host only; any request to another host is refused and recorded in `window.__fake.violations`, and every call is in `window.__fake.calls`. The signed-in person is fake: `setLwsAuth` is given `fake.authHost(person)`, which signs real-shaped DPoP proofs. Query options: `?seed=3` puts three stored pictures in the fake vault, `?view=2` opens the viewer on the second, `?refuse=1` takes the person's access away (the list answers 403 with the platform's sentence).
- `npm run dev:live`, opened at `http://localhost:5251/?vault=<name>`: the units' base origin is the apex `https://gilb.com`. Sign-in, create-named and the vault list use `https://id.gilb.com` (`SignInCard`, `SessionCredential`). The vault is the writable one from the sign-in's vault set (`vault-list` `writableVaults`) that `?vault=` names, by the host's first label or the full vault address. With no `?vault=`, or no match, the app writes nothing: it shows "Choose the vault to use:" with one link per writable vault. A line under the title says `Vault: <name> (<vaultId>)`. It typechecks and builds (`npm run build:live`) but has never been run. Measured 2026-11-08: `https://id.gilb.com` refuses vault writes.

## Proof (what was run)

- `npm test`: 36 tests in 4 files pass (the same 36 before and after moving to the shared fake). They run against the `fake-platform` unit, whose shapes are the platform's: add shows at once then stores (three files, one upload each, the two links); cellular and unknown connection hold the full copy back and Wi-Fi sends it; a failed small copy is retried without a second upload of the picture or the full copy; an op that already holds its master is not uploaded again after a restart; busy back-off (2 s, 5 s) and the busy stop; stuck after five failures and Try again; a refused upload is a no-access note with the server's line; a refused listing is the access-denied screen; the viewer opens on the tapped picture and fetches that picture's master only; another person's queue is not shown or sent; StrictMode. The shrinker is replaced in these tests (jsdom has no canvas); the browser run below uses the real one.
- `npm run build` and `npm run build:live` exit 0; `npm run typecheck` exits 0; `npm ci` from a clean `node_modules` works.
- `node scripts/browser-proof.mjs <out-dir>` (needs `dev:fake` running): headless Chrome with its own remote-debugging port, screenshots at 1440 x 900 and in a 390 px iframe of the empty grid, the grid with 3 pictures, the viewer open, and a real 3000 x 2000 JPEG added through the real shrinker (stored as WebP; two uploads, the full copy waits because desktop Chrome does not say Wi-Fi). Console errors and uncaught exceptions: 0.

## Not yet proven live

Everything below was written but not run against a real vault or a real sign-in:

- sign-in at `https://id.gilb.com` (`SignInCard` wired through a `SignInAuth` made by hand). The units' base origin (`setBaseOrigin`) is the apex `https://gilb.com`; sign-in, create-named and the vault list stay at `https://id.gilb.com`. Measured 2026-11-08: `https://id.gilb.com` refuses vault writes (403). With the apex as the base origin, a vault is asked at its own host;
- reading the vault root from the vault set (the sign-in's `vaults`, not `reachable-vaults`: finding 8);
- the upload (`PUT /lws/vault/<root>/files`), the two link PATCHes and the file read on a live vault;
- the LIST: the app reads `GET /lws/vault/<root>/files` through `picture-set` `listVaultFiles` (every page; the platform answers `{ vault, scannedVaults, count, files: [{ entity, fileName, byteSize, transcodedFrom, updatedAt, ... }] }`, 50 to 200 a page, no cursor) and orders the grid newest first by `updatedAt`. Before this batch the app read `{ files: [{ entity, body }] }`, which was its own assumption (finding 3) and not the platform's shape; it has still not been run against a live vault;
- the key spelling of a live file record: `buildCopyMap` read `fileByteSize` and `transcodedFrom` as plain keys in the fake; the live vault may serve them with a prefix or a context (finding 4);
- the device cache (`caches` does not exist in jsdom; it ran in Chrome only as "enabled", no hit was asserted);
- Wi-Fi arrival on a phone (`navigator.connection` `change`), iOS behaviour of `capture`, paste and drop on a real page;
- HEIC: no decoder is set (`setHeicDecoder`), so a HEIC the browser cannot read is shown as unreadable.

## Reuse findings

Measured with the shell clock (`date +%s`), by Agent.Coder (Sonnet). Start 1794058898, end of the work before this README 1794059641.

| Part | Seconds (from start) |
|---|---|
| Read the 13 READMEs | 0 to 43 |
| Frame, install (peer conflict) | 43 to 65 |
| Find the `buildCopyMap` input and `LwsAuthHost` shape (two probes) | 65 to 120 |
| Engine, fake vault, first test green (add, store, grid shows) | 120 to 293 |
| App, viewer, access-denied, all 18 first tests green | 293 to 374 |
| Live entry written, typechecks and builds | 374 to 417 |
| Headless Chrome: StrictMode bug found and fixed, screenshots | 417 to 557 |
| Mutants, retry and stuck tests, Node 22, `npm ci` | 557 to 743 |

Total 743 s (12.4 minutes) of wall clock, first command to last test run. It is a model's time, not a developer's hours: a person would read, think and type far more slowly, so treat it as a floor and as a map of where the READMEs stopped being enough (findings 1 to 7). The per-part rows are read off the clock at the moment each part worked; they are not stopwatch times.

README gaps (unit, what was missing):

1. FIXED by #200 (picture-errors and picture-set accept the 0.2.0 peers; the app no longer needs `legacy-peer-deps`). Was: `picture-errors`, `picture-upload`, `picture-set`: the install lines are right, but `picture-errors` asks `picture-shrink ^0.1.0` and `picture-upload ^0.1.0` while main has 0.2.0 of both; `npm install` stops with ERESOLVE. Cost 22 s of clock. Worked around with `legacy-peer-deps=true`. The peer ranges are a defect.
2. DOCUMENTED in the picture-set README since #200. Was: `picture-set` `buildCopyMap(files)`: "given the file records" gives no shape and no key names. Types showed `{ entityUri, body: Raw }[]` and `Raw` is opaque. By trial: plain `fileByteSize` and `transcodedFrom` (a string or `{ "@id" }`) work; `t:transcodedFrom` does not. The README should show one record.
3. No unit lists a vault's picture files. `picture-set` says it does not fetch them; `vault-records-of-type` lists records of a type, with no word on files. The app invented a route. This blocks the "see the grid after a restart" capability on a live vault.
4. DOCUMENTED in the picture-set README since #200. Was: `picture-set` `uploadWithThumb`: the README does not say what the PATCH body is. The fake had to guess the key (`a:transcodedFrom` is what is sent) and strip the prefix to be read by `buildCopyMap`.
5. `lws-session-bridge` `setLwsAuth(host)`: the README names the six functions but not that the host object has exactly `bearerHeaderFor`, `dpopReadAuth`, `dpopWriteAuth`, `invalidateDpop`, `tokenManager.{invalidate,getSession}`; the type error told me. There is no documented test seam for a fake session.
6. FIXED by #200 (save-queue 0.2.0 carries `fullBlob`, `fullEntity`, `masterLinked`, `thumbRelinked`; the app's own wrapper and type are removed, and the retry test, with a mutant that drops the full steps, shows the full copy is not uploaded twice). Was: `save-queue` `progressOf`: its `progress` and `onProgress` carry three steps; `uploadWithThumb` with a full copy needs six (`fullEntity`, `masterLinked`, `thumbRelinked`). The README does not say. The first retry test re-uploaded the full copy until the app added the three fields to `progress`. `PendingOp` has no full copy field either (the app added `fullBlob` on its own type). Also: the picture-set README says the small copy and links are best effort, so a failed small copy leaves `uploadWithThumb` returning normally; the app has to check `thumbLinked` itself or the op is dropped without its small copy.
7. `signin`: the README shows the card as `<SignInCard app auth onSignedIn />` but not what `auth` must hold (`requestCode`, `verifyCode`, `prepareName`, `checkName`, `completeNamedVault`) nor how it joins `SessionCredential`. I read `src/types.ts` and a part of `src/http.ts` and `session.ts` (beyond the rule of README, `package.json`, `unit.json` and `src/index.ts` exports). 
8. `vault-list` README documents only `vaultRootFromList`; `writableVaults` is named in its first line and not shown. `reachable-vaults` (the README's way to get the list) needs about 50 units and `@tanstack/react-query`; not installed; the sign-in's own vault set was used instead. I read the names of the vault-list functions in `src/vaultList.ts` (beyond the rule).
9. No README offers a delete of a picture. `lws-records` has `deleteRecord`, and a picture is three files (master, small, full); no unit says how to remove the group. Left out, as the brief allows.
10. `picture-viewer` README is enough; its `usePictureViewer` was used as written. `signed-picture`, `picture-pick`, `picture-shrink` READMEs were enough. In `signed-picture`, `SignedImage` takes `fileUri: string | null` (not `undefined`): found by the type error.
11. `jsdom` has no `canvas`; no README tells an app how to test with `makePictureSet` (the unit's own `test/testCanvas.ts` is not shipped). The app's tests replace `makePictureSet`.
12. `navigator.connection` `change` as the "Wi-Fi seen" signal is the app's choice; the `picture-set` README says "when the app sees Wi-Fi" only.

Source reads beyond the README rule: the type errors of `tsc` for `buildCopyMap`, `progressOf`, `LwsAuthHost`, `LwsSession`; `units/signin/src/types.ts`, parts of `http.ts` and `session.ts` (finding 7); the function names in `units/vault-list/src/vaultList.ts` and the `src/index.ts` of `picture-set`, `save-queue`, `signin`, `vault-list`, `reachable-vaults`, `lws-session-bridge`. The first listing of `units/` and `apps/speed-lab`'s `package.json`, `.npmrc`, `vite.config.ts` and `tsconfig.json` were read for the frame only.
