# speed-kit

## What this is

The speed units of a GilbPlatform app behind one entry: each unit under its own name, and one small glue that wires the person hub, the session cache, the background jobs, the prefetch registry and the device store to one app name, with a clean sign-out.

Plain TypeScript apart from the two React units it re-exports. It adds no logic of the units' own; the only new code is `createSpeedKit` in `src/speedKit.ts` (about 100 lines). The point of the glue is one thing the units do not do alone: a change of person or a sign-out leaves nothing of the person before in memory, in the job store, in the warm context or on the device (`src/twoPeople.test.ts`).

Entry points (`src/index.ts`; each name is the whole of that unit's exports):

| Name | Unit | What it is |
|---|---|---|
| `hub` | `principal-hub` | whose tab this is; clears every registered cache on a change of person; drops late answers |
| `cache` | `session-cache` | the in-memory cache a page opens from at once and revalidates behind; a loader may show the rows it has read so far with `ctx?.preview(rows)` (0.2.0) |
| `cached` | `use-cached` | the React hook over it (`cached.useCached`); its loader is handed that same `ctx`, and its result has `partial` (0.2.0) |
| `updated` | `updated-line` | the "Updating… / Updated 14:05" line, the stale note, the refresh note |
| `jobs` | `background-jobs` | jobs that outlive the page, one flight per key, one lane per workspace, never retried |
| `prefetch` | `prefetch-registry` | warmers registered per page, run on idle and on intent |
| `device` | `device-store` | the copy kept in the browser per person and workspace, a starting point and never an answer |
| `sync` | `record-sync` | the typed record list and its changes since a position |
| `createSpeedKit`, `SpeedKit`, `SpeedKitOptions`, `StartOptions` | this package | the glue below |

`@kaigilb/gilbplatformcode-speed-kit/complete-copy` is `record-sync/complete-copy` (the complete copy: `since=head`, the walk by `after=`, one `since=` pass), under this package's name. Its `completeCopy` takes an optional `onPage` (record-sync 0.4.1) that is told each walk page as it is read, with every row so far; it adds no request and changes none. It is an early look, not the copy.

## What this is not

- Not a loader, a data layer or a vault client: the app's loaders, its client and its pages stay in the app (see "What stays in the app").
- Not a place for new behaviour: a change to how a unit works is made in that unit.
- Not a measurement: it makes no number faster by itself. Rule 1 below (measure before and after) is not covered by any unit.

## Speed you can expect

Measured on `apps/speed-kit-taking-app` (REAL Chromium and WebKit, MOCK vault, 600 ms per request, 500 entries, 2026-10-30; `npm run proof:browser` there repeats it):

- A cold first visit waits for the whole `completeCopy`: `since=head`, then one walk page per 200 rows, then one `since=` pass. At 500 rows that was 5 requests one after the other, and the first row came after about 3.0 s.
- After that, a page painted from memory in about 2 ms and from the device after a reload in about 10 ms.

## The rules and the unit that implements each

`Rule_Code_gilb-app-speed` (https://appbuilder.gilb.com/base/e/06grax057dsf33639fbrqz320c), 11 rules. "Not covered" means no unit does it: the app does.

| Rule | Unit that implements it | What is and is not covered |
|---|---|---|
| 1 `RuleAppspeedMeasureFirst` | not covered | A process: the speed table before and after, a harness that counts requests. No unit measures. |
| 2 `RuleAppspeedPaintFromMemory` | `session-cache`, `use-cached`, `principal-hub` | Key by person and workspace (`cacheKey`), cleared on a change of person (hub), bounded by entries and bytes with least recently used first, one load in flight per key, a failed load keeps the last good value and exposes the error, `refresh` always loads. `cached.useCached` gives the data on the first render. The Refresh button calling `refresh` is the app's. |
| 3 `RuleAppspeedChangesOnly` | `record-sync` (and `/complete-copy`) | `since=head`, the walk by `after=`, one `since=` pass; changes since a stored position. What counts as a bounded set worth a complete copy is the app's decision. |
| 4 `RuleAppspeedOneReadPerPage` | `record-sync` (partly) | `completeCopy` reads `?type=&include=body&limit=200` with `filter=`. `walkRecordPages` reads `limit=100` and steps by `nextOffset`: not the rule's form (the unit keeps the source's 100 and the offset step). The app's per-list page reads are the app's. |
| 5 `RuleAppspeedInstantAction` | `background-jobs` | One job per key, FIFO per workspace, snapshot and `recheck` before the write, success toast, a failure kept until dismissed with its cause, an intent record so a reload says "did not finish" and never reruns, a warning before the tab closes. Not covered: `Idempotency-Key` on a create and the server's lock (the app's request and the server's). |
| 6 `RuleAppspeedFreshBeforeWrite` | `session-cache` (partly) | `refresh` is never joined to a load that started before it, and the newest wins. Using `refresh` and not `swr` for a read a write depends on, and never keeping an "already done?" guard in memory, is the app's. |
| 7 `RuleAppspeedPrefetch` | `prefetch-registry` | One registry, warmers per page, deduplicated per workspace and client within the stale window, heavy ones skipped on save-data or 2g, fewer pictures on a narrow screen, `onIdle`. Not covered: the hook with the intent handlers (a few lines, in the example below), a bound on a warmer whose width follows data, and that a warmer only reads. |
| 8 `RuleAppspeedVisibleWait` | `updated-line` (partly) | "Updating…", "Updated HH:MM", the stale note, the refresh note, a polite status region. Not covered: "at least N" for a partial read, the picture before the rest, a status that comes from a live signal. |
| 9 `RuleAppspeedPhoneFirst` | `device-store` (partly), `prefetch-registry` | Per person and workspace, loaded before the network, bounded by size, a missing or broken copy is a normal load, a disk failure turns the disk off. Save-data and 2g in the registry. Not covered: smallest-screen layout, chunking a big merge, measuring on a phone with a slowed network. The rule itself says it is a target, not a result. |
| 10 `RuleAppspeedEveryStateHasAPlace` | not covered | The app's own table test of every record state and its one place. |
| 11 `RuleAppspeedFallbackPerCaller` | not covered | A fallback switched on per caller: the app's code. |

## How to take it

Package: `@kaigilb/gilbplatformcode-speed-kit`

A new app first needs its own `package.json`: run `npm init -y` in the app folder. Otherwise npm installs into the nearest parent folder's `package.json`.

Put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install the units in order (the line `node scripts/peers.mjs speed-kit` prints):

```sh
npm install react@^19.0.0 <path-to-the-library>/units/device-store <path-to-the-library>/units/principal-hub <path-to-the-library>/units/background-jobs <path-to-the-library>/units/prefetch-registry <path-to-the-library>/units/record-sync <path-to-the-library>/units/session-cache <path-to-the-library>/units/updated-line <path-to-the-library>/units/use-cached <path-to-the-library>/units/speed-kit
```

An app that renders also needs `npm install react-dom@^19.0.0`. To build and test it needs `vite`, `vitest`, `jsdom`, `@testing-library/react` and `fake-indexeddb`; `apps/speed-kit-taking-app/package.json` has the versions.

The eight units are peers of this package and `principal-hub` holds module state: install ONE copy of each. The package ships TypeScript source (`src/`); your bundler compiles it. `examples/consumer` is a fresh app that is exactly the example below; it was compiled with `tsc --noEmit` after that install (a copy of it in a scratch folder, since `node_modules` does not belong in the unit).

Dev mode. `vite` (not the build) pre-bundles the units with esbuild's own options, which compile JSX the classic way, so a screen that uses `updated-line` fails after sign-in with `React is not defined` (measured on the taking app, Vite 5.4.21, 2026-10-30). Add this to your app's `vite.config.ts`:

```ts
optimizeDeps: { esbuildOptions: { jsx: "automatic" } },
```

## The glue: `createSpeedKit<Ctx>(options)`

`createSpeedKit({ appName, jobs, persistResources?, cache?, openKv? })` makes the app's one kit:

- `appName` makes the names: the database `<appName>-cache`, the job records `<appName>.jobIntents`, and the hub names `<appName>.jobs`, `<appName>.jobIntents`, `<appName>.prefetch`, `<appName>.sessionCache`, `<appName>.deviceStore`.
- `jobs`: the options of `createBackgroundJobs` except `storageKey` and `cacheNames` (the kinds and every sentence the person reads are the app's).
- `persistResources`: the resources (last part of a cache key) whose values are plain data and are kept on the device. Default none. `persistResource(name)` adds one later.
- `cache`: the session cache. Default: the unit's own `sessionCache`. `openKv`: how the disk is opened (default IndexedDB; tests pass a fake).
- Returns `{ appName, cache, jobs, prefetch, start, hydrateWorkspace, end, persistResource, currentPersist }`; `jobs` is `createBackgroundJobs(...)` and `prefetch` is `createPrefetchRegistry<Ctx>(...)`, unchanged.
- `start(person, { workspace?, waitMs?, persist?, onHydrated? })`: sign-in or change of person. Tells the hub and the job store, waits for an earlier wipe, opens the disk (waiting at most `waitMs`, 400 by default, then it is "no cache"), drops other people's records, reads this person's vault list and `workspace`, puts the cache entries in the session cache (stale), hands what it read to `onHydrated`, and starts saving the `persistResources` the cache commits. Answers `{ disk, hydrated }`. Never rejects for a slow, missing or failing disk.
- `onHydrated(h)` gets the whole `Hydrated` of device-store, not only the rest. `h.entries` is `{ key, value, at }[]`: the cache entries, already put in the cache (a host reads them only to know which keys came from the device). `h.stores` is `{ key, snap }[]`: the per-type stores with the position they are current to (`snap.cursor`), for the host's client to seed. `h.vaults` is the vault list, or `undefined`. It is not called when the person changed in the meantime.
- `persist` is device-store's `PersistOptions`: `maxBytes` (the size bound), `now`, `flushMs` (how long a write waits, 400), `schedule` (how a flush is scheduled). It controls how the copy on the device is written. A test makes the disk save now with `await speed.currentPersist()?.flush()`.
- `hydrateWorkspace(ws)`: the same for a workspace the person switched to.
- `end()`: sign-out. Nobody is signed in, every registered cache is cleared, saving stops, and the copy on the device is wiped, whoever it belonged to (also when no copy was running: a page that loads signed out).
- `currentPersist()`: the running `Persist` (for `saveStore` and `saveVaults`), or null.

## Wiring example for a new GilbPlatform app

`examples/consumer/src/main.tsx`, copied here by script (a test checks that this block and the file are the same text). `Client` and `loadInbox` stand for the app's own code.

```tsx
// A new GilbPlatform app wired to the speed units. Nothing here is the app's real data layer: `Client` stands for your own vault client.
import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { cache, cached, createSpeedKit, hub, jobs as jobsUnit, prefetch as prefetchUnit, updated } from "@kaigilb/gilbplatformcode-speed-kit";
import type { StoreEvent } from "@kaigilb/gilbplatformcode-device-store";
import type { WarmContext } from "@kaigilb/gilbplatformcode-prefetch-registry";

// ---- your own pieces ----
interface Client {
  seeds: { vaults?: unknown; stores: Map<string, unknown> };
  onStore(fn: ((e: StoreEvent) => void) | undefined): void;
  onVaultsListed(fn: (list: never[]) => void): () => void;
  resetAll(): void;
}
declare const client: Client;
declare function loadInbox(ws: string): Promise<{ id: string; title: string }[]>;
interface Ctx extends WarmContext { vault: Client }

// ---- startup: one app name, one kit ----
export const speed = createSpeedKit<Ctx>({
  appName: "myapp",                     // the database is "myapp-cache", the job records "myapp.jobIntents"
  persistResources: ["inbox"],          // only plain-data resources are kept on the device
  jobs: {
    kinds: ["save"],
    failText: (_kind, message) => `Not saved: ${message}. Open the item.`,
    unfinishedText: (label) => `This action did not finish: ${label}. Open the item to check.`,
    cancelledText: "Cancelled: the item was edited again.",
    crashText: "Something went wrong, so nothing more was recorded. Look before you try again.",
  },
});
cache.sessionCache.installFocus(window);                 // once: a tab that regains focus revalidates
hub.registerCache("myapp.vaultClient", () => client.resetAll());   // your own in-memory stores go with the person

// ---- the persistBridge-style glue (Social's persistBridge.ts, in about 25 lines) ----
const WS_KEY = "myapp.persist.ws";
const lastWorkspace = (person: string): string => { try { return (JSON.parse(localStorage.getItem(WS_KEY) ?? "{}") as Record<string, string>)[person] ?? ""; } catch { return ""; } };
export async function signIn(person: string) {
  const got = await speed.start(person, {
    workspace: lastWorkspace(person),
    onHydrated: (h) => { client.seeds = { vaults: h.vaults, stores: new Map(h.stores.map((s) => [s.key, s.snap])) }; },
  });
  client.onStore((e) => speed.currentPersist()?.saveStore(e));
  client.onVaultsListed((list) => speed.currentPersist()?.saveVaults(list));
  return got;                           // { disk, hydrated }: the app paints from memory, then asks the vault behind the screen
}
export async function switchWorkspace(person: string, ws: string) {
  try { localStorage.setItem(WS_KEY, JSON.stringify({ [person]: ws })); } catch { /* storage blocked */ }
  await speed.hydrateWorkspace(ws);
}
export async function signOut() {
  client.onStore(undefined);
  try { localStorage.removeItem(WS_KEY); } catch { /* none */ }
  await speed.end();                    // memory cleared, jobs forgotten, the copy on the device wiped
}

// ---- usePrefetch: warm the next page on idle and on intent ----
speed.prefetch.registerWarm("inbox", ({ ws }) => cache.sessionCache.warm(cache.cacheKey(ws, "inbox"), () => loadInbox(ws)));
const warm = (e: { target: EventTarget | null }) => {
  const id = (e.target as HTMLElement | null)?.closest?.("[data-testid^='nav-']")?.getAttribute("data-testid")?.slice(4);
  if (id) speed.prefetch.prefetchPage(id);
};
const NAV = { onPointerOver: warm, onFocus: warm, onPointerDown: warm, onTouchStart: warm };
export function usePrefetch(vault: Client, ws: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ws) { speed.prefetch.setWarmContext(null); return; }
    speed.prefetch.setWarmContext({ vault, ws });
    return prefetchUnit.onIdle(speed.prefetch.prefetchAll);
  }, [vault, ws, enabled]);
  return NAV;
}

// ---- useJobs: the jobs, notices, toasts and "did not finish" lines of one workspace ----
interface JobsView { jobs: jobsUnit.Job[]; notices: jobsUnit.Notice[]; toasts: jobsUnit.Toast[]; unfinished: jobsUnit.Unfinished[] }
const EMPTY: JobsView = { jobs: [], notices: [], toasts: [], unfinished: [] };
const views = new Map<string, { version: number; view: JobsView }>();
hub.registerCache("myapp.useJobs", () => views.clear());
function viewOf(ws: string): JobsView {
  const v = speed.jobs.getVersion();
  const hit = views.get(ws);
  if (hit && hit.version === v) return hit.view;
  const view = { jobs: speed.jobs.jobsOf(ws), notices: speed.jobs.noticesOf(ws), toasts: speed.jobs.toastsOf(ws), unfinished: speed.jobs.unfinishedOf(ws) };
  views.set(ws, { version: v, view });
  return view;
}
export const useJobs = (ws: string | null): JobsView => useSyncExternalStore(speed.jobs.subscribe, () => (ws ? viewOf(ws) : EMPTY), () => EMPTY);

// ---- a page: paints from memory, revalidates behind, says so ----
function Inbox({ ws }: { ws: string }) {
  const { data, updating, updatedAt, refresh } = cached.useCached(cache.cacheKey(ws, "inbox"), () => loadInbox(ws));
  const { jobs, notices } = useJobs(ws);
  const nav = usePrefetch(client, ws, true);
  const save = (id: string) => speed.jobs.enqueue({
    key: speed.jobs.jobKey(ws, "save", id), kind: "save", draftId: id, workspace: ws, label: `Save ${id}`,
    run: async () => { await refresh(); return { ok: true, message: "Saved." }; },
  });
  return (
    <div>
      <nav {...nav}><button data-testid="nav-inbox">Inbox</button></nav>
      <updated.UpdatedLine updating={updating} updatedAt={updatedAt} />
      <button onClick={() => void refresh()}>Refresh</button>
      <ul>{(data ?? []).map((r) => <li key={r.id}><button onClick={() => save(r.id)}>{r.title}</button></li>)}</ul>
      {jobs.length > 0 && <p>{jobs.length} job(s)</p>}
      {notices.map((n) => <p key={n.key} role="alert">{n.text}</p>)}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Inbox ws="https://team.example.test/vault" /></StrictMode>);
```

## What stays in the app

- The vault client, the loaders, the shape of every cache key's value, and what is a `persistResources` resource.
- The warmers (which pages exist, what each loads), the bound on a warmer whose width follows data, and the nav buttons that carry `data-testid="nav-<page>"`.
- The job kinds, their `run` and `recheck` functions, every sentence a person reads, the `Idempotency-Key` on creates.
- The last-workspace memory (`WS_KEY` above) and the seeding of the vault client from `onHydrated`.
- `installFocus(window)` at start-up, the status region that shows the line, and the Refresh button.
- Tests of the app's own states (rule 10) and its before and after table (rule 1).

## What the host must supply

- One app name; the job options; `persistResources`; the calls to `start`, `hydrateWorkspace` and `end`.
- Any cache of the app's own that holds a person's content, registered with `hub.registerCache`.

## Module state

`createSpeedKit` holds the state of one kit (the running `Persist`, the pending wipe) and registers five clearers with the hub; call it once and share the result. A second kit needs a different `appName`. `principal-hub` and `session-cache` hold module state: install one copy of each.

Dynamic imports in the files taken: none.

## Do not

- Do not call `hub.setPrincipal` for a sign-in when you also use `start`: `start` does it, and then reads the person's copy. Calling `setPrincipal` alone closes and wipes the copy of another person, but nothing is read from the disk, and a screen that is still mounted is not safe (see "A bare `setPrincipal` and a screen still mounted").
- Do not put a value that is not plain data (a Map, a class) under a `persistResources` resource: `device-store` keeps plain data only.
- Do not answer a page from `onHydrated`'s stores as they stand: catch up with `since=` first.

## A bare `setPrincipal` and a screen still mounted

A screen that is still mounted when the person changes (a bare `hub.setPrincipal(other)`, with no `signOut`) makes its cache key again, and `cacheKey` now reads the new person. It still holds the old person's client and workspace. So it loads the old person's vault into the new person's cache key, and the old person's rows show under the new person. The taking app saw exactly this in its test T9.

The remedy is a hub clearer that takes the screens back to sign-in. From `apps/speed-kit-taking-app/src/App.tsx`:

```ts
useEffect(() => {
  hub.registerCache("speedkittaking.app", () => setPerson(null));
  return () => hub.registerCache("speedkittaking.app", () => undefined);
}, []);
```

With it, the screens unmount in the same change and no load starts for the new person (T9 checks that no records request is sent).

## Testing your app

- On Node 25 (seen on 25.9.0) jsdom's `localStorage` is not usable (`localStorage.clear is not a function`). Stub `localStorage` and `sessionStorage` with an in-memory `Storage` in your test set-up.
- A reload in a test is `vi.resetModules()` plus a fresh dynamic `import()` of your app. The hub, the cache, the job store and the kit start empty, as on a new page; the fake IndexedDB stays, as the device does.
- `apps/speed-kit-taking-app/test/helpers.tsx` (`boot()` and `reload()`) is a worked example.

## Wrong readings

- "`end()` only clears memory." It also wipes the device copy, and a start right after an `end()` waits for that wipe.
- "`start` for the same person again wipes the copy." It does not: it closes the earlier run (which writes no more) and reads again.
- "A cache from `createSessionCache` is emptied by the hub." Only the unit's own `sessionCache` registers itself; `createSpeedKit` registers whichever cache it is given.
- "A hover always warms." A warmer is not started again for the same workspace and client within `staleMs` (30 s by default) of its last start, even when the cache entry is gone (`runWarmer` in `prefetch.ts` of `prefetch-registry`). A hover soon after the idle warm of sign-in sends nothing.
- "A preview is stored on the device." It is not. A preview made with `ctx?.preview(rows)` is in the cache entry only: it is not fresh, has no `updatedAt`, and never reaches `onCommit`, which is the only door to the device (`speedKit.ts` is unchanged). Only the committed value of the load is stored, so a reload never paints a half list as if it were whole.
- "`cached.useCached(...).partial` is true while an update runs." It is not: `partial` is true only while `data` is a preview of a first load. A value held from memory or the device shows with `partial` false while it updates (`updating` is true).
- "A preview means the list is complete." It means at least what it holds: `cache.peek(key).partial` is true while `data` is a preview. The words "at least N" and why are the app's. After a change of person the preview is gone with the entry, and a preview that arrives late is dropped.
- "A copy that the disk answers after `waitMs` is lost." In 0.1.0 it was (finding F4); from 0.2.0 it is not: `start` stops waiting at `waitMs`, but the read goes on, and when it ends the copy is handed to the cache (only for the same person). A key whose first load is already running and holds no value takes it and shows it while the load runs (`session-cache` `hydrate`); the load's answer then replaces it.
- "A network answer that lands while the disk is being read is not saved." It is: the cache's `onCommit` listener is installed as soon as the device copy is open, before `adopt` and `hydrate`, with the same person and `persistResources` checks. (An answer that lands before the disk is even opened is not saved.)
- "`start` is slow on a slow disk." It waits at most `waitMs` and answers `{ hydrated: false }`; a disk that answers later is still read, and handed over only if the same person is still signed in.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`. No line of it is copied: `createSpeedKit` is new code that does what `src/lib/persistBridge.ts` does for the units (the order in `startPersistence`: tell the hub, then close the earlier copy, open the disk with a bounded wait, `adopt`, `hydrate`, hand over only if the person is the same, then listen to the cache's commits and save only this person's persistable keys; `stopPersistence` and the wipe at sign-out). The example's `usePrefetch` and `useJobs` follow `src/lib/usePrefetch.ts` and `src/lib/useJobs.ts` of the same commit, shortened.

Named changes from Social's bridge, and only these: the persistable set is the option `persistResources` (Social's `PERSISTABLE` set), the database name and storage keys come from `appName`, the last-workspace memory and the vault client's seeding stay in the app (the example shows them), the read memo (`readMemo`) and the device keys (`deviceBinding`) are not here, and the hub registers the device copy so a bare `setPrincipal` also closes and wipes it.

Tests (`src/*.test.ts`, jsdom, `fake-indexeddb` 6.2.6): `firstPage.test.ts` (a preview through the kit: never on the device, gone with a change of person), `twoPeople.test.ts` (Ann and Ben across the hub, the session cache, the job store, the warm context and the device store: a change of person, a sign-out, a reload between, a late answer), `speedKit.test.ts` (the glue), `exports.test.ts` (every export of the entry and of each namespace), `readme.test.ts` (the example in this file is the file), `hostAgnostic.test.ts` (the same host-agnostic check as the other units). The fixture is `test/testKit.ts`.

Changes in 0.2.0: the first page early. The peer ranges move to `record-sync` ^0.4.1 (`completeCopy` takes `onPage`), `session-cache` ^0.2.0 (a loader is handed `LoadContext`; `cache.peek(key).partial`) and `use-cached` ^0.2.0 (the hook hands the loader the same context). `speedKit.ts` changes in one place: `start` installs the `onCommit` listener right after the device copy is open, before `adopt` and `hydrate`, not after them. The same person and `persistResources` checks apply. `src/firstPage.test.ts` (5 tests, 58 in the unit) pins that a preview is never put on the device, that the committed load stores the complete value, that a preview does not outlive a change of person, that an answer landing during a slow disk read is saved after it, and that a copy read late is shown while the first load runs. The `Cached.partial` member of `use-cached` 0.2.0 is `cached.useCached(...).partial`.

Taken by: `apps/speed-kit-taking-app` takes this package. It was built from this README alone on 2026-10-30, and its `RUNLOG.md` lists what the README lacked.
