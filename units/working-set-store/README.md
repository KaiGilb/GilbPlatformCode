# working-set-store

The browser-local index of which records and files this device has touched in each vault, so a list can draw its rows before the vault answers.

## What this is

The browser-local index of which records and files this device has touched in each vault, so a list can draw its rows before the vault answers.

A transient, non-authoritative copy kept on this device: for each record it holds only the id, the vault, the type address and the time of the last touch; for each file only the id, the record it hangs off (if any), the vault, the name, the media type, the size and the time. It holds no record data and no file bytes; the vault stays the one source of truth, and the index can be rebuilt from it. It lives in IndexedDB when the browser has it, and in plain memory otherwise. Every operation degrades silently: a miss means an empty list, never an error. Async functions, no React, no network.

- `rememberRecord(ref)`, `forgetRecord(id)`: add or refresh (the id is the key), or drop, one record ref `{ id, vaultId, typeUri, updatedAt }`.
- `listRecordRefs(vaultId)`: the refs of one vault, most recently touched first.
- `rememberFile(ref)`, `forgetFile(id)`: add or refresh, or drop, one file ref `{ id, recordId?, vaultId, name, mediaType, byteSize, updatedAt }`. A file with a `recordId` is attached to that record; one without is a standalone ("registered") file.
- `listFileRefs(recordId)`: the files attached to a record, most recent first.
- `listStandaloneFiles(vaultId)`: the standalone files of a vault, most recent first.
- `purgeWorkingSet()`: clear both stores (call it on sign-out).

The unit holds module state (`memory`, `fileMemory` and the open database `dbPromise`). An app must have ONE copy of it: two installed copies would each keep their own memory and open the same database separately, and the lists would disagree.

## What this is not

- Not a cache of record data. It cannot show a record's content; it only remembers that the record was touched.
- Not a list of what the vault holds. It lists what this device has touched.
- Not per app. The database name is fixed (`baseapp-workingset`, version 3, stores `records` and `files`), so two apps served from the same browser origin share one store.

## How to take it

Package: `@kaigilb/gilbplatformcode-working-set-store`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/working-set-store
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. A unit that uses the working set lists this one under `peerDependencies`, never under `dependencies`.

## Examples

```ts
import { listRecordRefs, purgeWorkingSet, rememberRecord } from "@kaigilb/gilbplatformcode-working-set-store";

await rememberRecord({ id: "r1", vaultId: "https://vault.example.test/base", typeUri: "https://ontology.example.test/base/t/Note", updatedAt: Date.now() });

// Where IndexedDB is absent (a test, a private window) this lists the ref; see "Wrong readings" for where it is present.
await listRecordRefs("https://vault.example.test/base");

// On sign-out:
await purgeWorkingSet();
```

## What the host must supply

- A browser with IndexedDB, or nothing: without it the unit keeps the index in memory for the page's life.
- Nothing to set. There is no setting: the database name and version are as in the app this came from.
- A call to `purgeWorkingSet()` at sign-out, so the index does not stay on the device.

## Do not

- Do not install a second copy of this unit in the same app: each copy keeps its own memory.
- Do not treat a list as complete. It is what this device touched; draw it as a placeholder and read the vault for the truth.
- Do not store anything else in the `baseapp-workingset` database, and do not change its version: the unit opens version 3 and a higher version cannot be opened by it (it then keeps the index in memory).
- Do not rely on `listRecordRefs` or `listStandaloneFiles` where IndexedDB is present (see "Wrong readings").

## Wrong readings

- "`listRecordRefs` lists what was remembered." With IndexedDB present it lists nothing: the store indexes the field `podId`, a ref carries `vaultId`, so no row is in the index and the read answers `[]`. The list works only on the in-memory path (no IndexedDB). The app this came from has the same code; it is kept as it is and pinned by a test. `listStandaloneFiles` has the same fault (its index is `podId` too); `listFileRefs` reads the `recordId` index and works on both paths.
- "A list read on IndexedDB also reads the memory." It does not: with IndexedDB the read answers from the database only; the memory copy is used only when IndexedDB is absent or could not be opened.
- "The index is per app." It is per browser origin: the database name is fixed, so two apps on one origin share it.
- "A newer database can be read." It cannot: the unit opens version 3; if the browser holds a higher version the open fails and the unit keeps the index in memory.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: `src/lib/base/workingSet.ts`, lines 1-255 (the whole file; it imports nothing), copied verbatim to `src/workingSet.ts`. Named changes: three comment edits, nothing else. Line 1 loses a ticket tag, line 5 loses a roadmap tag and line 43 loses a ticket tag ("VDS-2 Slice 2A", "Slice 2B / a Base route relaxation" and "VDS-2's own", with the technical meaning kept). No code line is changed, so the store name, the version, the stores and the indexes are as in the app.

`src/index.ts` is new: it re-exports `./workingSet`. The tests: `src/workingSet.test.ts` is `src/lib/base/workingSet.test.ts` (10 tests, all ported) with the sample type address changed to an `example.test` host and one ticket tag dropped from a comment. `src/workingSet.extra.test.ts`, `src/workingSet.indexeddb.test.ts` and `src/workingSet.upgrade.test.ts` are new: they pin `listStandaloneFiles`, the IndexedDB path and the upgrade from older versions, using `fake-indexeddb` (a dev dependency the app does not have; its tests run without IndexedDB). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
