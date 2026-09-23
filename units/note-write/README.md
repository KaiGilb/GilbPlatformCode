# Note WRITE unit

Reusable GilbPlatformCode write artefact for capture-field kind `note`.

Persists a short user-authored document with a title and body into a **named vault**. This unit is write-only. View is a separate artefact.

## Injected (never baked)

| Input | Meaning |
|---|---|
| `host` | Origin of the node that holds the vault |
| `vaultId` | Named vault namespace |
| `authorization` | Bearer token |
| `fetch` | Optional. Taking app attaches DPoP or other headers here |

The taking application is not the data of record. This module has no captive store.

## Wire

W-MINT:

```
POST {host}/lws/vault/{encodeURIComponent(vaultId)}/c
Authorization: Bearer <token>
Content-Type: application/json

{ "type": "t:NoteDocument", "facts": { "a:title": "<headline>", "a:body": "<body>" } }
```

Empty body is omitted. `a:label` is not written.

Pair after mint:

- F-OPEN `GET {host}/lws/r/{id}`
- F-LIVE `GET {host}/lws/vault/{vaultId}/records?type=NoteDocument` (bare type)

## Take

```ts
import { writeNote } from "./src/index.ts";

await writeNote(
  { host, vaultId, authorization, fetch: takingAppFetch },
  { title: "Headline", body: "What I wrote" },
);
```

React: `useWriteNote(deps)`.

## Verify (in this artefact)

```sh
cd units/note-write
npm install
npm test
npm run typecheck
npm run check:host-agnostic
```

Tests mock fetch. They prove request shape, not a live vault row.
