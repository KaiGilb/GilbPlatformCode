# prefetch-registry

## What this is

A registry of page warmers that start a page's cache loads before the person asks: each warmer is started once per workspace within the stale window and not while it runs, heavy ones are skipped on save-data or a slow link, and the picture count ahead follows the screen width.

Plain TypeScript, no React, no network of its own. A page registers its warmers (functions that load into the host's cache); the host calls `prefetchPage(page)` when a nav button is pointed at, focused or pressed, and `prefetchAll()` when the browser is idle after the first paint. It depends on the `principal-hub` unit: when the person changes, the context goes and nothing is warmed for the person before. It does not depend on `session-cache`: a warmer calls the host's cache itself.

`createPrefetchRegistry<Ctx>(options?)` makes a registry. `Ctx` extends `WarmContext = { ws: string; vault: unknown }`: `ws` is the workspace, `vault` is the host's client (compared by identity). Options (all optional): `staleMs` (30 000), `cacheName` (`"prefetch"`, the name it registers under with the hub), `wideCount` (3), `narrowCount` (2), `narrowBelow` (640 px), `network` (replaces `read` and `width`). Members:

- `setWarmContext(ctx | null)`, `getWarmContext()`: the client and workspace the warmers run for; null warms nothing. A context with an empty `ws` also warms nothing.
- `registerWarm(page, fn, { heavy? })`: adds a warmer for a page and returns its remover. `heavy: true` marks one that costs real data: it does not run when the browser says save-data or the connection is `2g`/`slow-2g`. A warmer is a `(ctx) => Promise | void`; a throw (sync or async) does not stop the caller or the other warmers.
- `prefetchPage(page)`: starts the page's warmers, each at most once for the same workspace and client within `staleMs`, and not again while it runs (hover, focus and press arrive together).
- `prefetchAll()`: every page's warmers, once.
- `network`: `{ read(), width() }`: the Network Information API reading (nothing is assumed where absent) and the window width. Tests replace the members.
- `heavyPrefetchOk()`, `prefetchPictureCount()`: heavy is allowed unless save-data or 2g; the count is `wideCount` on a wide screen, `narrowCount` below `narrowBelow`, and 0 when heavy is off.
- `setPrefetchClock(now)`: the clock the stale window reads.

`onIdle(fn, timeoutMs = 300)`: runs `fn` when the browser is idle (`requestIdleCallback`, else a timeout); returns the canceller.

Width. The registry itself imposes no cap: every warmer of a page is started in the same tick, and it holds no pool. The source file had none either. The width of a warm comes from the warmers (how many reads each makes). In the source app the data-driven reads are capped by a literal batch of 25 in its own `shared/draftRecords.ts` (found by the T0 tester), and that cap stays with the code that makes the reads. A host that registers a warmer whose width follows data must bound it there (RuleBasespeedBoundedFanOut); this unit gives no cap to lean on.

## What this is not

- Not a loader and not a cache: a warmer loads into whatever cache the host has (in the source app, the session cache).
- Not the host's list of warmers: which pages exist and what each loads is the host's.
- Not a React hook: see "What stayed in the source app".

## How to take it

Package: `@kaigilb/gilbplatformcode-prefetch-registry`

It depends on `principal-hub` by `file:` path. The unit's own `.npmrc` sets `install-links=true`, so inside the library the sibling is installed as a copy. That file does not govern your app's install. First put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install the units in order (the line `node scripts/peers.mjs prefetch-registry` prints):

```sh
npm install <path-to-the-library>/units/principal-hub <path-to-the-library>/units/prefetch-registry
```

The package ships TypeScript source (`src/`); your bundler compiles it. No third-party runtime dependency.

## Examples

```ts
import { createPrefetchRegistry, onIdle, type WarmContext } from "@kaigilb/gilbplatformcode-prefetch-registry";

interface Ctx extends WarmContext { principal?: string }
export const prefetch = createPrefetchRegistry<Ctx>();

prefetch.registerWarm("inbox", ({ ws }) => cache.warm(inboxKey(ws), () => loadInbox(ws)));
prefetch.registerWarm("gallery", ({ ws }) => warmFirstPictures(ws, prefetch.prefetchPictureCount()), { heavy: true });

// in the app shell, once signed in:
prefetch.setWarmContext({ vault: client, ws, principal });
const stop = onIdle(prefetch.prefetchAll);
// on a nav button: onPointerOver / onFocus / onPointerDown / onTouchStart => prefetch.prefetchPage("inbox")
```

## What the host must supply

- The warmers, and the cache they load into.
- `setWarmContext` when the person is signed in and a workspace is chosen, and the calls to `prefetchPage` / `prefetchAll`.
- The `setPrincipal` calls that `principal-hub` needs.
- A bound on any warmer whose width follows data (see Width).

## Module state

The state belongs to the registry that `createPrefetchRegistry` returns; importing the package runs nothing. The call registers one clearer with the hub under `cacheName`; a second registry needs its own `cacheName`. A second copy of `principal-hub` would split who is signed in: install one.

Dynamic imports in the files taken: none.

## Do not

- Do not prefetch anything that writes: a warmer only reads.
- Do not mark a light read `heavy`, or a picture or deep walk light: on a phone with data saver the heavy ones are the ones that must not run.
- Do not read the warm context before a sign-in; it is null until the host sets it, and it is cleared when the person changes.

## Wrong readings

- "The registry limits how many requests run at once." It does not; see Width.
- "A warmer runs on every hover." It runs once per workspace and client within `staleMs`, and not while it is running.
- "A hover warms again once the host's cache entry is gone." It does not. The registry remembers only that the warmer started (`prefetch.ts:97`), not what the cache holds: for the same workspace and client, a warmer is not started again within `staleMs` of its last start, so a hover soon after the idle warm of sign-in sends nothing, even with an empty cache. The taking app measured this in a real browser (the hover warmed only after 31 s).
- "A heavy warmer that was skipped is retried later on its own." It is not; the next `prefetchPage` call, after the connection allows it, starts it.
- "`wideCount` is the number of requests." It is a number the host's picture warmer asks for through `prefetchPictureCount()`; the registry does not fetch pictures.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`: the generic part of `src/lib/prefetch.ts` (lines 19-111, without the warm functions and their registrations) to `src/prefetch.ts`, wrapped by hand in a factory (not copied by script).

Named changes, and only these:

1. only the generic part is taken; the five warm functions, the five registrations and the imports of the source app's modules stay in the source app;
2. the module-level state becomes `createPrefetchRegistry(options)`; `onIdle` stays a plain export; nothing runs at import;
3. `WarmContext` is `{ ws; vault: unknown }` and the registry is generic over a context type that extends it;
4. `STALE_MS` is the option `staleMs` (default 30 000, the same number);
5. the picture counts and the 640 px edge are the options `wideCount`, `narrowCount`, `narrowBelow`, with those values as defaults; `network` can be given as an option;
6. the registration name is the option `cacheName` (default "prefetch");
7. `getWarmContext()` is new: the source's warm functions read the module's `context` directly;
8. the header comment loses its cycle tags and the source app's page names.

`src/index.ts` is new.

Tests (`src/*.test.ts`; jsdom): `prefetch.test.ts` is ported (same inputs and expectations, against a registry made by `createPrefetchRegistry`) from the source app's tester-s1 `tester-s1-prefetch.test.tsx` (P2, P3, P6, P9), `src/p153-s7.test.tsx` (the `onIdle` test; the registered warmer runs once, rewritten without the nav button; the prefetchAll once-per-key idea, rewritten with plain warmers) and `src/p154-persist.test.tsx` ("mobile first prefetch": 3 tests). It adds one new test that warmers receive the host's whole context object. `prefetchPins.test.ts` is new and pins every member and option, the hub clearing, the dedupe key (workspace, client identity, `staleMs` edge) and the absence of a cap. `hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, and why: tester-s1 P1 (reads only against the source app's vault fake), P4 (`warmTopics` for another workspace), P5 and P5b (the width of the source app's whole warm chain against its fake platform), P7 and P8 (`usePrefetch` and the nav events), and from `p153-s7`, `p153-rc13`, `p154-principal-hub`, `p154-late` the tests that run the source app's pages or warm functions.

## What stayed in the source app

Wiring examples, none in this unit:

- the context shape `{ vault: VaultClient, ws, drafts?, principal? }` (the `Ctx` type);
- the warm functions `warmTopics`, `warmLinks`, `warmPack`, `warmStatus`, `warmIdeas`, and the warmers registered for the pages `topics`, `drafts`, `schedule`, `video`, `connect` (draft sources, the pack, recordings, the connect view);
- `usePrefetch.ts`: the React hook that sets the context, calls `onIdle(prefetchAll)` and returns the nav handlers (pointer-over, focus, pointer-down, touch-start) reading the page from the button's `data-testid="nav-<page>"`. It needs React and the app's types;
- the data-driven width cap `READ_BATCH = 25` (`shared/draftRecords.ts:189`, from the T0 tester), and the picture warmer that calls `prefetchPictureCount()`.
