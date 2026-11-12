# vault-picture-viewer

Opens a vault's pictures in the full-screen viewer: the small copy shows at once while the largest stored copy is fetched with the person's access, a picture on this device opens with no fetch, and the viewer's stylesheet is loaded for you.

## What this is

Opens a vault's pictures in the full-screen viewer: the small copy shows at once while the largest stored copy is fetched with the person's access, a picture on this device opens with no fetch, and the viewer's stylesheet is loaded for you.

One hook, `useVaultPictureViewer`, joins three units that apps used to wire by hand: `picture-viewer` (the full-screen viewer), `signed-picture` (the signed fetch of a vault file) and `picture-set` (the copy map that knows each picture's small and large copies).

- `useVaultPictureViewer({ vaultOrigin, copies, words? })` returns `{ viewer, openStored, openLocal, thumbUri }`. Render `viewer` once; it is `null` while the viewer is closed.
  - `vaultOrigin`: the vault's origin. Picture addresses are absolute, but `pictureObjectUrl` builds the request URL `<vaultOrigin>/files/<id>` from it, so it is needed.
  - `copies`: the vault's copy map (`loadCopyMap` of `picture-set`), or `null` while the files are not listed yet.
  - `words`: your words over the viewer's English ones (`Partial<LightboxWords>`).
- `openStored({ master, alt, caption?, el? })`: a promise. It first fetches the thumbnail (`thumbUriOf(copies, master) ?? master`) through `pictureObjectUrl` and opens the viewer with that as the stand-in, then the viewer fetches the largest copy (`largestUriOf(copies, master)`, the master itself when none is listed or `copies` is null). A thumbnail that cannot be read never throws out of `openStored`: the viewer opens without a stand-in. A refused read of the large copy shows the viewer's own `loadFailed` words (yours through `words`). `caption` defaults to `alt`. `el` is the element that gets focus back when the viewer closes (the viewer's `LightboxItem.el`).
- `openLocal({ url, alt, caption? })`: opens a picture the person has on this device by its local URL. Nothing is signed and nothing is fetched.
- `thumbUri(master)`: `thumbUriOf(copies, master)`: null while `copies` is null, else the smallest copy (the master itself when it has none).

### The CSS is imported for you

The module itself does `import "@kaigilb/gilbplatformcode-picture-viewer/pictureViewer.css"`. An app that forgot that import drew the viewer off-screen (run 7, F13); with this unit the app cannot forget it. Your bundler must handle a CSS import (Vite, webpack and Next do).

## What this is not

- Not the viewer: gestures, zoom and keys are `picture-viewer`. Not the signed fetch (`signed-picture`) and not the copy map (`picture-set`).
- Not a gallery: it opens one picture at a time.
- Not a session: the signed fetch needs `setLwsAuth` (`lws-session-bridge`) set up, and `startPictureSession` of `signed-picture` for the queue limit and the per-person device cache.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-picture-viewer`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-picture-viewer` prints:

```sh
npm install react@^19.0.0 react-dom@^19.0.0 <the peers in that order> <path-to-the-library>/units/vault-picture-viewer
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

After, in an app that used to hold its own `usePictureView.tsx`:

```tsx
import { useVaultPictureViewer } from "@kaigilb/gilbplatformcode-vault-picture-viewer";
import { startPictureSession } from "@kaigilb/gilbplatformcode-signed-picture";

const { viewer, openStored, openLocal } = useVaultPictureViewer({ vaultOrigin, copies });
useEffect(() => { const stop = startPictureSession({ principal, deviceCachePrefix: "myapp" }); return () => void stop(); }, [principal]);
// <button onClick={() => openStored({ master: plant.picture, alt: plant.name })}>, and render {viewer} once.
```

## What the host must supply

| Member | Replaces (source app PictureRecords run 7) |
|---|---|
| `vaultOrigin` | `session.vaultOrigin`, `app/src/plant/usePictureView.tsx:25,38` |
| `copies` | the app's `CopyMap` state, `usePictureView.tsx:24` |
| `words` | none (the app used the viewer's English) |

Also: React 19 and react-dom; the peers `picture-viewer`, `signed-picture` and `picture-set` (and theirs); `setLwsAuth` called once at start-up.

## Do not

- Do not render `viewer` twice: each copy would open its own dialog.
- Do not add your own import of the viewer's stylesheet: this module does it once.
- Do not pass a `vaultOrigin` of another vault than the picture's: `pictureObjectUrl` caches by file address only.

## Where it came from

Written new in this repository from PictureRecords run 7 (`app/src/plant/usePictureView.tsx`, a local folder that is not a git repository) and run 6 (`app/src/ui/useBikeViewer.tsx`). The commit below is this repository's head when the unit was written (`19fb34ba7195055fbd0ef13e376d789756e2c9f6`), the commit whose `picture-set` (`thumbUriOf`, `largestUriOf`) and `signed-picture` (`startPictureSession`) the unit builds on.

Named changes, and only these:

- V1. `resolveSrc` signs the file the item names (`item.fileUri`) and returns the local URL for an item with none; the run-7 code picked the largest copy inside `resolveSrc`, here `openStored` puts it in `fileUri`.
- V2. `openStored` takes the thumbnail's address as `thumbUriOf(copies, master) ?? master`, so with `copies` null the master itself is the stand-in (run 7 showed none then).
- V3. `el` (focus return) is passed through to the viewer.
