# employment-edges

The ordered employment edges on a person's record, changed as stored now and written one key at a time.

## What this is

The ordered employment edges on a person's record, changed as stored now and written one key at a time.

Five functions over the record's `a:employment` fact, which holds one reference `{"@id": <employment entity>}` per employment, in order.

`changeEmploymentEdges(recordId, recordEntityUri, edgeKey, change)` reads the record fresh, hands `change` the items AS STORED NOW, and writes back the list `change` returns as a merge PATCH of that one key, conditional on the version just read (`If-Match`). A 412 re-reads and re-applies the change (up to three tries). One write at a time per record. When `change` returns the same items nothing is written. One edge is a scalar, several an array, and when nothing is left the key is retracted (a `null`, the person removed the last).

`withEdge(items, uri)` appends an edge once. `withoutEdges(items, uris)` drops the named edges and carries every other item as it is, including a plain text an older writer left and an edge this session never read. `edgeIdOf(item)` is the address of an edge item, or null when the item is not an edge. `storedEdgeItems(raw)` is the stored items as a list.

## What this is not

- Not the employment entity itself: that is `employment-store`.
- Not a delete of an employment: removing an edge leaves the entity.
- Not the record's autosave: a card's own save keeps this key.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-edges`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-edges` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/employment-edges
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

`PATCH /lws/r/<record id>` with `If-Match`, the one key named by `edgeKey` (`a:` prefix optional). A null is on the wire only when the last item is removed.

## Requests and their servers

`GET /lws/r/<record id>` at the record's own host before each write (and again after a 412), then the PATCH. Through `record-fact-items`.

## Examples

```ts
import { changeEmploymentEdges, withEdge } from "@kaigilb/gilbplatformcode-employment-edges";

await changeEmploymentEdges(recordId, recordEntityUri, "employment", (stored) => withEdge(stored, entityUri));
```

## What the host must supply

The auth seam and origins of `lws-records` (set once at start-up).

## Module state

None of its own. `record-fact-items` keeps one write queue per record (install one copy of it).

## Do not

- Do not apply a change to the list a screen resolved: use the stored list `change` is handed.
- Do not drop an item because it is not an edge.
- Do not write the key from a card's own save.

## Wrong readings

- "An edge that did not read is gone." It is carried as stored.
- "Removing an employment deletes it." It removes the edge only.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/lib/mynet/employment/employmentEdges.ts` lines 23-62.

## Tests

30 tests in 4 files (`npx vitest run`): `employmentEdges.test.ts` 4 (ported from `employmentStore.c214e7.test.ts`, re-based on the real peers over an in-memory vault), `employmentEdges.wire.test.ts` 12, `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 8 mutants of `src/employmentEdges.ts` (a text counted as an edge, an edge twice, non-edges dropped, every edge dropped, the change applied to nothing, the stored items read as none, an object without an id as an edge, the wrong key), 8 killed.
