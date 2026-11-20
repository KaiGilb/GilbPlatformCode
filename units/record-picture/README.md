Needs: lws-records, lws-session-bridge, photo-ref, picture-errors, picture-pick, picture-set, picture-shrink, picture-upload

# record-picture

## What this is

Links a stored picture to a record's picture fact and reads the link back, and runs the add, replace, remove and delete order so no picture file is orphaned and no record is lost.

One unit, three entries, no React. The record is read and written with `lws-records`; the files are stored and ended with `picture-set`; shrinking is `picture-shrink`. This unit is the glue and the ORDER between them.

- `"."` (peers `lws-records`, `photo-ref`): the link (`pictureLinkPatch`, `pictureOfFacts`, `linkPicture`, `PictureLinkNotKeptError`) and the flow (`addWithPicture`, `replacePicture`, `removePicture`, `deleteWithPicture`, `PictureSaveError`, `FILES_NOT_REMOVED`, `PictureChange`).
- `"./prepare"` (optional peers `picture-shrink`, `picture-pick`, `picture-errors`): `checkPictureFile`, `pickPicture`, `preparePicture`.
- `"./vault"` (optional peers `picture-set`, `picture-upload`, `lws-session-bridge`): `createVaultPictures`, a thin binder of picture-set's copy map, store and end; `vaultPictureService`; `vaultPictureFlowDeps`, the `PictureFlowDeps` for one vault; `recordPictureListApi`, the create, update and remove calls of `useRecordList`.

An app that only needs the link and the flow installs the two required peers and nothing else.

## The fact name is a parameter

This unit holds NO GilbVeda term. The name of the record's picture fact is always the caller's: `fact: string` on every function that touches it, and a `fact` field on `PictureFlowDeps`. There is no default, not `image`, not `picture`. (`src/noFactDefault.test.ts` parses the source and fails on a string literal that is a likely fact name.) The term itself must exist in the vault's ontology before an app writes it; that is the app's gate, not this unit's.

## API

```ts
// "."
interface RecordRef { id: string; entity: string | null; etag: string | null }
pictureLinkPatch(fact, master: string | null): { [fact]: { "@id": master } | null }
pictureOfFacts(facts: Record<string, unknown> | undefined, fact): string | null
linkPicture(rec: RecordRef, fact, master: string | null, o?: { patch?, read? }): Promise<{ etag: string | null; picture: string | null }>
class PictureLinkNotKeptError extends Error { readonly record: RecordRef }
interface PictureFlowDeps<R, F> { fact; createRecord; upload; link; endFiles; copiesOf; deleteRecord(rec, o?: { ifMatch: string }); pictureOf }
addWithPicture(d, form, p: PreparedPicture | null, o?: { order?: "record-first" | "picture-first" }): Promise<FlowResult<R>>
replacePicture(d, rec, p): Promise<FlowResult<R>>
removePicture(d, rec): Promise<FlowResult<R>>
deleteWithPicture(d, rec, o?: { ifMatch?: string | ((rec: R) => string | null); order?: "files-first" | "record-first" }): Promise<{ notice: string | null }>
class PictureSaveError<R> extends Error { readonly record: R; cause }
FILES_NOT_REMOVED: string
type FlowResult<R> = { record: R; notice: string | null }

// "./prepare"
interface PreparedPicture { thumb: Blob; screen: Blob; previewUrl: string }
checkPictureFile(file, o?: { maxBytes?: number; words?: { notPicture: string; tooBig: (mb: number) => string } }): string | null
preparePicture(file, o?: { screenEdge?: number; thumbEdge?: number; makeSet?: typeof makePictureSet }): Promise<PreparedPicture>
pickPicture(files: readonly File[], o?: { prepare?; maxBytes?; words?; failureWords?; isAlive?: () => boolean }): Promise<{ ok: true; prepared; previewUrl } | { ok: false; sentence: string } | null>

// "./vault"
createVaultPictures(c: { vaultOrigin; vaultRoot; folder; send? }): { loadCopies(); upload(p); endFiles(master, copies) }
vaultPictureFlowDeps<R, F>(o: { vaultId; typeIri; fact; pictures; copies?; toFacts; fromRecord; nameHint?; stamp? }): PictureFlowDeps<R, F>
recordPictureListApi<R, F, D>(o: { deps(fresh); patchOf(from, to); afterPatch(item, fields, etag); ifMatch?; onNotice; failureLine?; keepPreview?; revokePreview?; words?; patch? }): { create(draft); update(item, draft); remove(item) }
```

- `pictureLinkPatch` writes the `{"@id": master}` form only (a `null` member deletes the fact, JSON merge patch). `pictureOfFacts` reads every form a vault serves: a plain string, `{"@id": x}`, a list (the first item that reads), under the bare key or the `a:` spelling (the bare key wins when both are there). Empty and non-string values are `null`.
- `linkPicture` PATCHes the record (`If-Match: rec.etag` when it is not null), reads it back, and compares the picture with `master` by file id tail (so a `/base/e/` and a `/vault/e/` spelling of one file are equal). A mismatch is `PictureLinkNotKeptError`. A stale ETag is lws-records' `RecordConflictError`, thrown unchanged, as is every other error of the PATCH. `o.patch` and `o.read` replace the two lws-records calls (for a test); they default to `patchRecord` and `readRecord`.
- `PictureFlowDeps.link` is yours to write; it usually calls `linkPicture` and then reads the record. `copiesOf(master)` is the stored copies other than the master (`copiesOf` of picture-set's copy map). `endFiles` answers the addresses that could NOT be ended.
- `upload` answers `{ master, thumb, warning }` (picture-set's `StoredPicture` fits). The new set's copies are exactly `[thumb]` (none when `thumb` is null).
- The unit keeps no state; everything an app needs is passed in.

## The two orders

"record-first" (default; the order of run-7). A failed picture leaves the saved record, which the person can edit and retry.

1. `createRecord(form)` -> `upload(p)` -> `link(rec, master)`.
2. Upload fails: `PictureSaveError` holding the saved record (`cause` = the error); nothing to end.
3. Link fails: the new files are ended, then `PictureSaveError` holding the saved record (`cause` = the link error).
4. No picture: only `createRecord`.

"picture-first" (the order of run-6). The record is never created without its picture.

1. `upload(p)` -> `createRecord(form, { fact, master })`.
2. Create fails: the new files are ended and the create error is rethrown unchanged.

The other steps:

- `replacePicture`: upload the new, link it, and only AFTER the link succeeded end the old master and its copies. A failed upload throws as it is and leaves the old picture. A failed link ends the NEW set, keeps the old, and throws `PictureSaveError` (`record` is the record given). Old files that cannot be ended are the notice `FILES_NOT_REMOVED`, not an error.
- `removePicture`: link `null`, then end the old files. A record with no picture is answered as it is, with no call at all.
- `deleteWithPicture`: ends the picture files FIRST, then deletes the record. Files that cannot be ended give the notice `FILES_NOT_REMOVED` and the record is still deleted; a failure of `deleteRecord` is thrown.
- `notice` carries the storing warning (`warning` of `upload`) or `FILES_NOT_REMOVED`.

## Prepare

`checkPictureFile` answers one sentence, or `null` when the file can be decoded. A picture is what picture-pick's `pictureFiles` accepts (a type that starts with `image/`, or an empty type with a picture extension, as a browser gives a HEIC file). `maxBytes` defaults to 25 MB; exactly that size passes. The default sentences are "That file is not a picture. Choose a JPEG or PNG." and "That picture is larger than 25 MB. Choose a smaller one."; `words` replaces them.

`preparePicture` makes the screen copy (the master) and the small copy with picture-shrink's `makePictureSet` (type `auto`, no full copy), and a preview object URL of the screen copy that the caller revokes. Edges default to picture-shrink's own, 1600 px and 320 px. EVERY copy is re-encoded from a canvas, so the original's EXIF and GPS location are dropped.

## Vault

`createVaultPictures({ vaultOrigin, vaultRoot, folder, send? })` binds picture-set's `loadCopyMap`, `storePictureSet` and `endPictureFiles` to one vault. `send` defaults to `signedSend()` of lws-session-bridge. `endFiles` answers the addresses that could not be ended.

### vaultPictureService

`vaultPictureService({ originOf, folder, send?, revoke? })` (since 0.1.1, same `"./vault"` entry) keeps one `createVaultPictures` binding and one copy map per vault, and tracks object URLs so a screen can release them. `originOf(vaultRoot)` gives the origin that serves a vault (an app passes `vaultOriginOf`); the folder comes from the caller; `revoke` defaults to `URL.revokeObjectURL`. It imports nothing new, so no new peer; fetching stays with `signed-picture`, whose URLs you `track`.

- `forVault(vaultRoot)`: the binding, made once per vault. `copies(vaultRoot)`: its copy map, listed once. `fresh(vaultRoot)`: drops both, so the next call makes them again.
- `forget(vaultRoot?)`: one vault's binding, copy map and the URLs tracked with it, or with no argument all of them.
- `track(url, vaultRoot?)` returns the URL; `release(url)` revokes it once (a second call or an untracked URL does nothing); `releaseAll()`.

```ts
const pictures = vaultPictureService({ originOf: vaultOriginOf, folder: PICTURE_FOLDER });
const binding = pictures.forVault(vaultId);          // was pictureBinding(vaultId)
const map = await pictures.copies(vaultId);          // was copyMap(vaultId)
pictures.fresh(vaultId); const now = await pictures.copies(vaultId); // was freshMap(vaultId)
const url = pictures.track(await pictureObjectUrl(uri, origin), vaultId); pictures.release(url); // was tracked/revoke
pictures.forget();                                    // was forgetAll's maps, bindings and tracked loop
```

### vaultPictureFlowDeps

`vaultPictureFlowDeps({ vaultId, typeIri, fact, pictures, copies?, toFacts, fromRecord, nameHint?, stamp? })` (since 0.1.2, same `"./vault"` entry) answers the `PictureFlowDeps<R, F>` an app otherwise writes by hand (about 20 lines in run 9). `R` is the app's record and must carry `id`, `entity`, `etag` and `picture`.

- `createRecord`: lws-records' `createRecord` into `vaultId` with `typeIri`, `toFacts(form)`, and (picture-first only) the picture link under `fact`; the record is `fromRecord({ id, entity, etag }, form, masterOrNull)`. `nameHint(form)` is the address hint.
- `upload`, `endFiles`: `pictures` (a `createVaultPictures` binding, or `service.forVault(vaultId)`). `copiesOf`: picture-set's `copiesOf` of `copies` (a copy map, or a function that answers one; none when omitted, so pass the map for a replace or delete).
- `link`: `linkPicture` (PATCH with If-Match, read back), answering `{ ...rec, etag, picture }`.
- `deleteRecord`: DELETE with NO If-Match by default (the files are already ended, so a record that moved on must still go); with the `{ ifMatch }` that `deleteWithPicture` passes (since 0.1.3) the DELETE carries `If-Match`. `pictureOf`: `rec.picture`.
- `stamp`: the signed-in principal's address, or a function answering it (`null` or `""` means none). When there is one, `statedBy` is written on the create AND on the link PATCH (the field-edit PATCH is the app's own, so it adds `statedBy` itself). Without `stamp` no `statedBy` is sent. The slug is `statedBy`; lws-records spells it `a:statedBy` on the wire.

```ts
const deps = vaultPictureFlowDeps<Camera, CameraForm>({
  vaultId, typeIri: CAMERA_TYPE_IRI, fact: PICTURE_FACT, pictures: pictures.forVault(vaultId), copies: map,
  toFacts, nameHint: (f) => f.name.trim(), stamp: principal,
  fromRecord: (made, form, picture) => ({ ...applyForm(blank(), form), ...made, picture }),
});
await addWithPicture(deps, form, prepared);
```

### Delete only if the record is unchanged (since 0.1.3)

`deleteWithPicture(d, rec, { ifMatch?, order? })`. With no options it is exactly the 0.1.2 delete: files first, then an unconditional DELETE (`deleteRecord(rec)` is called with no second argument). The options are opt-in:

- `ifMatch`: a version tag, or a function `(rec) => tag | null`. A tag makes the flow call `d.deleteRecord(rec, { ifMatch })`; `vaultPictureFlowDeps` sends it as `If-Match`.
- `order: "record-first"`: the record is deleted FIRST, then its files are ended. A refused delete (a 412 because the record changed, or any other error) is thrown as it is and no file was touched, so the record keeps its picture. Files that cannot be ended after the record went give the notice `FILES_NOT_REMOVED`. Use this order with `ifMatch`; with the default files-first order a 412 would arrive after the files are gone.

```ts
await deleteWithPicture(deps, watch, { order: "record-first", ifMatch: (w) => w.etag });
```

### pickPicture (since 0.1.3, `"./prepare"`)

The pick step in one call: first file, `checkPictureFile`, `preparePicture`, a preview URL. It answers `{ ok: true, prepared, previewUrl }`, `{ ok: false, sentence }` (the check's sentence, or picture-errors' sentence and next step for a file that cannot be read), or `null` (no file, or `isAlive()` was false when it finished: the preview is revoked). `previewUrl` is the caller's to revoke. `picture-errors` is an optional peer used by this entry only.

```tsx
const r = await pickPicture(files, { isAlive: () => alive.current });
if (r?.ok) setChange({ kind: "set", prepared: r.prepared });
else if (r) setPictureError(r.sentence);
```

### recordPictureListApi (since 0.1.3, `"./vault"`)

The `create`, `update` and `remove` of optimistic-records' `useRecordList`, with the picture handled by this unit's flow; `list` stays the app's. It holds no fact or field: the app passes `deps` (its `vaultPictureFlowDeps`, with the copy map when `fresh`), `patchOf` (the field merge patch; `{}` sends none) and `afterPatch` (the record after the PATCH, because only the app knows which fields cleared). A draft is the app's fields plus `change?: PictureChange` (`{ kind: "set"; prepared }` or `{ kind: "remove" }`).

- `create`: add with the picture; a record saved without its picture is returned (kept in the list) and `onNotice` says why.
- `update`: the field PATCH with `If-Match` and the new tag kept, then replace or remove the picture from that tag. A failed picture step is a notice and the record as it stands, never a throw.
- `remove`: `deleteWithPicture` record-first with `If-Match` (`ifMatch` option, default `rec.etag`). A changed record is refused with the 412 for the list to roll back, and its picture is kept.

```tsx
const pictureApi = recordPictureListApi<Watch, WatchFields, WatchDraft>({
  deps: async (fresh) => vaultPictureFlowDeps({ vaultId, typeIri, fact, pictures: pictures.forVault(vaultId), ...(fresh ? { copies: await pictures.copies(vaultId) } : {}), toFacts, fromRecord }),
  patchOf, afterPatch: (w, fields, etag) => ({ ...fields, id: w.id, entity: w.entity, updatedAt: w.updatedAt, etag, picture: w.picture }),
  onNotice: setNotice, failureLine: pictureLine, keepPreview: (u) => pictures.track(u, vaultId),
});
const api = { list, ...pictureApi };               // the four calls useRecordList takes
const records = useRecordList(api, { /* ... */ });
```

## How to take it

Package `@kaigilb/gilbplatformcode-record-picture`. Install the required peers `lws-records` and `photo-ref`, plus the optional peers of each entry you import. Put `install-links=true` in your `.npmrc` so the unit is installed as a copy.

In the GilbApp chat, a project folder the chat made already has this line: the bridge writes it when it makes the folder. A coding agent may not write `.npmrc` (Claude Code refuses it as a sensitive file), so when the line is missing it asks you to add it, and until then it passes `--install-links` to every `npm install` and `npm ci`.

## Changes in 0.1.1

Additive, in `"./vault"`: `vaultPictureService` and the types `VaultPictureService`, `VaultPictureServiceDeps`. No new peer (it uses only `createVaultPictures` and picture-set's `CopyMap` type). 10 new tests (`src/vault.test.ts`).

## Changes in 0.1.2

Additive, in `"./vault"`: `vaultPictureFlowDeps` and the type `VaultPictureFlowOptions`. `"./vault"` now also imports the two required peers `lws-records` and `photo-ref` (through `./link`), so it needs no new peer. 4 new tests (`src/vault.test.ts`): `statedBy` on the create and on the link PATCH when `stamp` is on, none when it is off, `stamp` as a function, and replace, remove and delete through the deps.

## Changes in 0.1.3

Additive: the options of `deleteWithPicture` (and the optional second argument of `PictureFlowDeps.deleteRecord`), `pickPicture`, `recordPictureListApi`, the type `PictureChange`, and one new OPTIONAL peer, `picture-errors`, used by `"./prepare"` only. Default behaviour is unchanged. Below 1.0 an additive change is a patch bump (repository README).

## Where it came from

New code, written for EESpeed Round 7 (batch U2a). Repository `KaiGilb/GilbPlatformCode`, commit `19fb34ba7195055fbd0ef13e376d789756e2c9f6`. The flow's logic is run-7's `src/plant/pictureFlow.ts`, `src/plant/plantsApi.ts` (`linkPlantPicture`) and `src/platform/pictureLink.ts`, ported from `~/Developer/PictureRecords-run7/app` (a local folder, not a git repository), and run-6's `src/pictures.ts` (`preparePicture`) and `src/bikes.ts` (the link reader that accepts both forms). No file was copied whole.

## Tests

`npm test` (vitest): the flow against stubs (run-7's twelve flow tests ported, and the cases above), the link and the read-back, the picture check and prepare, the flow and the vault binder against `fake-platform` through the units' real clients, the import surface of each entry, the no-default-fact scan, and the host-agnostic check with planted faults.
