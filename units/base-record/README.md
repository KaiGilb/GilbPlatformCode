# base-record

The record shapes the Plan units read, as TypeScript types: a record as the app holds it, the document the vault served for it, and one row of the record list.

## What this is

The record shapes the Plan units read, as TypeScript types: a record as the app holds it, the document the vault served for it, and one row of the record list.

Three types and nothing else, exported with `export type`. They are the shapes the Plan units take as arguments (a Function, Solution, Value or Development Resource record, a list of them, a served fact):

- `BaseRecord`: one record. Required: `id` (the opaque record id), `typeUri` (the absolute type address, `https://<host>/base/t/<Type>`), `facts` (the typed facts, `Record<string, string>`, keyed by the bare attribute name), `opaqueFacts` (`readonly string[]`: the keys in `facts` whose string is a stand-in for a value the editor cannot show as a string, handed over as `""`; an empty array means nothing was lost) and `etag` (`string | null`: the strong ETag, the If-Match token for the next write). Optional: `entityUri` (the canonical entity address from the framed `@id`), `typeSubstituted` (`true` only: the type is the app's "unknown" marker `t:Resource`, put there because the document named no type, or a stub awaits hydration; such a record is never a Development Resource card), `servedKeys` (the keys in `facts` that came off the vault's own served document; absent means no served document stands behind the record) and `served` (a `ServedDocument`).
- `ServedDocument`: the facts of one served record document, unflattened. All read-only. `facts` (bare name to the served value, verbatim: a string, number, boolean, `{ "@id" }`, object or array), `context` (the document's own `@context`), `etag` (the ETag it was served with) and, optional, `prefixedKeys` (the names the document served as `a:<name>` and not under the term's own name).
- `GridRecord`: `BaseRecord` plus `updatedAt: number` (required: the working-set time, used to merge-sort records into one recency list) and, optional, `hydrated` (`boolean`: true when the row's content was read from the vault, false when only its membership is known and the content read failed; absent means unknown, not failed) and `endingActorKind` (`"holder"` or `"agent"`: who ended the record, present only on a list of deleted records).

There is no function, no constant and no class: the unit has nothing at runtime.

Wire vocabulary the types name, verbatim from the code: the fact keys are bare (`title`) while the vault stores them as `a:<name>`; a served link is `{ "@id": <address> }`; the type address is `https://<host>/base/t/<Type>`; the ETag is `"sha256:<hash>"`.

## What this is not

- Not a reader or a writer. Nothing here reads a record from a vault or writes one. The types describe the result of a read that the host did.
- Not the older copy in `value-card-model`. That unit (shipped earlier) carries its own copy of `BaseRecord` and `ServedDocument`, the same text as here (compared with comments stripped: identical). It is not changed by this unit. Both are structural types, so a record typed by one is accepted where the other is wanted. The Plan units that come after this one import from here.
- Not the whole of the app's record module. The source file also holds the record client, the errors and the create/patch value types; none of them is here.

## How to take it

Package: `@kaigilb/gilbplatformcode-base-record`

No peers. Put this line in your app's own `.npmrc`, as for every unit that has peers (it is harmless here, and the units that import this one need it):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/base-record
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import type { BaseRecord, GridRecord, ServedDocument } from "@kaigilb/gilbplatformcode-base-record";

const record: BaseRecord = {
  id: "r1",
  typeUri: "https://vault.example.test/base/t/Function",
  facts: { title: "Fast start" },
  opaqueFacts: [],
  etag: null,
};

// A list row is a record with its working-set time.
const row: GridRecord = { ...record, updatedAt: Date.now() };

// A function that wants any record accepts a list row.
const title = (r: BaseRecord) => r.facts["title"] ?? "";
title(row);
```

## What the host must supply

Nothing. The host fills the fields when it reads a record: `opaqueFacts` is required on purpose, so a producer states it (an empty array when nothing was lost) and cannot leave it out by forgetting.

## Do not

- Do not read an empty `facts` as "the record has no facts" on a `GridRecord`: when `hydrated` is `false` the content read failed. When it is absent, treat it as unknown.
- Do not build a write from `served` after a later save changed `facts`: `served` describes the document read at `served.etag` only.
- Do not set `typeSubstituted` to `false`: the type allows `true` or absence.

## Wrong readings

- "`facts` holds the served values." It holds the flat strings. The served values, with links as `{ "@id" }` and lists as lists, are in `served.facts`.
- "A missing `servedKeys` means no keys." It means no served document stands behind the record (a placeholder row or a hand-built fixture), not an empty set of keys.
- "`opaqueFacts` lists the keys that are empty." It lists the keys whose string is a stand-in for a value the editor cannot express as a string; an empty string there is not the person clearing the field.
- "`GridRecord` and `BaseRecord` are different records." A `GridRecord` is a `BaseRecord` with extra fields; every function that takes a `BaseRecord` takes it.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/lib/base/records.ts` lines 46-154 (`BaseRecord`, `ServedDocument`) to `src/records.ts`. The code is verbatim: compared with comments stripped it is identical to the same two interfaces in `units/value-card-model/src/baseRecord.ts`, which holds the same text. Comments are the ones of that unit (made generic: no person, project, cycle or host named).
- `src/lib/base/recordHooks.ts` lines 537-554 (`GridRecord`) to `src/records.ts`. Code verbatim. The comment on `hydrated` is rewritten without its change tag and without the sample record id, keeping the meaning.
- Nothing else of those two files is taken: the other types of `records.ts` (`RecordFactValue`, `RecordCreateFacts`, `RecordFacts`, `WriteSource`, `MergePatchValue`) and everything in `recordHooks.ts` are not needed by the Plan units.

`src/index.ts` is new (`export type { BaseRecord, GridRecord, ServedDocument }`). `src/records.test.ts` is new: type-level checks (run by `npm run typecheck`, which fails when a field changes its type or turns required or optional) and one runtime check that the module exports nothing. `src/hostAgnostic.test.ts` is the host-agnostic check's own test, as in the other units. No test of GilbApp is ported: the source files have no test of these types.
