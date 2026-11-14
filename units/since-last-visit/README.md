# since-last-visit

## What this is

Since your last visit: remembers what a list looked like when the person was last here, and says what other people added, changed or deleted since (new records, changes, activity), with an optional dismissible banner. It works on the listing the app already has (ids, `updatedAt`, and `statedBy` when the records carry it), holds no type name and makes no network call.

**Replaces in run 9:** `app/src/visit/sinceLastVisit.ts` (the snapshot, the diff, `noteOwn`, `ago`) and `app/src/ui/SinceBanner.tsx`. What stays in the app: reading the listing and the ended listing from the vault, and the key.

## Use

```ts
import { recordVisit, noteOwn } from "@kaigilb/gilbplatformcode-since-last-visit";
import { SinceBanner } from "@kaigilb/gilbplatformcode-since-last-visit/banner";
import "@kaigilb/gilbplatformcode-since-last-visit/since-banner.css";

const key = `myapp:visit:${principal}:${vaultId}`;               // one per person and per list
const items = records.map((r) => ({ id: r.id, updatedAt: r.updatedAt, label: r.name, statedBy: r.statedBy }));
const ended = endedRecords.map((r) => ({ id: r.id, updatedAt: r.updatedAt }));   // optional: the deleted ones

const changes = recordVisit(localStorage, key, items, { me: [actor, principal], ended });
// first visit: []. Later: what others added / changed / deleted since. The visit is written in the same call.

<SinceBanner changes={changes} onDismiss={() => setChanges([])} />
```

- `readVisit(store, key)` and `writeVisit(store, key, at, listing?)` are the two halves; `diffVisit(previous, current, { me, ended?, whoLabel? })` is the pure diff. `recordVisit` is read, diff, write in one call.
- Each change is `{ kind: "added" | "changed" | "deleted", id, label, who, at }`, newest first. Changes whose `statedBy` is in `me` (one address or a list) are left out.
- The first visit (nothing stored) shows nothing. A store that refuses to read or write is ignored: the banner is a courtesy and never an error.
- `noteOwn(store, key, { added: { id, label } } | { deleted: { id } })` after the person's own add or delete, so the next visit does not call it someone else's.
- The store is anything with `getItem` and `setItem` (`localStorage`), or `null` for none.
- `SinceBanner({ changes, onDismiss, words, shown, now })` is a `role="status"` polite live region with real buttons: "+N more" shows the rest, "Dismiss" hides it and calls `onDismiss`. `words` replaces any text (heading, the three verbs, the buttons, the time). `since-banner.css` is plain CSS in `:where()` over the style-runtime tokens (`--surface`, `--ink`, `--line`, `--accent`, `--ink-faint`), so the app's own CSS wins.

## Limits (read before you promise anything)

- The visit time is this device's clock; `updatedAt` is the platform's. A clock that is a minute out can hide or show a change from that minute.
- The memory is per device and per browser profile (it lives in the store you pass). Another device has its own last visit; clearing site data forgets it.
- A deleted record keeps no facts: a delete says `who: "someone"`, and a delete is told only for a record this device had listed at the last visit and only when you pass `ended`.
- A record added and removed again between two visits is never seen.
- Without `statedBy` on the records, every change is by "someone", and the person's own changes cannot be left out.
- A snapshot written by `writeVisit` without a listing cannot tell added from changed (it says "changed").
- `updatedAt` takes epoch ms, a `Date` or an ISO string; anything else is skipped.

## Where it came from

New code, written for EESpeed Round 9 (batch CB6) from the run-9 app's `src/visit/sinceLastVisit.ts` and `src/ui/SinceBanner.tsx`, made general: the listing is passed in (no vault read, no type name), the key and the store are the app's, the words are replaceable, and the snapshot keeps the labels only. Repository `KaiGilb/GilbPlatformCode`, commit `22ae1dfdc7e5ed84d5883664aa969612e03896b9`.

## Tests

`npm test` (31 tests): added, changed and deleted; own changes left out; the first visit shows nothing; a refusing store; `noteOwn`; the banner's roles, "+N more", dismiss and replaced words.
