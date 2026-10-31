# RUNLOG: Batch S2-A (Agent.Coder, Sonnet)

- Start: 2026-10-30T13:16:52Z. End: 2026-10-30T13:27Z (the date -u before the commit is in the handback).
- Tool calls used: about 33.
- Branch `kaizen/s2-speed-kit-taking-app`, worktree `gpc-s2-speedkit-app`, base `d65985d`.

## README steps followed, in order

1. `units/speed-kit/README.md`, "How to take it": `.npmrc` with `install-links=true`. Worked as written.
2. The install line, run from `apps/speed-kit-taking-app` with `<path-to-the-library>` = `../..`:
   `npm install react@^19.0.0 ../../units/device-store ../../units/principal-hub ../../units/background-jobs ../../units/prefetch-registry ../../units/record-sync ../../units/session-cache ../../units/updated-line ../../units/use-cached ../../units/speed-kit`.
   Worked first time ("added 10 packages", 0.9 s), but only because I had written a `package.json` first (G1). The dependency entries it wrote were not hand-edited.
3. "Wiring example": copied and adapted into `src/speed.ts`, `src/hooks.ts` (usePrefetch, useJobs), `src/session.ts`. Worked, with the notes below.
4. "Wiring example" for `useCached`/`UpdatedLine`/`jobs.enqueue`: used as shown. Worked.
5. `@kaigilb/gilbplatformcode-speed-kit/complete-copy` import: worked as written.
6. `package-lock.json` committed; `rm -rf node_modules dist && npm ci` works from it. `fake-indexeddb` is pinned exactly to 6.2.6 (npm wrote `^6.2.6` until edited).

## README gaps (G)

- **G1.** Q: what does a new app need before the install line works, besides `react`? Should be answered in speed-kit README "How to take it". Answered by: nothing in 1-3 (I used `apps/plan-cards-taking-app/package.json`). Without a `package.json` in the folder, `npm install` walks up to the repo root's. Sentence: "Run `npm init -y` in your app's folder first. The install line adds `react` only: your app also needs `react-dom@^19.0.0` (the example calls `createRoot`), and its build and test tooling."
- **G2.** Q: what is the type of `start`'s `persist` option, and how does a test make the disk save at once? Should be answered in speed-kit README, `start(person, { ..., persist? })`. Answered by: `units/speed-kit/src/speedKit.ts:26` (`persist?: PersistOptions`), and `test/testKit.ts:382` + device-store README (`flush()`, `schedule`). Sentence: "`persist` is device-store's `PersistOptions`. A test reads the running copy with `currentPersist()` and calls `await currentPersist().flush()` to write the queue now (or passes `{ schedule: () => undefined }` so nothing is written until it does)."
- **G3.** Q: what exactly does `completeCopy` send, and what shape of answer must a platform (or stand-in) give? Should be answered in record-sync README, `completeCopy`. Answered by: `units/record-sync/src/completeCopy.ts:145` (`?type=<bare, t: stripped>&since=head`, answer `nextCursor` string), `:165-177` (`?type=&include=body&limit=<n>[&after=<c>]`, answer `{ records: [{ entity, typeUri, label, updatedAt, body, etag }], complete, nextCursor, nextOffset }`), `:245` (`?type=&since=<c|start>&include=body&limit=200`), `:248` (400 `{ error: "since_cursor_invalid" }`), `:46-60` (a row without a string `entity` is dropped), `:195-221` (what ends a walk). Sentence: "A platform must answer: (list the three requests and the answer fields above)." Note the query parameter ORDER and `offset` (sent only when `after` is refused) and `filter=` (only with a filter) are also sent.
- **G4.** Q: when `recheck` returns a string, what does the person read? Should be answered in background-jobs README, `enqueue`. Answered by: `units/background-jobs/src/backgroundJobs.ts:157-158` (refusal becomes `{ ok:false, message: refused }`) and `:167` (notice text is `failText(kind, message)`). `cancelledText` is used only when `signal.cancelled` is set (by `cancelJobs`), and that job is `quiet`: it leaves NO notice. Sentence: "A string from `recheck` becomes the job's failure: the notice reads `failText(kind, thatString)`. `cancelledText` is shown to nobody: a cancelled job leaves no notice."
- **G5.** Q: what does `sessionCache.refresh(key, loader)` return? Should be answered in session-cache README. Answered by: `units/session-cache/src/sessionCache.ts:135` (`Promise<T>`, the loaded value; it rejects when the load fails). Sentence: "`refresh` returns a promise of the loaded value, and rejects when the load fails (unlike `useCached`'s `refresh`)."
- **G6.** Q: how do I simulate a page reload in a test of an app that takes these units (hub, cache, job store, kit all hold module state)? Should be answered in speed-kit README (a "Testing your app" note). Answered by: nothing; found by trying. `vi.resetModules()` then a dynamic `import()` of the app gives fresh module state, because vitest inlines these TypeScript units (a copy of `react` stays shared, which is what is wanted). `hub.__freshPageForTests()` alone resets the hub only. Sentence: "To test a reload, call `vi.resetModules()` and import the app again, keeping the fake IndexedDB: the hub, caches, job store and kit start empty, the device copy stays."
- **G7.** Q: with Node 25 jsdom's `localStorage` is not usable (`localStorage.clear is not a function`). Not a README matter of speed-kit, but its `WS_KEY` glue uses `localStorage`; a test setup needs a memory `Storage` (as `apps/plan-cards-taking-app/test/setup.ts`). Sentence for the speed-kit README testing note: "On Node 25 stub `localStorage` and `sessionStorage` with an in-memory `Storage`."
- **G8.** Q: what is the `onHydrated` argument exactly? Should be answered in speed-kit README `start`. Answered by: `speedKit.ts:72` (`s.onHydrated?.(h)`, `h` is the whole `Hydrated`: `entries` too). See W1.

## README wrong (W)

- **W1.** README (speed-kit, `start`): "puts the cache entries in the session cache (stale), hands the rest (`stores`, `vaults`) to `onHydrated`". Code (`speedKit.ts:72`): `s.onHydrated?.(h)` hands over the whole `Hydrated`, `entries` included. The app uses `h.entries` (their keys) to know that a first paint came from the device.
- **W2.** README (speed-kit, entry-points table): the "Updating... / Updated 14:05" line, with three dots. Code and updated-line README: `Updating…` (U+2026, one character). A test that matches `Updating...` fails. (The brief has the same three dots.)
- **W3.** (Brief, not README.) The brief expects a `recheck` refusal to show "the cancelled sentence". The code shows `failText(kind, reason)` (G4). The app's T6 asserts what the code does: `Not renamed: the name changed since you started editing. Look again.`

## Stand-in, and what must change for the real platform

- `src/fakePlatform.ts`: all of it. The route form for the rename (`PATCH /lws/vault/<vault>/records/<id>` with `{ name }`) is invented. A real write needs `If-Match` with the row's `etag`, the platform's own route, an `Idempotency-Key` where it creates, and `originHostMismatch` checked. The entry body keys `name` and `description` (no `a:` prefix) and the typed row shape are the stand-in's; check them against the real `t:CatalogEntry`.
- `src/session.ts` `session.client`, `src/speed.ts` `signIn`: the stand-in sign-in (two buttons) and `standIn.client(person)` become the real sign-in and the authenticated fetch (`platform.fetch` adds the token and DPoP proof).
- `PEOPLE` and the screens' `ws` (the person's vault is also the workspace): the real app has a vault list and a workspace choice (`switchWorkspace` is written but no screen calls it).
- `?latency=` and `window.__speedProof.requests/log`: counted at the stand-in; for the real platform count at the fetch the app is given.
- The source marker (`memory`/`device`/`network`) is the app's own: `provenance` (set by `onHydrated` and by a loader's success). `ms` is read in the first effect that sees rows, not at paint.
- "The fake platform's own in-memory state registered with `hub.registerCache`": read as the app's per-person holders (`session.client`, `provenance`, `useJobs` views). The stand-in's server data is NOT registered: it is the server, and clearing it on sign-out would be wrong.
- Not covered by a test: React `StrictMode` (only `main.tsx` uses it), the focus revalidation (`installFocus`), `switchWorkspace`, a persisted `WS_KEY`.

## Batch S2-B (real browsers)

- T9 (bare `hub.setPrincipal(Ben)`) was RED before a fix: the Entries page stayed mounted, `cacheKey` re-read the hub (Ben) while the page still held Ann's workspace and client, so it loaded Ann's vault under Ben's key and showed "Ann entry" rows under Ben. Fix: `liveEntriesKey(ws)` in `src/entries.ts` (key is null while `hub.currentPrincipal() !== ws`; used by Entries and Entry) and a hub registration in `App.tsx` that sends the screens back to sign-in. Note this ties person to workspace (stand-in coupling).
- `playwright-core` 1.61.0 (chromium 1228, webkit 2311); both ran.
- B5 as written fails: the idle warm at sign-in starts the "entries" warmer, and prefetch-registry does not start it again within staleMs (30 s), so a hover then sends nothing (also with the cache cleared). B5 now records that hover, waits 31 s, then checks the hover warms.
- B1 waits on 5 sequential requests (since=head, 3 walk pages of 200, one since pass) at 600 ms each: first row at about 3.0 s.

## Batch S2-C (app)

- `liveEntriesKey` removed (0.2.1). Tried to make a test red without it: a bare `hub.setPrincipal` inside `act`, and outside it (React act environment off); in both the screens unmount with the App reset before any load starts for the new person (no extra records request). With the guard AND the App reset removed, T9 goes red (`expected 6 to be 3`: a load starts), so the App reset is what protects. The guard was not tested because it is not needed in any ordering I could build.
- Dev mode (`npm run dev`): the sign-in screen draws, then after `signin-ann` the page errors `React is not defined` and no row appears (updated-line's JSX is pre-bundled with classic JSX). Fix in `vite.config.ts`: `optimizeDeps: { esbuildOptions: { jsx: "automatic" } }`. Proof: `npm run proof:browser -- --dev` passes with it and fails without it.

## Batch S2-C2 (app)

- T2 flake: `findByTestId("entry-e1")` resolves when the row is in the DOM; the meter is set in an effect and the panel re-renders through `useSyncExternalStore` a step later. Shown by delaying `setPaint` by 20 ms (the meter, not the test, changed): T2 then fails with the dispatcher's line, `expected '' to be 'device'`. Not reproduced natively in 10 cold rounds here. T2 and T1:12 now wait for the reading; the row count and `answered() === 0` stay synchronous at the first row.
- `scripts/flake-check.sh N` runs N cold rounds.

## Batch S2-D1 (live mode, read only)

- Built and tested locally only: no sign-in, no production call, `dev:live` never started.
- The server named in the brief (`GilbPlatform/src`) is an old checkout (Cycle196, 2026-09-19) with no `since=`, `include=body` or `nextCursor`; the wire facts are from `GilbPlatform-snapshot-2026-10-30` (3185a3b8).

## Batch S2-D1b (live mode: two origins, port 5251)

- S2-D1 sent sign-in and `/lws/vaults` to the apex derived from the vault host. Wrong: a key-bound call at the apex fails the DPoP htu (RuleRigdevDpopHtuReceivedHost). Now two origins as in records-app (proven live 2026-10-29): `--id` (default `https://id.gilb.com`) for sign-in and `/lws/vaults`, `--platform` (default `https://gilb.com`) for `setBaseOrigin` and the system hosts. For a vault not under gilb.com both flags are required. Nothing is derived.
- Live port moved from 5197 (held by another session) to 5251.
- A reach row is the pinned vault by its `vaultId`, else by the origin of its `@id`; the screen says which.

## Batch S2-D2 (live writes)

- Local only. No sign-in, no production call, `dev:live` never started.
- Server (GilbPlatform 3185a3b8): `Idempotency-Key` on `POST /lws/vault/<v>/c` is honoured (src/lws/routes.ts:849-870, replay at :274-297, key read in src/lws/idempotency.ts:30-52). A single-record end exists: `DELETE /lws/r/<id>` (src/lws/routes.ts:1015-1075), `If-Match` optional.
- records-app's `createRecord` sends no `Idempotency-Key`, so the create is written here (`src/live/writes.ts`) with the unit's route and body shape.
- The write keys `a:name` and `a:description` are written as the brief says, not spelled through the vault's context; the read-back catches a vault that stores them differently.

## Batch S2-D2b (an ended record is a 200, not a 404)

- Measured live 2026-10-29 (207 DELETEd records, all re-read as 200 with `a:entityLifecycleState: ended`) and in the server: GilbPlatform 3185a3b8 src/lws/resource-frame.ts:36-38 (`a:entityLifecycleState`, `a:endingActorKind`), src/lws/routes.ts:11-12 and :200. Only a husk or an unreadable record is a 404.
- `read()` now answers live, ended or gone. End counts ended or gone as ended; a rename of an ended or gone record is refused. The ended-list read (`endedAmong`) is removed: the per-record read proves the same thing.

## Batch S2-D3 (the counter, start diagnostics, live README)

- Live findings: sign-in and `/lws/vaults` go to the identity host (`id.gilb.com`), not the apex (a key-bound call at the apex fails the DPoP check); the platform apex is only `setBaseOrigin` and the system hosts. An ended record reads 200 with `a:entityLifecycleState: "ended"`, not 404 (207 of 207 measured live). 500 creates at 4 in flight took 26.5 s.
- The "N made by this app" counter was read at mount only, so it showed 0 while 500 ids were in localStorage. It now follows the list through a small store (`src/live/made.ts`), W8.
- F4 (one device miss) is open: `window.__speedProof.start` and the line under the panel say what `start` answered, in both modes (T11). `entries` there is the number of cache entries `onHydrated` received (one per resource, so 1 for the list), not rows.
