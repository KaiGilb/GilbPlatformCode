# save-queue

An on-device queue of unsent writes, kept separate for each signed-in person, that resumes after a failure, backs off when the vault is busy, and never sends a finished upload step twice.

## What this is

An on-device queue of unsent writes, kept separate for each signed-in person, that resumes after a failure, backs off when the vault is busy, and never sends a finished upload step twice.

Every add, edit and delete is written to the queue first and removed once the vault has it. The unit holds the queue's storage (IndexedDB, or memory where there is none) and the pure rules around it: how a failure is told apart, what an op looks like after one, how long to wait, and whose ops are whose. It sends nothing itself: the host's `send` does that, and the host's loop and timers call these functions.

- `PendingOp<T = unknown>`: one queued write. `id`, `kind` (`create` / `update` / `delete`), `recordId?`, `etag?`, `record?: T` (the record as it was when an edit or delete began), `change: Record<string, unknown>`, `pictureBlob?`, `thumbBlob?`, `fullBlob?` (a full-size copy waiting to be sent), the upload steps done so far (`masterEntity?`, `thumbEntity?`, `thumbLinked?`, and for a full copy `fullEntity?`, `fullLinked?`, `masterLinked?`, `thumbRelinked?`), `createdAt` (ISO), `tries`, `principal` (who was signed in when it was written), and the failure counters `busyFails?`, `busySentence?`, `otherFails?`, `stuckSentence?`.
- `QueueStore`, `memoryStore()`, `idbStore()`, `queueStore()`, `setQueueStore(store | null)`: the storage. `queueStore()` is IndexedDB when the browser has it, else memory. Tests (and nothing else) call `setQueueStore`.
- `setQueueDbName(name)`: the IndexedDB database name. Call it once at start-up, before the first queue call. The object store is `pending`, version 1, key `id`.
- `listOps()`: every op, every person's, oldest first. A store that fails to read answers `[]`. `saveOp(op)` and `dropOp(id)`: write and remove; a store failure is logged and they do not throw. Each store call gives up after 1500 ms.
- `newOpId()`: a fresh id (`crypto.randomUUID`, else a time-and-random fallback).
- `classifyWith(error, tests)`: `"drop"` (refused for good), `"busy"` (the vault said 502/503/504), `"network"`, or `"other"`. The order is fixed: `tests.refusedForGood`, then `tests.busy`, then a `TypeError` or `tests.notSignedIn`, then `navigator.onLine === false`, then an error message that says failed to fetch, fetch failed, network, offline or load failed (any case), else `"other"`.
- `afterFailure(op, kind, sentence)`: the op as it is stored after a failed send that was not dropped. It counts `tries`, counts `otherFails` for `"other"` and `busyFails` for `"busy"`, keeps the busy sentence, and sets `stuckSentence` when `otherFails` reaches `MAX_OTHER_FAILS` (5) or `busyFails` reaches `MAX_BUSY_FAILS` (8).
- `busyDelayMs(busyFails)`: 2 s, 5 s, 15 s, then 30 s however many busy answers (`RETRY_DELAYS_MS`).
- `resetForRetry(op)`: "Try again" on a stuck op: removes `stuckSentence`, zeroes both counts.
- `stopsFlush(result)`: true for `"network"` and `"busy"`: the rest of the queue would fail the same way.
- `opsFor(ops, principal)`, `listOpsFor(principal)`: only that person's ops; `null` (nobody signed in) gives none. `listOpsFor` is `opsFor(await listOps(), principal)`.
- `stampOp(input, principal)`: puts the person on an op about to be queued; `null` or `""` gives `null` and nothing is to be queued.
- `opStatus(op, sending)`: `"stuck"` when the op has a `stuckSentence`, else `"saving"` when it is being sent now, else `"failed"` (waiting for the next try).
- `progressOf(op)`: `{ progress, onProgress }` for the host's `send`. `progress` holds the upload steps already done: any of `masterEntity`, `thumbEntity`, `thumbLinked`, `fullEntity`, `fullLinked`, `masterLinked`, `thumbRelinked` that is set on the op (a flag only when true); an op with only the first three gives exactly the 0.1.0 object. `onProgress` accepts the same seven; `onProgress(step)` writes a finished step onto the SAME op object and into the queue. The host's `send` skips a step whose entity is present in `progress`: that is how a finished upload step is never sent twice.

One queue per person: one store, one table, every person's ops in it, each op carrying its `principal`. Nothing is deleted at sign-out. The cut is made when the app reads: through `listOpsFor(principal)`.

Module state: the database name (`setQueueDbName`), the store in use (`queueStore` / `setQueueStore`) and, inside `idbStore()`, the opened database. An app must have ONE copy of the unit.

## What this is not

- Not a sender. `sendOp` (what a create, update or delete means for your records, and any look for an earlier success) is the host's.
- Not the signed-in person. `currentPrincipal` is the host's; wire it from `tokenManager.getSession()` of `@kaigilb/gilbplatformcode-lws-session-bridge` (its `principal`, `null` on any failure or when it is empty).
- Not the loop. `flush`, the timers (the busy retry timer, the poll), the React state, the in-flight set, and the banners and cards are the host's. `stopsFlush`, `busyDelayMs` and `opStatus` give them their decisions.
- Not a way to move work between devices: the queue is on this device only.

## How to take it

Package: `@kaigilb/gilbplatformcode-save-queue`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/save-queue
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import { afterFailure, busyDelayMs, classifyWith, dropOp, listOpsFor, newOpId, saveOp, setQueueDbName, stampOp, stopsFlush, resetForRetry, type FailureTests } from "@kaigilb/gilbplatformcode-save-queue";

setQueueDbName("my-app-queue"); // once, at start-up

// The host's own tests, one per class of error it throws:
const tests: FailureTests = {
  refusedForGood: (e) => e instanceof NoAccessError || e instanceof ChangedElsewhereError,
  busy: (e) => e instanceof VaultBusyError,
  notSignedIn: (e) => e instanceof NotSignedInError,
};

// Queue a write for the signed-in person (nothing is queued when nobody is signed in).
const op = stampOp({ id: newOpId(), kind: "create", change: { title: "Fern" }, createdAt: new Date().toISOString(), tries: 0 }, principal);
if (op) await saveOp(op);

// Read only this person's ops, and send each one.
for (const queued of await listOpsFor(principal)) {
  try {
    await send(queued); // the host's: it uses progressOf(queued) and skips finished upload steps
    await dropOp(queued.id);
  } catch (e) {
    const kind = classifyWith(e, tests);
    if (kind === "drop") await dropOp(queued.id);
    else {
      const next = afterFailure(queued, kind, "Could not save. Please try again.");
      await saveOp(next);
      if (kind === "busy" && !next.stuckSentence) setTimeout(() => void again(queued.id), busyDelayMs(next.busyFails ?? 1));
      if (stopsFlush(kind)) break;
    }
  }
}
```

## What the host must supply

| Member | Replaces (source app TestFlowerPower, `e39e1732551d9d5e6abf681546b97a3a30311e30`) |
|---|---|
| `FailureTests.refusedForGood(e)` | `e instanceof NoAccessError \|\| e instanceof PlantChangedElsewhereError`, `src/data/outbox.ts:14` |
| `FailureTests.busy(e)` | `e instanceof VaultBusyError`, `src/data/outbox.ts:15` (it answers true for a 502, 503 or 504 only if your code throws a busy error for it) |
| `FailureTests.notSignedIn(e)` | `e instanceof NotSignedInError`, `src/data/outbox.ts:16` |
| `setQueueDbName(name)` | the constant `DB_NAME = "tfp"`, `src/data/queue.ts:61` (the source app passes `tfp`) |
| the `principal` argument of `listOpsFor` and `stampOp` | `currentPrincipal()`, `src/data/principal.ts:6-14`, used at `src/screens/GardenScreen.tsx:90` and `:283` |

Also: a browser with IndexedDB, or nothing (memory, lost with the page); your own `send`, loop, timers and cards; a call to `setQueueDbName` before the first queue call. An app that already has queued rows must pass the name those rows are under, or the rows are stranded.

## Do not

- Do not send an op you read with `listOps()`: it holds every person's ops. Read through `listOpsFor(principal)`, so one person's session never sends another's work.
- Do not copy an op before your `send` and give `send` the copy: `onProgress` writes the finished step onto the op it was given, and the next failure copies from that op. Give `send` the same object you hold.
- Do not rename `PendingOp`'s fields or the database once devices hold rows: they would be stranded.
- Do not call `setQueueStore` in product code.
- Do not install a second copy of this unit in the same app.

## Wrong readings

- "A failed send is retried a few times." Only `"other"` (5) and `"busy"` (8) are counted. A `"network"` failure, including any `TypeError` and "not signed in", is retried with no cap, and `afterFailure` never marks it stuck.
- "`busySentence` and `etag` are used." They are stored and nothing in the unit reads them.
- "`resetForRetry` starts over." It zeroes `otherFails` and `busyFails` and removes `stuckSentence`; `tries` and `busySentence` stay.
- "After 1500 ms the store call is cancelled." `patiently` gives up waiting but leaves the IndexedDB request running; a slow write can still land after the app went on unqueued.
- "`listOps` is my queue." It returns every person's ops. Read through `listOpsFor`.
- "A 503 on a record write is busy." In the source app it was classed `"other"`, because only the picture upload threw its busy error. Which errors are busy is decided by the host's `busy` test.
- "Once the browser is offline, errors are told apart." Once `navigator.onLine` is false, every error is `"network"`, even a refusal that the host's tests do not call refused-for-good.
- "A failed IndexedDB open is retried." It stays failed for the life of the page: reads answer `[]` and writes are logged.
- "An unset database name is a setup error that stops the app." `queueDbName()` throws, and `listOps`, `saveOp` and `dropOp` catch it like any store failure: the queue reads as empty and writes are logged.

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named changes.

- `src/data/queue.ts` lines 1-149 (the whole file) to `src/queue.ts`.
- `src/data/outbox.ts` lines 10-11 (`Failure`), 13-20 (`classify`), 22-29 (`progressOf`) to `src/policy.ts`.
- `src/screens/GardenScreen.tsx` lines 221-222 and 224-232 (`afterFailure`), 238 (`busyDelayMs`), 271-272 (`resetForRetry`), 260 (`stopsFlush`), 92 (`opsFor`), 284-289 (`stampOp`), 155 (`opStatus`) to `src/policy.ts`.

Named changes in `src/queue.ts`, and only these:

- N1. Line 3 (`import type { Plant } from "./plants";`) is deleted.
- N2. `PendingOp` becomes `PendingOp<T = unknown>`.
- N3. `plantId?: string` is `recordId?: string`; `plant?: Plant` is `record?: T`; the doc comment says "The record as it was when the edit or delete began".
- N4. `change: { name?: string; count?: number | null }` is `change: Record<string, unknown>`.
- N5. Every other `PendingOp` in the file stays the non-generic `PendingOp`.
- N6. `const DB_NAME = "tfp";` is a setting: `setQueueDbName(name)`, with `queueDbName()` throwing a message that names `setQueueDbName` when it was not called.
- N7. `indexedDB.open(DB_NAME, 1)` is `indexedDB.open(queueDbName(), 1)`.
- The header comment says "database name set at start-up" for "DB `tfp`". `MAX_OTHER_FAILS`, `MAX_BUSY_FAILS`, `RETRY_DELAYS_MS`, `STORE_PATIENCE_MS`, `memoryStore`, `idbStore`, `queueStore`, `setQueueStore`, `newOpId`, `patiently`, `listOps`, `saveOp`, `dropOp` and their console texts are as in the source.

Named changes in `src/policy.ts` (new file, the pure pieces lifted):

- P1. `Failure` as in the source.
- P2. `classify` is `classifyWith(e, tests)`: lines 14, 15 and 16 call `tests.refusedForGood`, `tests.busy` and `tests.notSignedIn`; lines 17-19 as in the source.
- P3. `progressOf` as in the source, exported.
- P4. `afterFailure`: the pure part of `runOp`'s catch; `sentence(err)` is the `sentence` argument; `const next: PendingOp = {` is `return {`. The `console.warn` on line 223 stays in the app.
- P5. `busyDelayMs` is the expression of line 238.
- P6. `resetForRetry` is lines 271-272 of `tryAgain`; `tries` and `busySentence` are not reset.
- P7. `stopsFlush` is the condition of line 260.
- P8. `opsFor` is the filter of line 92; `listOpsFor` is new.
- P9. `stampOp` is lines 284-289 without the banner: `null` when there is no person.
- P10. `opStatus` is line 155's expression with `busy.has(op.id)` replaced by `sending`.

`src/index.ts` is new. Not lifted: `sendOp`, `currentPrincipal`, the timers, `flush`'s loop, React state, banners.

Changes in 0.2.0, and only these:

- `src/queue.ts`: `PendingOp` gains the optional `fullBlob?: Blob`, `fullEntity?: string`, `fullLinked?: boolean`, `masterLinked?: boolean`, `thumbRelinked?: boolean`.
- `src/policy.ts`: `progressOf(op).progress` also carries `fullEntity`, `fullLinked`, `masterLinked` and `thumbRelinked` when set, in the same spread form as the first three; `onProgress` accepts all seven steps. The type `UploadSteps` is exported. The `fullBlob` is not a step and is never in `progress`.
- `package.json`: version 0.2.0. `unit.json` lists the change.

The default behaviour is unchanged: an op that holds only the 0.1.0 fields gives the 0.1.0 progress object, byte for byte (a test compares it with a literal copy of the 0.1.0 function).

## Tests

`src/queue.test.ts` and `src/policy.test.ts` hold the tests below; the port is from TestFlowerPower `test/batch5.test.ts:152` ("the queue stores, lists oldest first, and drops", ids changed, a plain `Blob` for the picture) and `:162` ("classifies failures": the `TypeError` and "other" asserts as they are, the two refusals re-expressed with `classifyWith` and a fake `FailureTests`). New: the bounds; `busyDelayMs` for 1 to 6; `afterFailure` (other x5, busy x8, network x20); `resetForRetry`; the order of `classifyWith`; `opsFor` and `listOpsFor` with Ann and Ben; `stampOp`; `opStatus`; `stopsFlush`; `progressOf` (same object, and the second `progressOf` carries the step); a store that never answers (1500 ms) for `listOps`, `saveOp` and `dropOp`; a `PendingOp<{ title: string }>` through `memoryStore`; the `idbStore` round trip with `fake-indexeddb` (a dev dependency; only in `src/queue.idb.test.ts`) and the unset-name error. `src/progress.test.ts` (0.2.0) pins the 0.1.0 progress object byte for byte and round-trips the new steps through `progressOf` and `onProgress` into the store. `src/exports.test.ts` pins the export list. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory.
