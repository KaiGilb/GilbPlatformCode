# stakeholder-list-state

The session's memory of the Stakeholders list: the ids of the records deleted in this session, and the link of each record a page was read with, each with its listeners, kept once for the page's life.

## What this is

The session's memory of the Stakeholders list: the ids of the records deleted in this session, and the link of each record a page was read with, each with its listeners, kept once for the page's life.

Two small pieces of module state, each a set or a map with a list of listeners and a revision number, so a screen can follow it with `useSyncExternalStore`. Plain functions, no React, no network.

- The session's deleted list: `forgetDeletedLinkedRecord(id)` adds a record (an id, or an address, which is cut to its last segment) and tells the listeners once; the same id again tells nothing. `deletedLinkedRecords()` is a copy of the set, `deletedLinkedRevision()` a number that moves by one with every change, `onDeletedLinkedRecords(listener)` follows it and answers the unsubscribe. The record hooks' delete watcher calls the writer once a DELETE has landed, so the Stakeholders list never draws a deleted record again from what a page kept.
- The page links: `notePageLinks(rows)` keeps, for each row that carries a body, the link (`a:sameAs`) read by `readLink` of `online-card-link`: `{ state: "none" }`, `{ state: "linked", target }`, `{ state: "ambiguous" }` or `{ state: "malformed" }`. A row without a body is skipped; a link that did not change tells nothing; one page tells once. `pageLinkOf(id)` reads one, `forgetPageLink(id)` forgets one (the record hooks' delete calls it) and tells only if it was kept, `forgetPageLinks()` forgets all, `onPageLinks(listener)` and `pageLinksRevision()` follow it.

The unit holds module state (`deletedIds`, `deletedListeners`, `deletedRev`; `links`, `listeners`, `revision`). An app must have ONE copy of it: it is a peer of `plan-record-hooks` (which writes it), of the stakeholder reader unit that follows it, and of every screen that reads it. Two installed copies would each keep their own list, and a delete made through one would not be seen through the other. Its peers: `lws-vault-sets` (`idFromUri`, `VaultRecordRef`) and `online-card-link` (`readLink`, `LinkReading`).

## What this is not

- Not the whole of `stakeholderList/linkedAnswers.ts` and `pageLinks.ts`. The record hooks reach `forgetDeletedLinkedRecord`, `notePageLinks` and `forgetPageLink` and the variables they write; this unit also takes the readers of those same variables (`deletedLinkedRecords`, `deletedLinkedRevision`, `onDeletedLinkedRecords`, `pageLinkOf`, `onPageLinks`, `pageLinksRevision`) and the reset `forgetPageLinks`, so the state can be seen and tested. Not here: the up-front answers of the list (`memberAnswers`, `recordReads`, `screenAnswerUntil`, `resolveAnswers`, `joinedIds`, `endedIds`, `isDeletedLinkedRecord`, `forgetLinkedRecords`, `forgetLinkedFinds` and the rest of the file), and in `pageLinks.ts` the screens and in-view state (`screens`, `inView` and their functions). The stakeholder IO unit of the next batch adds them to this unit as a later version, so the state stays in one place.
- Not a store of records. It keeps ids and link readings, never a record.
- Not persisted. Nothing here is written anywhere; a reload empties both.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-list-state`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/stakeholder-list-state` prints:

```sh
npm install <path-to-the-library>/units/stakeholder-list-state
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-records` does. `@tanstack/react-query` is a dev dependency only (a peer of `lws-vault-sets`); the unit does not call it.

## Examples

```ts
import { deletedLinkedRecords, deletedLinkedRevision, forgetDeletedLinkedRecord, notePageLinks, onDeletedLinkedRecords, pageLinkOf } from "@kaigilb/gilbplatformcode-stakeholder-list-state";

notePageLinks([{ id: "a", body: { sameAs: { "@id": "https://kari.platform.example.test/vault" } } }]);
pageLinkOf("a"); // { state: "linked", target: "https://kari.platform.example.test/vault" }

const off = onDeletedLinkedRecords(() => console.log(deletedLinkedRevision(), [...deletedLinkedRecords()]));
forgetDeletedLinkedRecord("https://kari.platform.example.test/vault/e/x1"); // logs 1 ["x1"]
off();
```

## What the host must supply

Nothing. There are no settings and no host object. The two peers carry no settings of their own that this unit reads.

## Do not

- Do not install a second copy of this unit (see above).
- Do not keep a reading of `deletedLinkedRecords()` across a change: it is a copy. Follow it with `onDeletedLinkedRecords` and read it again.
- Do not call `notePageLinks` with rows read without bodies and expect a link: they are skipped.

## Wrong readings

- "`forgetDeletedLinkedRecord` needs the record's address." It takes an id or an address and keeps the last segment; a record id names one record on the platform whichever host spells its address.
- "A deleted id can be taken back." It cannot in this unit: nothing removes an id. The app clears the list on sign-out (`forgetLinkedRecords`, not taken here).
- "`onPageLinks` listeners are told for each row." They are told once for a page, after the whole page is kept.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script, symbol by symbol (the reached ones and the readers of the same variables):

- `src/lib/base/stakeholderList/linkedAnswers.ts` to `src/linkedAnswers.ts`: lines 72-90, 130-159 (`deletedIds`, `deletedListeners`, `deletedRev`, `tellDeleted`, `deletedLinkedRevision`, `forgetDeletedLinkedRecord`, `deletedLinkedRecords`, `onDeletedLinkedRecords`);
- `src/lib/base/stakeholderList/pageLinks.ts` to `src/pageLinks.ts`: lines 13-53, 136-151 (`links`, `listeners`, `revision`, `tell`, `notePageLinks`, `pageLinkOf`, `forgetPageLink`, `onPageLinks`, `pageLinksRevision`, `forgetPageLinks`).

**Dynamic imports in the files taken: none** (both files were searched with `grep "import("`).

**Merged units compared with the app's functions and taken as peers.** `online-card-link`: `readLink` and `LinkReading` are the copy of `gilb-stakeholders`' at the commit the app pins (that unit's own provenance; the private package was not re-read in this batch); the app's `pageLinks.ts` imports them from that package, so the unit stands in for the import. Peer. `lws-vault-sets`: `idFromUri` (equal to the app's), `VaultRecordRef` (a type). Peer.

Named changes, and only these:

1. in `linkedAnswers.ts` the import `../vaultSets` (`idFromUri`) is `lws-vault-sets`, and its import of the type `LinkedFound` from `./listDoors` is not taken (the lines that use it are not taken); in `pageLinks.ts` the import from the package `gilb-stakeholders` is `online-card-link` and `../vaultSets` is `lws-vault-sets`;
2. the comment on `deletedIds` is rewritten shorter with the same facts; internal cycle, ticket and agent tags and names are removed from the other comments; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; all new, no setup file): `linkedAnswers.test.ts` (8), `pageLinks.test.ts` (10), `exports.test.ts` (2), `src/hostAgnostic.test.ts` (the same host-agnostic check test as the other units). The app has no unit test of `pageLinks.ts`; its test of the deleted list (`linkedAnswers.r6.test.ts`, 1 test) also calls `forgetLinkedRecords` and `forgetLinkedFinds`, which are not taken, so it is left out; its cases (a new id tells once and moves the revision, the same id tells nothing, the unsubscribe stops it) are in `linkedAnswers.test.ts`. The tests that follow these functions through screens (`useStakeholderListReader.r5delete.test.tsx`, `RecordGrid.*`, `OnlineStakeholderCard.*`, `signOut.m3f.test.ts`) go through the app's whole page and are left out.
