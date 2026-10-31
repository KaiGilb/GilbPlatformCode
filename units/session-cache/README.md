# session-cache

## What this is

An in-memory cache that a page opens from at once and revalidates behind, keyed by person and workspace, bounded by entries and bytes, and emptied when the person changes.

Plain TypeScript, no React, no network of its own. The host gives each read a key and a loader (a function that returns a promise). `swr` answers with the value held (nothing on a miss) and, when it is older than `STALE_MS` or the tab regained focus since it was loaded, starts ONE background load that every caller shares. A failed load keeps the last good value and exposes the error. Memory is bounded by entry count and by estimated bytes (least recently used go first; an entry in flight or subscribed to stays). It depends on the `principal-hub` unit: the person is part of every key, and an answer that arrives after the person changed is dropped.

- `createSessionCache(options?)`: makes a cache. Options (all optional): `now` (the clock, default `Date.now`), `staleMs` (`STALE_MS`), `maxEntries` (`MAX_ENTRIES`), `maxBytes` (`MAX_BYTES`), `sizeOf` (a size estimate; default is the length of `JSON.stringify`, and 0 when that throws). It returns these members:
  - `key`: the same function as `cacheKey`.
  - `peek(key)`: the entry as a snapshot `{ data, updating, error, updatedAt }`, plus `partial: true` ONLY while `data` is a preview (see `LoadContext`); a stable object until the entry changes.
  - `swr(key, loader)`: `{ value, stale, promise }`. The value held at once (`undefined` on a miss); `stale` is true when a value is held but not fresh; the promise resolves with the revalidated value (with the held value if the revalidation fails).
  - `refresh(key, loader?)`: ALWAYS loads (a write just happened), never joined to a load that started before it; the newest load wins. It answers a promise of the loaded value (`Promise<T>`, `refresh` in `sessionCache.ts`), and rejects with the loader's error when the load fails (the entry also holds the error). Without a loader it reuses the last one for that key, and rejects when there is none.
  - `set(key, value)`: puts a value the page loaded its own way; fresh as of now; supersedes a load in flight.
  - `onCommit(fn | undefined)`: one listener, told `(key, value, at)` with each value that lands (a load answered, or `set`). A listener that throws does not break a load.
  - `hydrate(items)`: puts `{ key, value, at }` values read from disk in, before anything is asked: stale, dated as stored, and a key that already holds a value is left alone.
  - `invalidate(keys)`: marks entries stale (value kept). A key ending in `*` is a prefix. An entry someone is subscribed to is revalidated now (when it is already loading, once more right after that load).
  - `warm(key, loader)`: loads when there is no fresh value and no load in flight; never throws.
  - `subscribe(key, fn)`: told on every change of that entry; returns the remover.
  - `notifyFocus()`: every value loaded before is stale for the next use; what a subscriber shows is revalidated now.
  - `clear()`: drops every entry and tells subscribers; loads in flight finish for their callers and are kept by nobody.
  - `size()`, `bytes()`: entries held; estimated bytes held.
  - `installFocus(target = window)`: listens for `focus` on the target and for `visibilitychange` on the document; returns the remover.
- `cacheKey(workspace, resource)`: `principal|workspace|resource`, with the person taken from the hub when the key is made (an empty string when nobody is signed in). Make the key BEFORE an await and keep it: a write made late lands under the old person's key, which nobody else reads.
- `keyParts(key)`: `{ principal, workspace, resource }`.
- `sessionCache`: the app's one cache (`createSessionCache()` with the defaults). It registers itself with the hub as `"sessionCache"`, so a change of person empties it.
- `clearSessionCache()`: `sessionCache.clear()`.
- `STALE_MS` (30 000), `MAX_ENTRIES` (200), `MAX_BYTES` (32 MiB), and the types `CacheState`, `Loader`, `LoadContext`, `SessionCacheOptions`, `SessionCache`.
- `LoadContext<T>` (0.2.0): what a loader is handed, `Loader<T> = (ctx?: LoadContext<T>) => Promise<T>`. `ctx.preview(value)` shows `value` as `data`, with `partial: true` and `updating: true`, while the load runs, so a first visit can show the rows read so far. It takes effect only while ALL hold: the entry holds no value (not from `set`, not from the disk by `hydrate`, not from an earlier load), this load is still the newest for the key (no `set`, `refresh`, `invalidate` or `clear` since), it has not answered or failed, and the person is the one who started it. Otherwise it does nothing. A preview is not a value: `updatedAt` stays `undefined`, it is not fresh (a second `swr` joins the load), it is not counted in `bytes`, and it never reaches `onCommit`, so it is never put on disk. The load's answer replaces it in one step. If the load fails the preview stays, with `error` set, `updating: false` and `partial: true`, and is not stored; the next load begins with none. A loader that takes no argument works as before.

## What this is not

- Not a loader: it fetches nothing; the host's loader does.
- Not stored on disk: see `device-store` for a copy kept in the browser. `onCommit` and `hydrate` are the two doors a bridge uses to connect the two.
- Not a React hook: see `use-cached`.
- Not a sign-in: the host tells the hub who the person is (`setPrincipal`).

## How to take it

Package: `@kaigilb/gilbplatformcode-session-cache`

It depends on `principal-hub` by `file:` path. The unit's own `.npmrc` sets `install-links=true`, so inside the library the sibling is installed as a copy. That file does not govern your app's install. First put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install the units in order (the line `node scripts/peers.mjs session-cache` prints):

```sh
npm install <path-to-the-library>/units/principal-hub <path-to-the-library>/units/session-cache
```

The package ships TypeScript source (`src/`); your bundler compiles it. No third-party runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { setPrincipal } from "@kaigilb/gilbplatformcode-principal-hub";
import { cacheKey, sessionCache } from "@kaigilb/gilbplatformcode-session-cache";

sessionCache.installFocus(window); // once, at start-up (the source app did this when the module loaded)
setPrincipal("https://ann.example.test/vault"); // a sign-in

const key = cacheKey("https://team.example.test/vault", "drafts");
const { value, promise } = sessionCache.swr(key, () => fetchDrafts());
// value is what the last visit loaded (undefined the first time); promise is the revalidated value
await sessionCache.refresh(key); // after a write: always loads
```

## What the host must supply

- A loader for each read.
- The call to `sessionCache.installFocus(window)` once at start-up, if the tab regaining focus should revalidate. This is the one behaviour that differs from the source app (see Named changes).
- The calls to `setPrincipal` that `principal-hub` needs; see its README.

## Module state

`sessionCache` and the hub registration are made when the module loads. The cache is a singleton by design: a host that wants one cache must install this unit once. Two copies would be two caches, and a second copy of `principal-hub` would split who is signed in. `principal-hub` is a peer of every unit that registers a cache; install one copy of each.

Dynamic imports in the files taken: none.

## Do not

- Do not make a key with `cacheKey` and then wait for a sign-in before using it; the person is read when the key is made.
- Do not put anything in it that is not a copy of what the host already read: it is a copy, with no write of its own.

## Wrong readings

- "`swr` always returns a promise of a fresh value." On a failed revalidation it resolves with the value held; the error is on `peek(key).error`.
- "`invalidate` removes the entry." It keeps the value and marks it stale, so the page still shows it.
- "`refresh` with no loader loads nothing." It reuses the last loader for that key, and rejects `session cache: nothing to refresh for <resource>` when there is none.
- "`clear` cancels loads in flight." They finish for their callers; their answers are kept by nobody.
- "A preview is the data, a little early." It is a view that may lack rows and may show a row since changed. The screen that shows it must say "at least N" and why (RuleAppspeedVisibleWait); this unit supplies `partial` and nothing of the words.
- "`partial` means the value is old." It means there is NO committed value yet. An old value from the disk or an earlier load is shown with `partial` absent, and a preview never replaces it.

## Where it came from

Changes in 0.2.0: `LoadContext` and `CacheState.partial` (named change 4 below). Everything else is as in 0.1.0; the exports of 0.1.0 keep their meaning, and `Object.keys(createSessionCache())` is unchanged, because the preview is a call the loader makes, not a method of the cache. Tests: `src/loadContext.test.ts` (21 tests, 70 in the unit).

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`, copied by script: `src/lib/sessionCache.ts` lines 1-235 to `src/sessionCache.ts`.

Named changes, and only these (the first three are in 0.1.0):

1. the import of the person hub reads from the package `@kaigilb/gilbplatformcode-principal-hub` instead of `./principalHub`;
2. the last line of the module, which installed the focus listener on the window when the module loaded (`if (typeof window !== "undefined") sessionCache.installFocus(window);`), is removed: the host calls `sessionCache.installFocus(window)` once (the seam map's rule: no `window` call at import);
3. comments lose their cycle tags, and the third line no longer names the source app's workspace file. No other code changed;
4. 0.2.0, made in this unit before Social has it (RuleGhsResync; keep it when re-syncing): `LoadContext`, `Loader<T> = (ctx?) => Promise<T>`, `CacheState.partial`, the entry's preview, and the passing of the context in `start`. Named in `unit.json` as `LoadContext.preview`.

`src/index.ts` is new.

Tests (`src/*.test.ts`; no shared set-up; jsdom): `sessionCache.test.ts` is ported from the source app's `src/lib/sessionCache.test.ts` (17 of its 19 tests, same inputs and expectations; includes the rule 6 case that a refresh is never joined to an earlier load). `sessionCachePins.test.ts` is new: it pins every export, the key shape, the hub registration, a late answer after a change of person, `set`, `onCommit`, `hydrate`, `refresh` without a loader, byte sizing, `installFocus` and the absence of a focus listener at import. `hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, and why: from `sessionCache.test.ts`, the two tests that run the source app's workspace module (`the app's cache is cleared by a workspace switch` and `a real workspace switch drops the cache`). The rest of the source test files that name `sessionCache` (about 20, for example `p154-principal-hub`, `p154-b4`, `p154-b5`, `p154-b6-persist`, `p154-late`, `p154-persist`, `p153-s5-views`, `p153-topics-cache`, `p155-your-ideas`, `p134-b5-tester-r1`) run the source app's pages, its stubbed platform or its bridge, or scan its source.
