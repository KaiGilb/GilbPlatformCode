# device-store

## What this is

The copy of what an app has read, kept in the browser per person and workspace as a starting point and never an answer, bounded by size, and gone when the person goes.

Plain TypeScript, no React, no network. The host saves what it has read (cache entries, per-type stores with the position they are current to, the list of vaults); at the next visit the host asks for it back BEFORE the network and shows it, then catches up. Everything read from the copy is stale on arrival. A missing or partial copy is "no cache", never "no data" (a browser may delete script-written storage). Writes are debounced and batched off the paint path. The copy is bounded (25 MB by default, least recently used first; the vault list is never evicted). Any failure (no IndexedDB, private mode, quota) turns the disk off for the session and the host carries on from memory.

- `indexedDbKv(factory, name, schema = SCHEMA)`: opens the IndexedDB database called `name` and returns a `Kv`, or `null` when IndexedDB is not there or will not open (private mode, blocked by another tab that holds an older connection, a newer schema than this code). Pass `undefined` as `factory` to use the browser's `indexedDB`. An older schema is wiped by the upgrade. `name` is required; there is no default.
- `memoryKv()`: a `Kv` in a `Map` (`recs` is exposed) for tests and for a host without IndexedDB.
- `new Persist(kv | null, principal, options?)`: options `maxBytes` (`DEFAULT_MAX_BYTES`), `now`, `flushMs` (400), `schedule(fn, ms)` (default `setTimeout`; tests flush by hand). A `null` kv is a disk that is off.
  - `adopt()`: the first act for a person. Records of any other person, or of another schema, are deleted; the index is read.
  - `hydrate(workspace)`: `{ vaults, entries, stores }` for the person's vault list and one workspace. Records that do not look whole, a store older than `STORE_MAX_AGE_MS`, a stamp in the future (beyond `FUTURE_SKEW_MS`) are skipped and removed. Never rejects.
  - `saveEntry(workspace, name, value, at)`, `saveEntryLazy(workspace, name, make, at)`, `saveStore(event)`, `saveVaults(list)`: queue a write. A store whose snapshot is partial because a failure cut it short (`snap.reason` set) is not kept.
  - `flush()`: writes the queue as one batch, then brings the copy under its bound; on a failure it drops the older half once and retries, and if that fails the disk is off. Never rejects.
  - `close()`: the person is gone; nothing more is written. `clear()`: sign-out; everything goes, whoever it belonged to. `size()`, `disk`, `principal`.
- `SCHEMA` (1), `DEFAULT_MAX_BYTES` (25 MiB), `STORE_MAX_AGE_MS` (24 h), `FUTURE_SKEW_MS` (1 min).
- The types `Kv`, `DiskRec`, `Kind` (`"entry" | "store" | "vaults"`), `Hydrated`, `PersistOptions`, and from `src/types.ts` the structural `ListedRecord`, `RecordDoc`, `StoreSnapshot`, `StoreEvent`, `ReachableVault`.

## What this is not

- Not the wiring: it knows nothing of the host's cache, pages or vault client. See "Wiring example" below.
- Not an answer: the host must catch up from the stored position (`since=`) or reload; this unit never says a stored row is current.
- Not a sign-in: the host passes the person's identifier and calls `clear()` on sign-out.

## Parameters

- `name` of `indexedDbKv`: the database name. Required. Choose one per app, for example `"myapp-cache"`.
- The `store` and `vaults` kinds, the `since=` cursor check (a stored store needs a non-empty string `cursor` and records that each have a string `entity`) and the 24 h age bound are the platform's shape and are kept as they were.

## Structural types

`src/types.ts` declares the shapes `persist.ts` stores and returns, so the unit imports nothing from an app. Any app type with these members fits; an app's own record type that extends them round-trips (tested). `compat/socialAssignable.check.ts` is a compile-time check that the source app's real `ListedRecord`, `RecordDoc`, `ReachableVault` and `StoreEvent` (from `shared/vault.ts` of the frozen copy, read by relative path) are assignable to these types, and that what `hydrate` returns is assignable back to the app's store seed and vault list. It is test-only: it is not in the package `files`, and `tsconfig.json` excludes `compat`, so `npm run typecheck` and CI never touch it. `npm run check:compat` (`tsc --noEmit -p tsconfig.compat.json`) runs it and needs the local frozen copy on disk; it is run by hand, not in CI.

## Wiring example (stays in the source app)

The source app wires this unit in `src/lib/persistBridge.ts` (not copied; it is the example):
- `startPersistence(person)` opens the disk with a bounded wait (a disk that hangs is "no cache" after a fixed time), makes a `Persist`, calls `adopt()` and `hydrate(workspace)`, then hands the result to the app: `hydrate().entries` go to the in-memory cache's `hydrate`, each `hydrate().stores[i].snap` seeds the vault client's store of that key, and `hydrate().vaults` seeds the vault list.
- It listens to the cache's commit callback and the vault client's store and vault-list events and calls `saveEntry`, `saveStore` and `saveVaults`.
- On a change of person or a sign-out it calls `close()` and `clear()`, which empties the disk.

A host writes the same three pieces: open, hydrate before the network and catch up, and listen and save.

## How to take it

Package: `@kaigilb/gilbplatformcode-device-store`

Put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/device-store
```

No peer. The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { indexedDbKv, Persist } from "@kaigilb/gilbplatformcode-device-store";

const kv = await indexedDbKv(undefined, "myapp-cache"); // null when the browser will not give us a disk
const persist = new Persist(kv, "https://ann.example.test/vault");
await persist.adopt(); // deletes any other person's records
const { vaults, entries, stores } = await persist.hydrate("https://team.example.test/vault"); // stale: catch up behind it
persist.saveEntry("https://team.example.test/vault", "drafts", { rows: [] }, Date.now());
// on sign-out: persist.close(); await persist.clear();
```

## What the host must supply

- A database `name` and the person's identifier.
- The wiring above: what to save, when to hydrate (before the network), the catch-up, and `close()` plus `clear()` on a change of person or a sign-out.

## Module state

None. Each `Persist` and each `Kv` holds its own state.

Dynamic imports in the files taken: none.

## Do not

- Do not answer a page from `hydrate` as it stands; it is a starting point.
- Do not share one `Persist` between two people; make a new one after `close()`.
- Do not use one `name` for two apps on the same origin: they would wipe each other on a schema change.

## Wrong readings

- "A failed write loses the app's data." It turns the disk off for the session; the host's memory is untouched.
- "`hydrate` returns every record of the person." It returns the vault list and one workspace, and drops what does not look whole.
- "`clear` is for a change of person." `adopt` already removes other people's records; `clear` is the sign-out wipe.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`, copied by script and then edited for the seam: `src/lib/persist.ts` lines 1-242 to `src/persist.ts`. The shapes in `src/types.ts` are copied from `shared/vault.ts` of the same commit (lines 17-22, 25, 130, 137, 382) and reduced to what `persist.ts` uses.

Named changes, and only these:

1. the first comment line loses its cycle tag, the app's name and a person's name, and the seventh no longer names the source app's bridge file; no code changed;
2. the type-only import of `ListedRecord`, `RecordDoc`, `ReachableVault` and `StoreEvent` reads from `./types` instead of the app's `shared/vault`; `src/types.ts` declares them structurally (no runtime code);
3. `indexedDbKv(factory, name, schema)`: `name` was `name = "social-cache"` and is now a required `string` with no default. Nothing else changed in the function.

`src/index.ts` and `src/types.ts` are new. `StoreSnapshot` here has no `reloaded` member (persist.ts never reads it); a ported test literal that set `reloaded: true` lost that one property.

Tests (`src/*.test.ts`; no shared set-up; Node; `fake-indexeddb` 6.2.6, the version the source app pins):
- `persistIdb.test.ts`: ported from the source app's `p154-idb.test.ts` (open and upgrade, put/read/remove/wipe, Persist on the real adapter, two tabs), with the database name `example-cache`.
- `persistMemory.test.ts`: ported from the source tests that call `Persist` or `memoryKv` alone: the clock set back (`p154-b4`), a copy that does not look whole, the size bound, batching and a failing disk (`p154-persist`), and the guards P1 to P3 (`p154-b6-persist`).
- `persistPins.test.ts`: new; pins every export, the required name, lazy entries, a failure-cut partial store, and an app's own record type that round-trips.
- `hostAgnostic.test.ts`: the same host-agnostic check test as the other units.

Left out: the describe "a disk that hangs" of `p154-idb.test.ts` and the `wipeStoredCopy` step of its sign-out test (they test `persistBridge.ts`, which stays in the source app); the tests of `p154-persist.test.tsx`, `p154-principal-hub.test.tsx`, `p154-b5.test.tsx`, `p154-b6.test.tsx`, `p154-late.test.tsx` and `p154-b6-persist.test.tsx` (its `R4` and `D1`-`D4` blocks) that render the app's pages, run the bridge or a stubbed platform, or use the app's caches; the page parts of "no IndexedDB, a failing disk, or a refused quota".
