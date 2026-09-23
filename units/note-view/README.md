# Note VIEW unit

Reusable GilbPlatformCode view artefact for capture-field kind `note`.

Reads a short user-authored document with a title and body from a **named vault**. This unit is view-only. Write is a separate artefact. Taking this unit does not pull the write path.

## Injected (never baked)

| Input | Meaning |
|---|---|
| `host` | Origin of the node that holds the vault |
| `vaultId` | Named vault namespace |
| `authorization` | Bearer token |
| `fetch` | Optional. Taking app attaches DPoP or other headers here |

The taking application is not the data of record. This module has no captive store.

## Wire

F-LIVE (bare type):

```
GET {host}/lws/vault/{encodeURIComponent(vaultId)}/records?type=NoteDocument
Authorization: Bearer <token>
Accept: application/json
```

F-OPEN (id from F-LIVE or a stored link — never computed):

```
GET {host}/lws/r/{id}
Authorization: Bearer <token>
Accept: application/json
```

Reads `a:title` and `a:body`. Does not treat `a:label` as the document title. List chrome `label` is not the persist title.

Sentinel (negative control, not on the find path by default):

```
GET {host}/lws/vault/{vaultId}/records?type=NoSuchTypeHere
```

must return 0 rows, not the unfiltered grid.

## Take

```ts
import { findLiveNotes, openNote } from "./src/index.ts";

const page = await findLiveNotes({ host, vaultId, authorization, fetch: takingAppFetch });
const note = await openNote(
  { host, vaultId, authorization, fetch: takingAppFetch },
  page.records[0].id,
);
```

React: `useViewNote(deps)`.

## Verify (in this artefact)

```sh
cd units/note-view
npm install
npm test
npm run typecheck
npm run check:host-agnostic
```

Tests mock fetch. They prove request shape, not a live vault row.
