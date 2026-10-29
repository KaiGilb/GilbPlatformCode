# stakeholder-list-state

The session's memory of the Stakeholders list: the kept answers of its reads, the ids of the records deleted or ended in this session, and the links of the records a page and the screen carry, each with its listeners, kept once for the page's life.

## What this is

The session's memory of the Stakeholders list: the kept answers of its reads, the ids of the records deleted or ended in this session, and the links of the records a page and the screen carry, each with its listeners, kept once for the page's life.

Plain functions and maps, no React, no network. Each piece of state is a set or a map with a list of listeners and a revision number, so a screen can follow it with `useSyncExternalStore`. The unit holds the WHOLE of the app's two state files, `linkedAnswers.ts` and `pageLinks.ts`, so the state of the list lives in one place and the list's doors (`stakeholder-list-doors`) and every screen read and write the same copy.

- **The kept up-front answers** (`linkedAnswers`). `memberAnswers` (member key to the record addresses its find named, and whether every one was read), `recordReads` (record address to its read as the list takes it, or `null` for gone) and `screenAnswerUntil` (the time a screen-given answer lapses) are plain maps the doors read and write. `screenAnswerLapsed(key, now?)` says whether a screen-given answer has lapsed. `keptResolve(key, ask)` shares an anchor ask while it is in flight and keeps nothing after it answers or fails. `forgetLinkedFinds()` forgets the finds, the reads, the screen's answers and the joined ids (a link write), keeping what the session knows is deleted or ended. `forgetLinkedRecords()` forgets everything, including the deleted and ended ids and the asks in flight (sign-out), and tells the listeners of the lists that were not empty.
- **The session's deleted list.** `forgetDeletedLinkedRecord(id)` adds a record (an id, or an address, which is cut to its last segment) and tells the listeners once; the same id again tells nothing. `deletedLinkedRecords()` is a copy of the set, `deletedLinkedRevision()` a number that moves by one with every change, `onDeletedLinkedRecords(listener)` follows it and answers the unsubscribe. `isDeletedLinkedRecord(uri)` is true for a deleted id and for an id taken as ended. The record hooks' delete watcher calls the writer once a DELETE has landed, so the Stakeholders list never draws a deleted record again from what a page kept.
- **The joined and the ended ids.** `noteJoinedLinkedRecord(uri)` and `wasJoinedLinkedRecord(uri)` keep the ids this session saw resolve to a person or an organization; a 404 is taken as "ended" only for one of them. `forgetEndedLinkedRecord(uri)` adds an id to the ended set and tells its listeners with a copy of the whole set; `relistLinkedRecord(uri)` takes it back when a page lists it again; `endedLinkedRecords()` is a copy; `onEndedLinkedRecords(listener)` follows it; `isKeptLinkedRecord(uri)` says whether the up-front read kept a record (read as a record, not as gone).
- **The page links** (`pageLinks`). `notePageLinks(rows)` keeps, for each row that carries a body, the link (`a:sameAs`) read by `readLink` of `online-card-link`: `{ state: "none" }`, `{ state: "linked", target }`, `{ state: "ambiguous" }` or `{ state: "malformed" }`. A row without a body is skipped; a link that did not change tells nothing; one page tells once. `pageLinkOf(id)` reads one, `forgetPageLink(id)` forgets one (the record hooks' delete calls it) and tells only if it was kept, `forgetPageLinks()` forgets all, `onPageLinks(listener)` and `pageLinksRevision()` follow it.
- **The screen's links, per holder.** `setScreenLinks(holder, owners, groups?)` replaces the holder's screen (the person's one row, and every loaded record linked to them) and always tells; `screenRecordLinkedTo(holder, principal)` and `screenLinkedRecordsOf(holder, principal)` read it; `newestLinkedId(ids)` is the one rule for which linked record is a person's row (the greatest id); `forgetScreenLinks()` forgets every holder and tells; `onScreenLinks(listener)` and `screenLinksRevision()` follow it.
- **The rows seen in view.** `noteRecordInView(entityUri)` keeps an address once and tells once; `recordsInView()`, `onRecordsInView(listener)` and `forgetRecordsInView()`.

The type `LinkedFound` (`{ vaultId, record }`, with `record` a `ListedRecord` of `stakeholder-list-reader`) is declared here, beside `recordReads` that holds it. In the app it is declared in the doors file; see "Changes in 0.2.0".

## Module state

The unit holds module state, and an app must have ONE copy of it. Two installed copies would each keep their own lists: a delete made through one would not be seen through the other, and the doors would read answers the screen never wrote. It is a peer of every unit that touches it: `plan-record-hooks` (which writes the deleted list and the page links), `stakeholder-list-doors` (the one reader and writer of the kept answers), the stakeholder IO and card host units, and every screen that follows it.

In `linkedAnswers`: `memberAnswers`, `recordReads`, `screenAnswerUntil` and `resolveAnswers` (maps); `deletedIds`, `joinedIds`, `endedIds`, `deletedListeners` and `endedListeners` (sets); `deletedRev` (a counter).
In `pageLinks`: `links` (a map); `listeners`, `screenListeners`, `inViewListeners` and `inView` (sets); `screens` (a map); `revision` and `screenRevision` (counters).

## What this is not

- Not a store of records. It keeps ids, addresses, link readings and the list's own read results, never a record of the platform.
- Not persisted. Nothing here is written anywhere; a reload empties all of it.
- Not the reader of the list, and not its doors: the doors that fill `memberAnswers` and `recordReads` are `stakeholder-list-doors`.

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

The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-records` does. `@tanstack/react-query` is a dev dependency only (a peer of `lws-vault-sets`); the unit does not call it. Its peers are `lws-vault-sets` (`idFromUri`, `VaultRecordRef`), `online-card-link` (`readLink`, `LinkReading`) and, for one type, `stakeholder-list-reader` (`ListedRecord`); `node scripts/peers.mjs units/stakeholder-list-state` prints the 15 units of the install.

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

Nothing. There are no settings and no host object. The peers carry no settings of their own that this unit reads.

## Do not

- Do not install a second copy of this unit (see above).
- Do not keep a reading of `deletedLinkedRecords()` across a change: it is a copy. Follow it with `onDeletedLinkedRecords` and read it again.
- Do not call `notePageLinks` with rows read without bodies and expect a link: they are skipped.

## Wrong readings

- "`forgetDeletedLinkedRecord` needs the record's address." It takes an id or an address and keeps the last segment; a record id names one record on the platform whichever host spells its address.
- "A deleted id can be taken back." It cannot in this unit: nothing removes a deleted id except `forgetLinkedRecords` (sign-out). An ENDED id can be taken back (`relistLinkedRecord`).
- "`onPageLinks` listeners are told for each row." They are told once for a page, after the whole page is kept.
- "`recordsInView()` is a copy." It answers the live set, so a caller that keeps it sees later rows. Kept as the app has it.
- "`forgetRecordsInView()` tells its listeners." It does not; only `noteRecordInView` does. Kept as the app has it.
- "`setScreenLinks` tells only when something changed." It tells on every call, even with the same maps.
- "`forgetLinkedRecords()` tells every listener." It tells the deleted listeners and the ended listeners, each only if its set was not empty; the page-link and screen-link listeners are not told (their own `forgetPageLinks` and `forgetScreenLinks` do that).
- "`keptResolve` keeps an answer." It shares an ask only while it is in flight; once answered or failed, the next ask is sent again.
- "A listener of the ended set gets the live set." It gets a copy taken at the moment of telling.
- `newestLinkedId` compares ids as text, so "9" is greater than "10"; the platform's ids are time-ordered text of one length, which is why the app's rule holds.

## Changes in 0.2.0

The unit now holds the whole of the app's `linkedAnswers.ts` and `pageLinks.ts` (re-copied from GilbApp `9a602ea7`), so that all module state of the Stakeholders list is in one unit (RuleGhsSingletonPeer). Before, it held only `linkedAnswers.ts` lines 72-90 and 130-159 and `pageLinks.ts` lines 13-53 and 136-151, cut at `dcfc18b3`.

- **Re-sync check.** Both whole files at `dcfc18b3` and at `9a602ea7` are byte-equal, so every range already taken is unchanged. All the old code tokens survive, in order, in the new files.
- **New exports** (`linkedAnswers`): `memberAnswers`, `recordReads`, `screenAnswerUntil`, `screenAnswerLapsed`, `keptResolve`, `isDeletedLinkedRecord`, `forgetLinkedRecords`, `forgetLinkedFinds`, `noteJoinedLinkedRecord`, `wasJoinedLinkedRecord`, `isKeptLinkedRecord`, `forgetEndedLinkedRecord`, `relistLinkedRecord`, `endedLinkedRecords`, `onEndedLinkedRecords` and the type `LinkedFound`. (`pageLinks`): `newestLinkedId`, `onScreenLinks`, `screenLinksRevision`, `setScreenLinks`, `screenRecordLinkedTo`, `screenLinkedRecordsOf`, `forgetScreenLinks`, `noteRecordInView`, `recordsInView`, `onRecordsInView`, `forgetRecordsInView` and the type `ScreenLinkedRecord`. The old exports are unchanged.
- **`LinkedFound` moved.** In the app, `linkedAnswers.ts` imports the type `LinkedFound` from the doors file (`listDoors.ts` line 323), and the doors file imports `linkedAnswers.ts`. Two units cannot peer each other, so the declaration (`{ vaultId: string; record: ListedRecord }`, one line) is here, and the doors unit imports it from here. `ListedRecord` is the type of `stakeholder-list-reader`, which is therefore a new peer (a type import only; nothing of it runs here). The units that install this one now install four more (`credential-surface`, `person-connections`, `record-sync`, `stakeholder-list-reader`).
- **Tests.** Three tests ported from the app (`linkedAnswersDeleted.test.ts` 1, `keptResolve.test.ts` 2) and every new export pinned (`linkedAnswersState.test.ts`, `pageLinksScreens.test.ts`).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6` (0.1.0 was cut at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`; the two files are byte-equal at both), copied by script, each file whole:

- `src/lib/base/stakeholderList/linkedAnswers.ts` lines 1-246 to `src/linkedAnswers.ts`;
- `src/lib/base/stakeholderList/pageLinks.ts` lines 1-183 to `src/pageLinks.ts`.

**Dynamic imports in the files taken: none** (both files were searched with `grep "import("`).

**Merged units compared with the app's functions and taken as peers** (token streams of each declaration, comments excluded; `idFromUri`, `VaultRecordRef` and `readLink`, `LinkReading` were compared again at `9a602ea7`): `lws-vault-sets`: `idFromUri` and `VaultRecordRef` are equal to the app's. `online-card-link`: `readLink` and `LinkReading` are equal to the copy in `gilb-stakeholders` that the app pins (the private package's own file, at the commit the app pins). `stakeholder-list-reader`: `ListedRecord`, a type, is the package's type the app's doors file imports.

Named changes, and only these:

1. in `linkedAnswers.ts` the import `../vaultSets` (`idFromUri`) is `lws-vault-sets`; the import of the type `LinkedFound` from `./listDoors` is the import of the type `ListedRecord` from `stakeholder-list-reader`, and the one-line declaration `export type LinkedFound = { vaultId: string; record: ListedRecord }` (`listDoors.ts` line 323) is moved here, so this unit does not depend on the doors unit that depends on it;
2. in `pageLinks.ts` the import from the package `gilb-stakeholders` (`readLink`, `LinkReading`) is `online-card-link` and `../vaultSets` is `lws-vault-sets`;
3. comments: internal cycle, round, ticket and agent tags and names are removed or reworded with the same facts; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; no setup file): `linkedAnswers.test.ts` (8, new), `pageLinks.test.ts` (10, new), `linkedAnswersDeleted.test.ts` (1, ported from the app's `linkedAnswers.r6.test.ts`), `keptResolve.test.ts` (2, ported from `linkedAnswers.sp1r3.test.ts`; the answer is released by hand instead of after 5 ms), `linkedAnswersState.test.ts` (new, every other `linkedAnswers` export), `pageLinksScreens.test.ts` (new, the screen's links and the rows in view), `exports.test.ts` (new, the export list) and `hostAgnostic.test.ts` (the same host-agnostic check test as the other units). The tests that follow these functions through screens (`useStakeholderListReader.r5delete.test.tsx`, `useStakeholderListReader.r7screenStart.test.tsx`, `RecordGrid.*`, `OnlineStakeholderCard.*`, `signOut.m3f.test.ts`) go through the app's whole page and are left out; the doors' tests that use this state go to `stakeholder-list-doors`.
