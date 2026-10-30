# background-jobs

## What this is

A store of background jobs that outlive the page that started them: one flight per key, one lane per workspace, never retried, failures kept as notices, and an unfinished-action record that survives a reload and is never run again.

Plain TypeScript, no React, no network of its own. A slow action (a write the person waits for) becomes a job: the page enqueues it and returns at once. The host gives each job a `run` function; the store runs it, keeps the outcome, and tells subscribers. It depends on the `principal-hub` unit: intent records are stamped with the person, and a change of person forgets what this tab showed of the previous person's jobs.

`createBackgroundJobs(options)` makes a store. Options:

- Required: `storageKey` (where the intent records are kept), `kinds` (every kind the host enqueues; the intent reader accepts only these), `failText(kind, message)` (the notice text of a failed job), `unfinishedText(label, kind?)` (the "did not finish" line), `cancelledText` (the message of a job cancelled before it ran), `crashText` (the message of a job whose `run` or `recheck` threw).
- Optional: `quietSuccessKinds` (kinds whose success leaves no toast because the page says its own outcome; default none), `keepFinished` (finished jobs kept in memory; 40), `storage` (a getter of the `Storage` that holds the records; default `sessionStorage`, or none when the browser has none), `cacheNames` (`{ views, intents }`: the names it registers under with the hub; defaults `"backgroundJobs"` and `"backgroundJobIntents"`).

A store has these members:

- `enqueue(args)`: queues a job `{ key, kind, draftId, workspace, label, run, snapshot?, recheck?, free?, refs? }` and returns it. A job with the same key that is still queued or running is returned instead and nothing new runs. The subject's older notice, toast and "did not finish" line are cleared. Jobs of one workspace run one after another (FIFO); other workspaces run at the same time. `free: true` jobs are not in the lane (they wait on the world, not on the vault) and take the lane for their writes through `signal.exclusive(fn)`. `recheck()` is a fresh read when the job starts: a string back means the job refuses, writes nothing and leaves a notice, and the person reads `failText(kind, <the string recheck returned>)` (`backgroundJobs.ts:157-158`, `:168`). `cancelledText` is not for that: it is the message of a job cancelled before it ran (by `cancelJobs`), and such a job is quiet, with no notice (`:158`, `:168`). `run(signal)` is called at most once per job, never retried; it answers `{ ok, message, quiet?, data? }`. `snapshot` is kept in the intent record.
- `jobKey(vault, kind, draftId)`: `vault|kind|draftId`, the key the source app used.
- `cancelJobs(workspace, draftId, kinds)`: marks the queued or running jobs of those kinds for that subject cancelled (their `signal.cancelled` turns true and a job not yet started ends quietly with `cancelledText`); returns how many. `kinds` is required.
- `subscribe(fn)`, `getVersion()`: for a React `useSyncExternalStore` or any listener. `onFinished(fn)`: told once for every job that ends, done or failed.
- `isPending(key)`, `anyActive()`, `jobsIdle()` (resolves when nothing is queued or running), `jobsOf(workspace)`, `activeJobOf(workspace, draftId)`.
- `noticesOf(workspace)` (failures, kept until dismissed), `toastsOf(workspace)` (short successes), `unfinishedOf(workspace)` (what a reload cut off).
- `dismiss(workspace, key)`, `clearDraft(workspace, draftId)`.
- `setJobPrincipal(principal)`: the signed-in person. The first call keeps the same person's records from an earlier load and drops everyone else's; a later change clears all records, notices and toasts. Intent records are stamped with the person.
- `forgetPersonViews()`: forgets the job rows, notices, toasts and lines; a running job ends silently (its notice never reaches the next person) but its write finishes. The store registers this with the hub, so a change of person calls it.
- `__resetForTests({ reload? })`: forgets everything in memory; `reload: true` keeps the storage and reads it back as a page reload does.
- Types: `JobKind` (`string`), `JobState`, `JobResult`, `JobSignal`, `Job`, `Notice`, `Toast`, `Unfinished`, `EnqueueArgs`, `BackgroundJobsOptions`, `BackgroundJobs`.

While anything is queued or running the browser asks before the tab is closed (a `beforeunload` handler, added and removed as jobs start and end).

## What this is not

- Not a React hook: the source app's `useJobs` stays in the source app (see "What stayed in the source app").
- Not a retry system: a failed job is never run again, and neither is an intent a reload cut off.
- Not a way to write anything itself: the host's `run` does the writing.

## How to take it

Package: `@kaigilb/gilbplatformcode-background-jobs`

It depends on `principal-hub` by `file:` path. The unit's own `.npmrc` sets `install-links=true`, so inside the library the sibling is installed as a copy. That file does not govern your app's install. First put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install the units in order (the line `node scripts/peers.mjs background-jobs` prints):

```sh
npm install <path-to-the-library>/units/principal-hub <path-to-the-library>/units/background-jobs
```

The package ships TypeScript source (`src/`); your bundler compiles it. No third-party runtime dependency.

## Examples

```ts
import { createBackgroundJobs } from "@kaigilb/gilbplatformcode-background-jobs";

export const jobs = createBackgroundJobs({
  storageKey: "myapp.jobIntents",
  kinds: ["save", "send"],
  failText: (kind, message) => `${kind === "save" ? "Not saved" : "Not sent"}: ${message.replace(/\.+\s*$/, "")}. Open the item.`,
  unfinishedText: (label) => `This action did not finish: ${label}. Open the item to check.`,
  cancelledText: "Cancelled: the item was edited again.",
  crashText: "Something went wrong, so nothing more was recorded. Open the item and look before you try again.",
});

jobs.setJobPrincipal(person); // once, at sign-in
const job = jobs.enqueue({
  key: jobs.jobKey(workspace, "save", item.id), kind: "save", draftId: item.id, workspace, label: `Save: ${item.title}`,
  recheck: async () => ((await readNow(item.id)).hash === shownHash ? null : "It changed. Look again."),
  run: async () => ({ ok: true, message: "Saved." }),
});
```

## What the host must supply

- The options above. Every sentence the person reads is the host's, so is the storage key and the list of kinds.
- A `run` for each job (and a `recheck` where the page shows a snapshot).
- `setJobPrincipal` at sign-in, and `setPrincipal` on the hub (see its README).
- One store per app: call `createBackgroundJobs` once and share the result.

## Module state

The state belongs to the store that `createBackgroundJobs` returns, not to the module; importing the package runs nothing. Each call registers two clearers with the hub under `cacheNames`; a second store with the same names would replace the first one's clearers, so give a second store its own `cacheNames`. A second copy of `principal-hub` would split who is signed in: install one.

Dynamic imports in the files taken: none.

## Do not

- Do not call `run` yourself again after a failure: "never retried" is the point; a person presses the button again.
- Do not reword or loosen `setJobPrincipal`'s first-call rule: it is what keeps one person's pending actions from showing to another in the same tab.
- Do not put a personal value in the `label`: it is written to the storage in the intent record.

## Wrong readings

- "A job is retried after a reload." It is not; the reload shows "did not finish" (via `unfinishedText`) and never runs it.
- "`enqueue` of the same key twice runs twice." While the first is queued or running it returns the first and runs nothing.
- "`free: true` means no ordering." It skips the lane for waiting, and takes the lane for each part passed to `signal.exclusive`. `exclusive` inside `exclusive` waits on itself; do not nest.
- "A quiet failure leaves nothing." The job row is `failed`; only the notice is skipped.
- "`draftId` is the subject of a draft only." It is the name the source app used for the subject of a job; it is kept so records already in the storage still read. A host may put any id there.

## Where it came from

`KaiGilb/Social` (private repo), commit `a1f65a5b2567d5dbdfa91fa8e64e7b2af84fa66e`: `src/lib/backgroundJobs.ts` lines 1-237 to `src/backgroundJobs.ts`. The module body was wrapped by hand in a factory (not copied by script).

Named changes, and only these:

1. the module-level store becomes `createBackgroundJobs(options)`, which returns the same functions over the same state; nothing runs at import;
2. the hub import reads from `@kaigilb/gilbplatformcode-principal-hub`;
3. `JobKind` was a union of six names and is now `string`; the kinds the intent reader accepts are the required option `kinds`;
4. the storage key is the required option `storageKey`;
5. `failText` and `unfinishedText` (their sentences and special cases) are required options; the function `failText` is no longer exported;
6. the sentences of a cancelled job and of a crashed job are the required options `cancelledText` and `crashText`;
7. the kind whose success leaves no toast is the option `quietSuccessKinds` (default none);
8. `cancelJobs`'s `kinds` had a default of two names and is now required;
9. new options with the source's values as defaults: `keepFinished` (40), `storage`, `cacheNames`;
10. the placeholder that `exclusive` makes for a lane part has kind "" (it is never listed);
11. the header comment loses its cycle tags and the source app's words.

`src/index.ts` and `src/testHost.ts` are new. `testHost.ts` is a fixture for the tests (the source app's wording, so the ported tests keep their expectations); it is not part of the API.

Tests (`src/*.test.ts`; jsdom): `backgroundJobs.test.ts` is ported (same inputs and expectations) from the source app's `src/lib/p153-background-jobs.test.ts` (16 of its 17 tests; one of the 16 is the source's `failText` test, run against the fixture's copy of that wording), `src/rc13-fixes.test.tsx` (the store part of M1, and M2, L2: 3 tests) and `src/p153-s8-when-checked.test.tsx` (the lane and cancel behaviour, rewritten as 2 store-only tests because the original runs the source app's page chain). Changes to the ports: the store is made by `createBackgroundJobs(hostOptions())`; the storage key reads `test.jobIntents`; one message reads "The app could not write..." in place of the source app's name. `backgroundJobsPins.test.ts` is new: it pins every member and option, the hub registration and the late-answer silence after a change of person. `hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, and why: from `p153-background-jobs.test.ts`, the one test of `recheckOf`, `snapshotOf` and `queueResult` (functions of the source app's `draftJobs.ts`, not in this unit). Whole-page tests that name `backgroundJobs` stay in the source app: `p153-background-jobs.test.tsx` (Drafts and Schedule pages), `p153-s4-chains`, `p153-s8-when-checked` (the page chain), `p154-principal-hub`, `p154-late`, `p154-b5`, `p154-b6` (they check the hub's registered names and the source app's pages), and the rest of the roughly 13 files that run the source app's pages.

## What stayed in the source app

- `src/lib/useJobs.ts`: the React hook over this store (`useSyncExternalStore` plus a per-workspace view that sorts picture jobs from the rest). It needs React and names the source app's `picture` kind; it is built on `subscribe`, `getVersion`, `jobsOf`, `noticesOf`, `toastsOf`, `unfinishedOf`.
- `src/lib/draftJobs.ts` and `src/lib/pictureJobs.ts`: the callers that build the jobs.
- The app's wording (`failText`, `unfinishedText`, the cancelled and crashed sentences), its storage key and its kind list: these are the options.
