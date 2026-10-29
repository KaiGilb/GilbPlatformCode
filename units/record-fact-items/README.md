# record-fact-items

Changes the items of one fact of a record, with If-Match and a queue per record.

## What this is

Changes the items of one fact of a record, with If-Match and a queue per record.

A record's fact holds a list of items (a person's several emails, a card's several links). To add or remove one item the writer must read the list as it is now, change it, and write it back without losing what another writer wrote in between. This unit does that for one key at a time.

- `changeRecordFactItems(recordId, recordEntityUri, factKey, change, notChanged)`: reads the record (`readRecord`), hands `change` the items AS STORED NOW (a scalar is a one-item list, none is an empty list), and writes the next list back as a merge PATCH of that one key, conditional on the read it was built from (`If-Match`). Resolves with the list as written.
  - When `change` returns the same items (compared as JSON) nothing is written, and the stored items are returned.
  - A 412 (`RecordConflictError`) re-reads and re-applies `change`, up to 3 tries in all; the third conflict is thrown. Any other error is thrown at once.
  - One write at a time per record: calls for one record id run one after the other (a failed call does not stop the next); calls for two records do not wait for each other.
  - The condition is `conditionFromEtag` of `holder-reference`: a strong tag is sent as it is; the production edge's weak form of the platform's own tag (`W/"sha256:<64 hex>"`) sends the platform's tag under it; a read with no ETag, or any other weak or malformed tag, throws `RecordVersionUnknownError` with NOTHING sent. An unconditional patch is never sent.
  - `factKey` may carry a leading `a:`, which is dropped. `notChanged` ends the sentence in the error when the record cannot be read or its version is not known ("..., so <notChanged>").
  - On the wire: none left is `null` (retract), one item is the item itself, several are an array.
- `storedFactItems(raw)`: the stored items as a list (`null`, `undefined` and `""` are none).
- `factItemsToWire(items)`: the items as the fact goes back.
- `RecordVersionUnknownError` (`etag`: the tag read or null): the read named no version this writer can condition a patch on.

## What this is not

- Not a multi-key writer: one key per call.
- Not an unconditional write: with no usable version nothing is sent.
- Not a cache: every call reads the record again.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-fact-items`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/record-fact-items` prints:

```sh

```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```ts
import { changeRecordFactItems } from "@kaigilb/gilbplatformcode-record-fact-items";

// Remove one link from a person's `memberOf` fact, whatever else was written meanwhile.
await changeRecordFactItems(
  "r1",
  "https://vault.example.test/base/e/r1",
  "memberOf",
  (stored) => stored.filter((i) => (i as { "@id"?: string })["@id"] !== "https://vault.example.test/base/e/x"),
  "the link was not removed",
);
```

It is the `changeRecordFactItems` host member of `card-references` (`CardReferencesHost`): pass the function itself, `{ changeRecordFactItems }`. The signature is the same, parameter for parameter.

## What the host must supply

None. The unit calls `lws-records`, whose auth seam (`setLwsAuth`) and platform origin (`setBaseOrigin`) the app sets once at start-up; it needs nothing of its own.

## Module state

`recordFactItems.ts` holds one piece of module state: `queues`, a `Map` from a record id to the promise of its last write, so that calls for one record run in order. Two installed copies of this unit would each hold their own queues, and two calls for one record could then run together and lose an item. Install it once; it is a singleton peer of every unit or app that uses it. There is no reset (the queue entries are replaced by each call and hold no data).

## Do not

- Do not install a second copy of this unit beside another one (see "Module state").
- Do not send an unconditional patch in place of "not known yet".
- Do not write two keys through two calls and expect one transaction.

## Wrong readings

- "A change that returns the same items still writes." It does not: nothing is sent and the stored items are returned, even for a record whose version is not known.
- "A conflict is retried for ever." Three tries in all, then the conflict is thrown.
- "The queue holds the data." It holds only the promise of the last call for the record.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/recordFactItems.ts` (whole, 87 lines) to `src/recordFactItems.ts`.

Named changes, and only these:

1. the imports: `conditionFromEtag` from `gilb-stakeholders` is the same from `@kaigilb/gilbplatformcode-holder-reference`; `patchRecord, readRecord, RecordConflictError, type MergePatchValue` from `./records` are the same from `@kaigilb/gilbplatformcode-lws-records`;
2. comments that name a cycle, an agent, a ticket or a ruling are reworded; no code changed.

Merged units compared and taken: `holder-reference` `conditionFromEtag` is token-equal (47 tokens) with the one in `gilb-stakeholders` the app imports; `lws-records` `readRecord` (37), `RecordConflictError` (24) and `MergePatchValue` (29) are token-equal, and `patchRecord` differs only by the `"PATCH"` argument of that unit's auth seam.

`src/index.ts` is new.

## Tests

35 tests in 3 files (`npx vitest run`):

- `recordFactItems.test.ts` 20. Ported 4 of the 5 cases of GilbApp `src/lib/base/recordFactItems.c214e8fix.test.ts` (no ETag; the edge's weak form; any other weak tag; a strong tag): `vi.mock("./records")` is replaced by the real `lws-records` over a fake `fetch` and a fake auth host (`test/support.ts`), and the expectations read the request actually sent (the `If-Match` header and the one-key body). New: the items handed to `change`, one key written (array, scalar, null), the `a:` prefix, nothing written for the same items, an unreadable record, the record's own address, a 412 re-read (the second patch carries the new tag), three 412s, a non-conflict error, a 412 after which nothing is left to write, the queue (one record in order, two records not behind each other, a failure not stopping the next), and the helpers.
- `exports.test.ts` 2 (the four exports, and the signature of the `card-references` host member).
- `hostAgnostic.test.ts` 13 (the same host-agnostic test as every unit).

Left out: the fifth source case drives `changeEmploymentEdges` and `removeCardReference`, which are other units' functions (`card-references` and the employment code); it tests their use of this writer, not the writer. No wall-clock waits: the fake `fetch` answers at once.
