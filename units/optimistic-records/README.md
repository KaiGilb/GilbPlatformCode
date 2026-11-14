# optimistic-records

A list of records that shows an add, an edit and a delete at once, rolls a failed write back, and keeps a delete waiting for an Undo before it is sent.

## What this is

A list of records that shows an add, an edit and a delete at once, rolls a failed write back, and keeps a delete waiting for an Undo before it is sent.

One React hook, `useRecordList`, no data library. You pass four calls (`list`, `create`, `update`, `remove`) and the name of the id field; the hook keeps the list on screen while those calls run. Nothing in it knows what a record is, which vault it lives in, or how it is stored. Run 9's PictureRecords app wrote this by hand as `useCameras` (200 lines); the generic part is this hook.

```ts
const { items, loading, error, add, edit, del, undo, pending, flushPending, reload, isSaving } =
  useRecordList<Teapot, TeapotDraft, TeapotPatch>({
    list: () => api.list(),
    create: (draft) => api.create(draft),
    update: (item, patch) => api.update(item, patch),
    remove: (item) => api.remove(item),
    key: "id",
    sort: (a, b) => a.name.localeCompare(b.name),
    onProblem: (err, where) => toast(describeError(err)),
  });
```

## The API

`useRecordList<T, D = Partial<T>, P = Partial<T>>(options)`. `T` is the record, `D` the draft of a new one, `P` a patch.

Options:

- `list(): Promise<readonly T[]>`, `create(draft): Promise<T>`, `update(item, patch): Promise<T>`, `remove(item): Promise<void>`: yours. `create` and `update` answer the record as the store now holds it.
- `key`: the NAME of the id field (`"id"`), not a function.
- `undoMs` (default `10000`), `sort(a, b)` (omitted: the order `list` gave, new records last).
- `onProblem(err, where)`: every failed load, add, edit or delete. `where` is `{ action: "load" }`, `{ action: "add" }`, `{ action: "edit", id }` or `{ action: "delete", id }`. It is called after the list is back to what the store holds. Turning `err` into a sentence is yours (see `refusal-detail/describe`).
- `optimisticItem(draft, tempId)` and `optimisticEdit(item, patch)`: build the record shown meanwhile. Defaults: the draft with `key` set to the temporary id, and the record with the patch spread over it.
- `flushOnHide` (default `true`): see "Leaving".

Result:

- `items`, `loading` (until the first `list` has answered or failed), `error` (the last `list` failure, else `null`; `items` keep what they were).
- `add(draft): Promise<T | null>`: the record is in `items` at once under a temporary id (`saving-1`, ...); when `create` answers, the real record takes its place. On failure it vanishes, `onProblem` is told, and the promise answers `null`.
- `edit(id, patch): Promise<T | null>`: the change is in `items` at once. Writes to ONE record go one after another, and each is made from the last record the store answered, so a second quick edit carries the first's new version. On failure the record goes back to what the store holds. A record that is not shown, is still being added, or waits for its delete is ignored (`null`, no call).
- `del(id)`: the record leaves `items` at once and joins `pending`; `remove` is called after `undoMs` unless `undo(id)` (it answers `true` when there was a delete to take back). Several can wait together, each on its own clock; `undo(id)` takes back only that one. A delete that fails brings the record back and tells `onProblem`. A record not shown or still being added is ignored.
- `pending`: the records whose delete waits, oldest first. Show your Undo bar from it.
- `flushPending(): Promise<void>`: makes every waiting delete real now and resolves when all are done. It never rejects. Call it before a sign-out or a vault switch drops the credential.
- `reload()`: reads the list again. A waiting delete stays hidden, an add or an edit still being written stays shown, and an older `reload` that answers late never wins over a newer one.
- `isSaving(id)`: true while a write for that id (a temporary id too) has not been answered. Use it to dim a row.

## Leaving

A waiting delete is made real when the component unmounts (React 19 StrictMode's test unmount has nothing waiting, so it is harmless) and, with `flushOnHide` on, when the page is hidden (`visibilitychange` to `hidden`) or closed (`pagehide`). The timers are cleared, so `remove` is called once.

## What this is not

- Not a cache and not a data library: no keys, no refetch on focus, no retries. `reload()` is yours to call.
- Not offline storage. "Offline-friendly" means the screen does not wait for the network and a failure puts it back; nothing is kept across a page load, and an add that was never answered is lost with the page.
- Not an error translator: `onProblem` gets the raw error.
- Not a form: the draft and the patch are whatever your `create` and `update` take.

## How to take it

Package `@kaigilb/gilbplatformcode-optimistic-records`. Peer: `react` (^19). Nothing else. Put `install-links=true` in your app's `.npmrc` so the unit is installed as a copy. Key the screen that holds the hook by the vault (or anything else `list` depends on) so a switch starts with fresh state, and call `flushPending()` first.

## What the host must supply

The four calls and `key`. No origin, no credential and no type: the unit never calls anything itself.

## Module state

None. The state is per mount, in refs and React state.

## Where it came from

New code, written for EESpeed Round 9 (batch CB5) from the run-9 PictureRecords app's `src/records/useCameras.ts` (an optimistic add, edit and delete with an Undo bar). Repository `KaiGilb/GilbPlatformCode`, base commit `22ae1dfdc7e5ed84d5883664aa969612e03896b9`. Changes from `useCameras`: nothing is about cameras, pictures or `statedBy`; the temporary item, the sort, the problem report and the Undo wait are parameters; several deletes may wait together (`useCameras` made the first real when a second began); writes to one record go one after another from the last stored version; `onProblem` takes the raw error.

## Tests

`npm test` (vitest, jsdom, fake timers): load and its failure, a late older reload; add (at once, swapped for the real record, failed write rolled back, two in flight, `optimisticItem`); edit (at once, rolled back, two quick edits one after the other, the first failing, ignored cases); delete and undo (default and set wait, undo, a refused delete, two quick deletes, ignored cases); `flushPending`, unmount, a hidden page, `flushOnHide: false`; `reload` with a waiting delete and an add in flight; the source names no kind of record and imports only React; the host-agnostic check with planted faults.
