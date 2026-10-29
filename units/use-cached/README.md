# use-cached

## What this is

A React hook that shows a page's data on the first render when the session cache holds it, revalidates behind it, and says when an update is running.

`useCached(key, loader, cache?)` reads the cache through `useSyncExternalStore`, so a page the person has opened before is not blank on its first render. After mount it asks the cache for a revalidation (the cache decides: only when the value is older than 30 s or the tab regained focus, and one load per key however many components ask). `updating` says one is running. The loader is read through a ref, so a new function each render does not reload and `refresh` always uses the latest.

- `useCached<T>(key, loader, cache = sessionCache)`: returns `Cached<T>` = `{ data, updating, error, updatedAt, refresh }`. `key` is a key made by `cacheKey` of the `session-cache` unit, or `null` while the workspace is not known (nothing is loaded and `refresh` does nothing). `refresh()` loads again, always (after a write), never rejects (the entry holds the error), and keeps its identity while `key` and `cache` stay the same.
- The type `Cached<T>`.

## What this is not

- Not a cache: `session-cache` holds the values.
- Not a loader and not a store of the host's data.

## How to take it

Package: `@kaigilb/gilbplatformcode-use-cached`

It depends on `session-cache` (which depends on `principal-hub`) by `file:` path, and on React 19 as a peer. First put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install the units in order (the line `node scripts/peers.mjs use-cached` prints):

```sh
npm install react@^19.0.0 <path-to-the-library>/units/principal-hub <path-to-the-library>/units/session-cache <path-to-the-library>/units/use-cached
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { cacheKey } from "@kaigilb/gilbplatformcode-session-cache";
import { useCached } from "@kaigilb/gilbplatformcode-use-cached";

function Drafts({ workspace }: { workspace: string | null }) {
  const key = workspace ? cacheKey(workspace, "drafts") : null;
  const { data, updating, error, refresh } = useCached(key, () => fetchDrafts(workspace!));
  return (
    <section>
      {data === undefined ? <p>Loading</p> : <ul>{data.map((d) => <li key={d.id}>{d.title}</li>)}</ul>}
      {updating && <p>Updating</p>}
      {error ? <p>Could not update</p> : null}
      <button onClick={() => void refresh()}>Reload</button>
    </section>
  );
}
```

## What the host must supply

- A key and a loader. Nothing else: the default cache is the `session-cache` singleton, so the host also does what that unit asks (`setPrincipal`, `installFocus`).

## Module state

None of its own. It uses the `session-cache` singleton by default; install one copy of `session-cache` and of `principal-hub`.

Dynamic imports in the files taken: none.

## Do not

- Do not make `key` before the person is known and keep it: `cacheKey` reads the person when it is called.
- Do not call `refresh` in a render; call it from an event or an effect.

## Wrong readings

- "A new `loader` function on each render reloads the data." It does not; the latest loader is held in a ref and is used only when a load starts.
- "`refresh` rejects when the load fails." It never rejects; the failure is `error`, beside the last good `data`.
- "`useCached` always loads on mount." A fresh value is not loaded again.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`, copied by script: `src/lib/useCached.ts` lines 1-31 to `src/useCached.ts`.

Named changes, and only these: the import of the cache reads from the package `@kaigilb/gilbplatformcode-session-cache` instead of `./sessionCache`, and the first comment line loses its cycle tag. No code changed. `src/index.ts` is new.

Tests (`src/*.test.tsx`; no shared set-up; jsdom): `useCached.test.tsx` is ported whole from the source app's `src/lib/useCached.test.tsx` (5 tests). `useCachedRules.test.tsx` is ported whole from the source app's `tester-s1/tester-s1-useCached.test.tsx` (8 tests: paint from memory, one request in flight per key, errors not stored, the latest loader, fresh before write), with the host renamed `a.example`. `useCachedPins.test.tsx` is new and pins the library entry, the default cache, the result's members, the null key and the stable `refresh`. `hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out: the source tests that reach the hook through the app's pages (`p153-s5-connect`, `p153-s5-views`, `p153-flow-sources`, `p153-topics-cache`, `p153-rc13`, `p154-b4`, `p154-b5` and others), which run its pages and a stubbed network.
