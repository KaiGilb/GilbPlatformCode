# record-autosave

## What this is

Saves a record's fields as the person types: no Save, no Cancel, no Edit mode.

A record screen is a set of boxes. While the record is not read, the fields cannot be typed in. The person types in one and it reaches the vault by itself; nothing asks them to confirm. This unit is the record-wide form of `useAnnotationDraft` in `contact-annotation` (one field there, every field of the record here), with the same three nets and the same care:

- `useAutosaveRecord({ stored, write, check?, delayMs?, readOnly?, onSaved? })`: holds what the vault holds (`stored`) and what the person typed on top of it, and writes ONLY the changed fields, in one request, 400 ms (`AUTOSAVE_DELAY_MS`) after the last keystroke, at blur (`flush`), and with `keepalive` when the page is hidden or the screen is left. It returns `values`, `set(name, value)`, `text(name)` (the props of a text box), `flush`, `retry`, `state` (`idle | pending | saving | saved | invalid | error`), `error` and `problems`.
- Nothing is written while `stored` is `null` (not read yet, or the read failed): `set()` does nothing and `text(name).readOnly` is true. A value set back to what the vault holds is not written. A field `check` refuses is never written; the other fields still are. At most one write is in flight; a change made meanwhile is written when it answers; the same fields are not sent twice (a reload fires both `pagehide` and `visibilitychange`). A refused write stays retryable and keeps the person's edits. A write that lands is reported with `onSaved(written)`, and is remembered until the vault's own value has caught up, so a read older than the write never puts the old text back. If the page is going away while a write is in flight, the newer fields are sent at once with `keepalive`. Two writes overlap only while the page is leaving, and the vault keeps the one that arrives last; on screen the newer write's value stays whichever answers first. After a re-read the state is worked out again (a `saved` or `saving` stays; an `error` with something still unsaved stays, so the person sees it failed). When `readOnly` turns true, unsaved edits are dropped. A field with a problem makes the state `invalid`, never `saved`.
- `SaveStateLine({ state, error, onRetry?, words?, testId? })`: the line "Not saved yet…" / "Saving…" / "Saved" / "Not saved: <the failure's own words>" with "Try again". At `idle` it is an empty polite live region, so a later text is announced. `SAVE_STATE_WORDS` are its words; `words` replaces any of them.
- `sameValue(a, b)`: equality by value (objects in any key order, arrays by position).

## What this is not

- Not a Save button. There is no Save, no Cancel and no Edit mode in a GilbPlatform app; the save is automatic and made reliable.
- Not a local draft store. The vault is the data of record: this writes sooner, it never keeps a draft on the device.
- Not the record client. The caller's `write` calls `patchRecord` of `lws-records` (or any other transport); this unit knows no route and no host.
- Not for an act that is not a field edit. Delete, Share and Give access keep their own confirmation and button row.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-autosave`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/record-autosave` prints:

```sh
npm install --install-links react@^19.0.0 <path-to-the-library>/units/record-autosave
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

In the GilbApp chat, a project folder the chat made already has this line: the bridge writes it when it makes the folder. A coding agent may not write `.npmrc` (Claude Code refuses it as a sensitive file), so when the line is missing it asks you to add it, and until then it passes `--install-links` to every `npm install` and `npm ci`.

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

`src/recordAutosave.css` (import `@kaigilb/gilbplatformcode-record-autosave/recordAutosave.css`) styles the save line with the classes `autosave-line` and `autosave-line--<state>`. It uses only the page's variables, each with a fallback: `--ink-faint` (saved), `--ink` (not saved yet, saving) and `--bad` (not saved). No Tailwind.

## Examples

A record screen with two fields, written with `lws-records`:

```tsx
import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { useAutosaveRecord, SaveStateLine } from "@kaigilb/gilbplatformcode-record-autosave";

const r = useAutosaveRecord({
  stored: rec ? { fruitName: rec.facts.fruitName ?? "", placeName: rec.facts.placeName ?? "" } : null,
  write: (changed) => patchRecord(rec!.id, changed, rec!.entityUri ?? null).then(() => undefined),
  readOnly: !ctx.vault.canWrite,
});

<label>Fruit name <input {...r.text("fruitName")} /></label>
<label>Place name <input {...r.text("placeName")} /></label>
<SaveStateLine state={r.state} error={r.error} onRetry={r.retry} />
```

`stored` may be a new object on each render: only a change of its values counts as a new read.

`patchRecord(id, patch, at, source?, precondition?)` takes the patch as `Record<string, MergePatchValue>`; `changed` (a `Partial` of the two string fields) goes in as it is. `test/example.typecheck.tsx` is this example, typechecked by `npm run typecheck` against that signature.

A new record is made at once when the person adds one (`createRecord` with an `idempotencyKey`), and its screen opens with the fields ready to type in; there is no "Save" to make it.

## Tests

102 tests in 6 files (`npx vitest run`, fake timers, no wall-clock waits):

- `useAutosaveRecord.tester.test.tsx` 10: the tester's cases (a `stored` rebuilt inline on every render, a keepalive write when the page leaves with a write in flight, `invalid` never shown as `saved`, read-only turning on, StrictMode, a failure with a follow-up waiting, a stale re-read, `check` valid to invalid to valid).
- `useAutosaveRecord.tester2.test.tsx` 14: the second tester's cases (state after a re-read, a write landing while the vault is not read, an older write answering late, page-leave duplicates, read-only switched on and off, a field written twice).
- `useAutosaveRecord.test.tsx` 49 (also: the state after a re-read; an error that stays or ends; a field written twice and a stale read; an older write answering late; a new object with the same values is not a re-read; a stale re-read keeps a landed write; the vault catching up; another writer winning; the person's edit staying on screen; read-only turning on drops edits; a failure clears the waiting write; `check` across fields): one write for three keystrokes; `flush`; two fields in one write; a value set back is not written; objects compared by value; stored `null` cannot be typed in and writes nothing (set, flush, `pagehide`, unmount); an edit then a failed re-read writes nothing; read-only while not read; the follow-up write after unmount has `keepalive`; one write in flight and the next after it answers; `pagehide` + `visibilitychange` give one write with `keepalive`; unmount flush without a state warning; listeners registered once; a refused write (error text verbatim, edits kept, `retry`, next `set`); `check` (invalid state, other fields still written); read-only; a re-read keeps unsaved edits and drops settled ones; `onSaved`; `text()`.
- `SaveStateLine.test.tsx` 11: an empty live region at idle, each word, roles, Try again, `words`, `testId`, an axe check of the error state.
- `sameValue.test.ts` 5, `hostAgnostic.test.ts` 13 (the same host-agnostic check test as the other units).

## Where it came from

New code, written for this repository on 2026-11-22. Repository `KaiGilb/GilbPlatformCode`, base commit `c138d503d1ac6a24c3187ec207ec8fdd7675d49a`. The machine is taken from `useAnnotationDraft` in `units/contact-annotation` and generalised from one annotation field to every field of one record, with the transport passed in as a function; no code was copied. Copied from `contact-annotation`, as every unit carries its own: `scripts/check-host-agnostic.mjs` (with this unit's list of allowed imports) and `src/hostAgnostic.test.ts`.
