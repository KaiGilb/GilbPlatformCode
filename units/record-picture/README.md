# record-picture

## What this is

Links a stored picture to a record's picture fact and reads the link back, and runs the add, replace, remove and delete order so no picture file is orphaned and no record is lost.

One unit, three entries, no React. The record is read and written with `lws-records`; the files are stored and ended with `picture-set`; shrinking is `picture-shrink`. This unit is the glue and the ORDER between them.

- `"."` (peers `lws-records`, `photo-ref`): the link (`pictureLinkPatch`, `pictureOfFacts`, `linkPicture`, `PictureLinkNotKeptError`) and the flow (`addWithPicture`, `replacePicture`, `removePicture`, `deleteWithPicture`, `PictureSaveError`, `FILES_NOT_REMOVED`).
- `"./prepare"` (optional peers `picture-shrink`, `picture-pick`): `checkPictureFile`, `preparePicture`.
- `"./vault"` (optional peers `picture-set`, `picture-upload`, `lws-session-bridge`): `createVaultPictures`, a thin binder of picture-set's copy map, store and end.

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
interface PictureFlowDeps<R, F> { fact; createRecord; upload; link; endFiles; copiesOf; deleteRecord; pictureOf }
addWithPicture(d, form, p: PreparedPicture | null, o?: { order?: "record-first" | "picture-first" }): Promise<FlowResult<R>>
replacePicture(d, rec, p): Promise<FlowResult<R>>
removePicture(d, rec): Promise<FlowResult<R>>
deleteWithPicture(d, rec): Promise<{ notice: string | null }>
class PictureSaveError<R> extends Error { readonly record: R; cause }
FILES_NOT_REMOVED: string
type FlowResult<R> = { record: R; notice: string | null }

// "./prepare"
interface PreparedPicture { thumb: Blob; screen: Blob; previewUrl: string }
checkPictureFile(file, o?: { maxBytes?: number; words?: { notPicture: string; tooBig: (mb: number) => string } }): string | null
preparePicture(file, o?: { screenEdge?: number; thumbEdge?: number; makeSet?: typeof makePictureSet }): Promise<PreparedPicture>

// "./vault"
createVaultPictures(c: { vaultOrigin; vaultRoot; folder; send? }): { loadCopies(); upload(p); endFiles(master, copies) }
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

## How to take it

Package `@kaigilb/gilbplatformcode-record-picture`. Install the required peers `lws-records` and `photo-ref`, plus the optional peers of each entry you import. Put `install-links=true` in your `.npmrc` so the unit is installed as a copy.

## Where it came from

New code, written for EESpeed Round 7 (batch U2a). Repository `KaiGilb/GilbPlatformCode`, commit `19fb34ba7195055fbd0ef13e376d789756e2c9f6`. The flow's logic is run-7's `src/plant/pictureFlow.ts`, `src/plant/plantsApi.ts` (`linkPlantPicture`) and `src/platform/pictureLink.ts`, ported from `~/Developer/PictureRecords-run7/app` (a local folder, not a git repository), and run-6's `src/pictures.ts` (`preparePicture`) and `src/bikes.ts` (the link reader that accepts both forms). No file was copied whole.

## Tests

`npm test` (vitest): the flow against stubs (run-7's twelve flow tests ported, and the cases above), the link and the read-back, the picture check and prepare, the flow and the vault binder against `fake-platform` through the units' real clients, the import surface of each entry, the no-default-fact scan, and the host-agnostic check with planted faults.
