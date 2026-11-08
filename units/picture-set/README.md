# picture-set

Stores a picture and its smaller copies in a vault step by step, so a retry never uploads a finished step twice, and finds the right stored copy of each picture to show.

## What this is

Stores a picture and its smaller copies in a vault step by step, so a retry never uploads a finished step twice, and finds the right stored copy of each picture to show.

Two halves, both plain functions with no React.

Storing:

- `uploadWithThumb(master, thumb, sink, target, full?)`: uploads the master, then (when given) the full copy, then the small copy, then tells the vault how they relate (`transcodedFrom`, a PATCH on the file record, because the upload door takes no facts at create). Answers the MASTER's entity URI. `sink` is `{ progress?, onProgress? }`: `progress` is what an earlier try already did; `onProgress` is called (and awaited) with a copy of the progress after every finished step. A step that `progress` already holds is skipped, so a retry never uploads the same picture twice.
- File names: `<base>.jpg`, `<base>-320.jpg`, `<base>-full.jpg`, where `<base>` is the master's file name without its extension (`picture` for a blob that is not a `File`, or a file whose name is only an extension). The extension follows each blob: `.webp` for a `image/webp` blob, else `.jpg`. For a JPEG master and thumb the names are `<base>.jpg` and `<base>-320.jpg`.
- The master upload failing fails the call. The small copy, the full copy and every link are best effort: a failure writes one `console.warn` and the call goes on with what it has.
- `UploadProgress`: `{ masterEntity?, thumbEntity?, thumbLinked?, fullEntity?, masterLinked?, thumbRelinked?, linkFailures? }`. `linkFailures` is `{ which: "full" | "thumb"; message: string }[]`: empty when every link to the full copy landed, and one entry for each link that did not. The call still does not throw.
- The full copy is the ROOT (`t:TranscodedFrom`: the subject is made from the object; a vault's original carries none). With `full`: the small copy is linked to the full copy, not to the master, and the master is linked to the full copy too. Without `full` the small copy is linked to the master and nothing else runs.
- `linkFullLater(progress, full, sink, target, name?)`: for a full copy that arrives after the save (it waits for Wi-Fi). Uploads it when `progress.fullEntity` is not set (`<name or "picture">-full<ext>`), then links the master and the small copy (when there is one) to it. Resumes by `fullEntity`, `masterLinked` and `thumbRelinked`. Answers the new progress; a failed upload or link warns and answers what was reached, for the caller to try again later. Throws only for a progress with no `masterEntity`.

Finding:

- `buildThumbMap(files)`: master id tail -> the smallest copy's address (as it was in the source app; kept as it is).
- `buildCopyMap(files)`: id tail -> every stored copy of that picture, `{ uri, bytes }`, smallest first (a tie to the lower address as text). It reads the same facts, and groups a picture linked either way: the master-only shape (small copy -> master) and the root shape (master and small copy -> full copy). A file's root is found by following `transcodedFrom` at most two steps; the group is the root and every file that resolves to it, and the same list is stored under the id tail of each member, so the master's tail and the full copy's tail both find it. A file whose `transcodedFrom` names a file that is not in the list is in no group. A file with no `fileByteSize` is not offered as a copy.
- Input of `buildThumbMap` and `buildCopyMap`: an array of `{ entityUri, body }`, one per file record. `entityUri` is the file's address (its id tail is what matters; `/base/e/` and `/vault/e/` spellings meet). `body` is the record's facts as an object. Only two keys of `body` are read, each by its bare name or its `a:` spelling (`a:` wins when both are there; `t:transcodedFrom` is NOT read):
  - `fileByteSize`: a number, a numeric string such as `"4096"`, or a list whose first item is one of those. A file with none of these has no size and is not offered as a copy.
  - `transcodedFrom`: a string address, an object `{ "@id": "<address>" }`, or a list whose first item is one of those. It names the file this one was made from.

  One row: `{ entityUri: "https://vault.example/base/e/06abc", body: { fileByteSize: 4096, transcodedFrom: { "@id": "https://vault.example/base/e/06xyz" } } }`.
- What the link PATCH sends: `uploadWithThumb` and `linkFullLater` link a file with `patchRecord(<id tail of the file>, { transcodedFrom: { "@id": <address of the file it was made from> } }, <the file's address>)` (`lws-records`). The body has that one key, spelled `transcodedFrom`, and the value is the object with `@id`. The made-from file is the full copy when there is one, else the master (small copy only).
- A failed small copy, full copy or link is only a warning (one `console.warn`), and `uploadWithThumb` still answers the master's address. The caller tells what was reached from the progress it holds: `progress.thumbLinked` is true when the small copy is stored and linked, `progress.fullEntity` is set when the full copy is stored, and `progress.masterLinked` and `progress.thumbRelinked` are true when the master and the small copy are linked to it (this unit has no `fullLinked` field). A caller that needs the small copy or the full copy must check these and send again; nothing throws for them.
- Listing: no unit lists a vault's picture files yet. `lws-vault-sets` 0.2.1 (on its way to main in another batch) makes a caller that asks for `File` get its file rows; until it is on main, the app brings the `{ entityUri, body }` rows itself.
- `pickBySize(copies, minBytes)`: the smallest copy with `bytes >= minBytes`, else the largest; null for no copies. A viewer asks `pickBySize(copies, 0)` for the thumb and `pickBySize(copies, Infinity)` for the largest on a full screen.
- `onCellular()`: true for `connection.type` `cellular` or `connection.saveData === true`; false for `wifi` or `ethernet`; null when the browser does not say. On iOS there is no connection object, so the app decides what null means: the plan's default is to send the full copy on Wi-Fi only, that is, to treat null as cellular.

## What this is not

- Not the upload itself (that is `picture-upload`), not a shrinker (`picture-shrink`), not a queue (`save-queue` retries; this unit only remembers what was done) and not a viewer.
- Not a reader of the vault: `buildCopyMap` is given the file records, it does not fetch them.
- Not a cropper. The copies are the same picture at other sizes.

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-set`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/picture-set` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/photo-ref <path-to-the-library>/units/record-types <path-to-the-library>/units/server-error <path-to-the-library>/units/refusal-detail <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/picture-upload <path-to-the-library>/units/picture-set
```

(`react` is a peer of `refusal-detail`, which this unit does not draw.) Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```ts
import { buildCopyMap, linkFullLater, onCellular, pickBySize, uploadWithThumb } from "@kaigilb/gilbplatformcode-picture-set";

const target = { vaultOrigin: vault.origin, vaultRoot: vault.root, folder: "pictures" };
let progress = {};
const sink = { progress, onProgress: (p) => { progress = p; return persist(p); } };
const master = await uploadWithThumb(file1600, file320, sink, target);

// later, on Wi-Fi:
if (onCellular() === false) progress = await linkFullLater(progress, original, { onProgress: persist }, target, "ann-1");

// showing:
const copies = buildCopyMap(fileRecords).get(idTail(master)) ?? [];
const thumb = pickBySize(copies, 0);
const big = pickBySize(copies, Infinity);
```

## What the host must supply

| Member | Replaces (source app TestFlowerPower, `e39e1732551d9d5e6abf681546b97a3a30311e30`) |
|---|---|
| `target` (`UploadTarget`) | the app's settings, read by `uploadPicture` at `src/data/pictures.ts:84`; read the vault root from the vault list, never compose it |
| `sink.progress`, `sink.onProgress` | the same parameters of `uploadWithThumb` at `src/data/plants.ts:190`; the host keeps the progress (the app kept it in its outbox) |

Also: the peers `picture-upload`, `lws-records` (`patchRecord`) and `photo-ref` (`entityIdTail`).

Check linkFailures: a picture whose link failed is stored but not tied to its record.

## Do not

- Do not call `uploadWithThumb` again with the same blobs and no `progress`: it uploads them again. Keep the progress from `onProgress` and pass it back.
- Do not link a small copy to the master yourself when a full copy exists; the unit links to the root.
- Do not read `buildCopyMap(...).get(x)` as sorted by recency: it is sorted by bytes.

## Wrong readings

- "The full copy is linked to the master." It is the other way: the full copy is the root, and the master and the small copy are made FROM it (`t:TranscodedFrom`: the subject is made from the object; a vault's original carries none). Agent.Concept's answer settles it. The master and the small copy are made from the same decoded pixels as the full copy, so `t:TranscodedFrom` holds. If the small copy is ever a square crop, the term would be `t:CroppedFrom`. This unit never crops.
- "`buildThumbMap` finds the full copy." It picks the smallest copy only. Use `buildCopyMap` and `pickBySize`.
- "A thumb that names a missing file is shown anyway." It is in no group in `buildCopyMap`; it never throws.
- "A long chain is followed to its end." It is cut after two steps: the file two steps up becomes the root of what is below it.
- "The extension comes from the file name." It comes from the blob's type; a `File` called `a.png` whose type is `image/jpeg` is stored as `a.jpg`.
- "`onCellular() === null` means Wi-Fi." It means unknown. The plan's default treats it as cellular.

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by `sed -n`, then only the named changes.

- `src/data/plants.ts` lines 183-224 (`baseName`, `UploadProgress`, `ProgressSink`, `uploadWithThumb`) to `src/uploadSet.ts`.
- `src/data/plants.ts` lines 27, 29-40, 49-55 (`Raw`, `pick`, `linkText`, `countOf`) and 112-132 (`buildThumbMap` with its comment) to `src/copies.ts`.

Named changes, and only these:

- C1. `baseName` falls back to `picture`, not `plant` (both places).
- C2. `uploadWithThumb(master, thumb, sink, target)`: `uploadPicture(x, name)` becomes `uploadPicture(x, name, target)` (peer `picture-upload`). `patchRecord` comes from `lws-records` and `entityIdTail` from `photo-ref`, the symbols the app imported (plants.ts:2,5). The function and `UploadProgress`, `ProgressSink` are exported.
- C3. The file extension follows the blob: `${base}.jpg` and `${base}-320.jpg` become `${base}${ext(master)}` and `${base}-320${ext(thumb)}`.
- C4. Optional full copy as the root of the copies (`full` parameter, `fullEntity`, `masterLinked`, `thumbRelinked`, `linkFullLater`), as above.
- C5. `buildCopyMap` and `pickBySize` are new; `buildThumbMap` is as in the source.
- C6. `onCellular` is new.

`src/index.ts` is new. Blank lines were added between the cut ranges in `copies.ts`; the cut lines are otherwise as in the source.

Changes in 0.1.1, and only these:

- The peer range of `picture-upload` is `^0.1.0 || ^0.2.0` (main holds 0.2.0; `^0.1.0` stopped `npm install` with ERESOLVE).
- `src/peerRanges.test.ts` is new: it checks that each `@kaigilb` peer range holds the version in `../<peer>/package.json`.
- README additions only, no code change: the input shape of `buildThumbMap` and `buildCopyMap`, the body of the link PATCH, that a failed copy is a warning, and that no unit lists the picture files yet.

Changes in 0.1.2, and only these:

- A failed link to the full copy is still only a warning (the call does not throw). The progress now carries `linkFailures`, one `{ which, message }` for each link that did not land, or an empty list when they all did. `which` is `"full"` for the picture itself and `"thumb"` for the small copy.

## Tests

84 tests in 5 files. Ported from the source app's `test/batch5.test.ts:105-123`: the four reading tests of `buildThumbMap`. The source's save tests run on the app's fake vault and are re-expressed here with `picture-upload` and `lws-records` replaced by fakes (`vi.mock`): the order of steps, the names, `onProgress` after each step with a copy, resume from `masterEntity`, `thumbEntity` and `thumbLinked`, a thumb failure warning while the master is answered. New: the file extensions, the full copy as the root (order, links, failure, resume), `linkFullLater` (with resume), `buildCopyMap` for both shapes, ties, a broken link and a cycle, `pickBySize`, each branch of `onCellular`. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory.
