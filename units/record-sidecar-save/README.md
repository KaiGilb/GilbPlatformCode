# record-sidecar-save

Saves one record's changes one at a time against its served version.

## What this is

Saves one record's changes one at a time against its served version.

Several sections of one person card (Email, Phone, Social) write the same sidecar of the same record. This unit makes those writes safe to fire from different sections at once.

For each record id it holds, once, in this module: the queue of saves, the latest version (ETag) and the stored sidecar. Three functions:

- `noteServedVersion(recordId, etag, meta)`: the card has read the record; this is its version and its stored sidecar. It is taken only if no save of that record is queued or in flight, and only if it is news: its ETag differs from the last one noted, or its sidecar does (compared as JSON; a missing sidecar and `null` are the same). The same read noted again, which a re-render does, is not news, so it never rolls a save's version back. A door that serves no ETag answers `null` each time; the sidecar then decides.
- `heldVersion(recordId)` returns `{ etag, meta }` as the module holds them now (for tests and diagnostics). An id never noted holds `{ etag: null, meta: undefined }`.
- `saveRecordSidecar(recordId, recordEntityUri, metaKey, build, rebase)` queues one save and returns a promise that resolves with nothing when the patch has been accepted.
  - Saves of one record run one at a time, in the order asked. Saves of different records do not wait for each other.
  - `build(storedMeta)` makes `{ patch, meta }` from the sidecar as stored when the save runs (so after the save before it), not as it was when the save was asked. `patch` is a merge patch; `meta` is the sidecar you expect to be stored after it.
  - The patch is sent with `If-Match` = the held ETag, and no `If-Match` when none is held. The answer's ETag becomes the held ETag, and `meta` without its `null` entries becomes the held sidecar.
  - On a 412 (someone else wrote since) the record is read again at `recordEntityUri`. The held sidecar becomes `fresh.served.facts[metaKey]` and the held ETag the fresh one, `rebase(fresh)` is called so the section can merge the person's changes onto what is stored now, `build` is called again, and the patch is sent once more. A second 412, or any other error, is thrown. A 412 on a record that cannot be read again throws the 412 itself.
  - A failed save does not stop the queue: the next one runs.

## What this is not

- Not the card's own autosave: that writes the record's facts, not the sidecar, through the library's record hooks. Both write through `lws-records`' `patchRecord`, so they share the record's ETag on the server.
- Not a cache of the record. It holds only the version and the sidecar, and only for the records it has been asked about.
- Not a merge. `rebase` and `build` do the merging; this unit only gives them the fresh state and sends again once.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-sidecar-save`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/record-sidecar-save` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/record-types <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/record-sidecar-save
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

It WRITES. `saveRecordSidecar` sends `PATCH /lws/r/<id>` (merge patch, `If-Match` when a version is held) to the record's own address, through `patchRecord` of `lws-records`, and `GET /lws/r/<id>` on a 412. It writes only the keys of the patch `build` returns, on the one record it is given. It sends nothing from `noteServedVersion` or `heldVersion`.

## Examples

```ts
import { heldVersion, noteServedVersion, saveRecordSidecar } from "@kaigilb/gilbplatformcode-record-sidecar-save";

// When the card has read the record:
noteServedVersion(record.id, record.etag ?? null, record.served?.facts["contactMeta"]);

// A section saves its rows. `build` and `rebase` are the section's own merge:
await saveRecordSidecar(
  record.id,
  record.entityUri ?? null,
  "contactMeta",
  (stored) => mergeRows(stored, myRows),   // returns { patch, meta }
  (fresh) => reloadRows(fresh),
);
```

## What the host must supply

Nothing of its own. The unit calls `lws-records`, whose auth seam (`setLwsAuth`, from `lws-session-bridge`) and platform origin (`setBaseOrigin`, `setSystemVaultHosts`, from `base-origin`) the app sets once at start-up.

## Module state

`recordSidecarSave.ts` holds one piece of module state: `states`, a `Map` from a record id to that record's save state (the tail of its queue, the number of saves queued or in flight, the held ETag and sidecar, and the last read noted). It is a singleton: two installed copies of this unit would each keep their own queue and version for one record, and two sections saving at once could then send the same `If-Match` and pay a 412 for each other. Install it once; it is a singleton peer of every unit or app that saves a record's sidecar. There is no reset, and entries are never removed (one small object per record asked about).

## Do not

- Do not install a second copy of this unit beside another one (see "Module state").
- Do not keep your own copy of the version or the sidecar per section. Ask `heldVersion` or let `build` receive it.
- Do not call `noteServedVersion` with a read from before a save you have just asked for: while the save is queued it is ignored, and after it has settled the older read is taken as news. Note the read the card shows now.
- Do not send an unconditional patch of the sidecar yourself while this unit has a save queued for the record.

## Wrong readings

- "`saveRecordSidecar` retries until it works." One resend after a 412, then it throws.
- "`build` is called once." It is called once per send, so twice after a 412.
- "`noteServedVersion` always updates the held version." Only for a read that is news, and only when no save of the record is pending.
- "The promise resolves with the new ETag." It resolves with nothing; read `heldVersion`.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/recordSidecarSave.ts` (whole, 111 lines) to `src/recordSidecarSave.ts`.

Imports: `patchRecord`, `readRecord`, `RecordConflictError`, `BaseRecord` and `MergePatchValue` from `./records`, now from the unit `lws-records` 0.4.0. Their comment-stripped declarations are token-equal to the source's, except `patchRecord`, whose one token difference is `lws-records`' own named change (`authHeader(reqUrl, "PATCH")`). Named changes, and only these: the import, and the header comment and one inline comment that name a cycle, an agent and a ticket are reworded; no code changed. The comment-stripped file, imports excluded, equals the source's (0 diff lines). `src/index.ts` is new.

## Tests

46 tests in 3 files (`npx vitest run`):

- `recordSidecarSave.test.ts` 31: the 3 cases of the source's `recordSidecarSave.f15.test.ts`, ported as they were, and 28 new, over the real `lws-records` and a fake vault (`test/support.ts`, a fake `fetch` and a fake auth host, no timers): `noteServedVersion` (an unknown id, the first read, an older read, the same ETag with a new sidecar, missing against `null`, ids kept apart, ignored while a save is pending and taken after); `saveRecordSidecar` (the patch, `If-Match`, the held version and sidecar with `null` entries gone, no held version, no ETag answered, the record's own address, two sections in turn, one at a time, different records in parallel, the order of build and patch); a 412 (re-read, `rebase`, build again, the fresh version sent, the order of those, the address, no ETag on the fresh read, no sidecar, a second 412, an unreadable record); a failed save (any other error, `build` throwing, the queue goes on, no longer busy, the held state unchanged).
- `exports.test.ts` 2.
- `hostAgnostic.test.ts` 13.

The source has no other test of this file; nothing is left out. (The sections that call it are tested where they live.)
