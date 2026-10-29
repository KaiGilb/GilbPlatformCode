# contact-rows-model

Reads, merges and patches the Email, Phone and Social rows of a person card.

## What this is

Reads, merges and patches the Email, Phone and Social rows of a person card.

Plain functions and types, no React, no imports, no reads and no writes. A person record keeps a multi-valued contact field (Email, Phone, Social, and a fourth, Skills) as two facts: the field's term, a list of values, and a sidecar term with one entry per row, `{ type, label?, order, access, valueIndex }`, keyed `email`, `emailPrivate`, `email2`, ...; `phone`, `phone2`, ...; `account`, `account2`, ...; `skill`, `skill2`, ... (the profile app's data format, so either app reads the other's rows). The caller passes both facts in as served and gets rows back, or hands rows in and gets the patch that stores them.

- `readContactRows(kind, { values, meta })`: the rows for the served facts, in the sidecar's order (equal orders broken by key). Rows are paired with values by each entry's `valueIndex`, never by position (by position only when no entry has a `valueIndex`). Other kinds' entries are ignored. A value no entry speaks for is shown as its own row, never dropped. A single value served as a plain string is one row. The sidecar may be an object or a JSON string; anything else is no sidecar.
- `contactRowsPatch(kind, rows, servedMeta)`: `{ values, meta }`, where `values` is the non-empty row values in row order (`null` when there are none) and `meta` is the served sidecar with every entry of this kind replaced (`order`, `access`, `label`, `valueIndex`) and every other entry kept. A row keeps its stored `order` and `access`; a new row goes after every stored entry and is `private`. An empty row stays in the sidecar with no `valueIndex`. A row the person removed is written as an explicit `null` entry.
- `nextContactKey(kind, rows)`: the key for the next row: the kind's base key first, then (email only) `emailPrivate`, then `base2`, `base3`, ... A gap is filled first.
- `mergeContactRows(kind, base, mine, fresh)`: the rows to resend after a 412 (the stored state moved while the person edited). `base` is the rows as last stored, `mine` the person's rows now, `fresh` the rows as stored now. Only the person's own changes are applied to `fresh`: a removed row is dropped, a changed row (value, label or reference) takes the person's version, an added row is appended (re-keyed when its key was taken meanwhile), every other fresh row is kept.
- `hasWorkPrivate(kind)`: true for email only (its rows carry a Work / Private label).
- `readEmailRows`, `nextEmailKey`, `emailRowsPatch`: the email case of the three shared functions, under the names the first email-only version had. Same behaviour.
- Types: `ContactKind` (`"email" | "phone" | "social" | "skill"`), `ContactRow` (`{ key, label, value, ref? }`), `ContactValue` (`string | { "@id": string }`), `EmailRow`.

Labels: an email row without a stored label reads `Work` (`Private` for the key `emailPrivate`); phone and social rows have a label only when one is stored; a social row with no address has no label. A legacy `tel:` prefix on a phone value reads as the bare number. For a Skills row, `ref` is the catalogue referent: written as the reference `{"@id": ref}` on the term, with the skill's name cached as the entry's `label`; an older sidecar `functionUri` is read as that reference.

## What this is not

- Not a reader or a writer of a vault: it takes served facts and returns a patch. The fetch, the write and the retry on 412 are the host's.
- Not the term lookup. The spellings of the field's term and the sidecar term (`a/email`, `a/phone`, `a/account`, `a/fieldMeta`) are looked up by the caller; this unit only knows the sidecar's entry types and key prefixes.
- Not a form or any markup.
- Not the order of the sections on a card.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-rows-model`

From a clone of this repository, install the unit's folder; no peer comes first:

```sh
npm install <path-to-the-library>/units/contact-rows-model
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do. The folder `src/__fixtures__` is a test fixture and is not exported.

## Examples

```ts
import { readContactRows, contactRowsPatch, mergeContactRows, nextContactKey } from "@kaigilb/gilbplatformcode-contact-rows-model";

const served = { values: ["+47 900 00 000"], meta: { phone: { type: "phone", order: 3, access: "private", valueIndex: 0 } } };
const rows = readContactRows("phone", served);                   // [{ key: "phone", label: "", value: "+47 900 00 000" }]
rows.push({ key: nextContactKey("phone", rows), label: "", value: "+1 555 0100" }); // key "phone2"
const patch = contactRowsPatch("phone", rows, served.meta);
// patch.values -> ["+47 900 00 000", "+1 555 0100"]; patch.meta.phone2 -> { type: "phone", order: 4, access: "private", valueIndex: 1 }

// after a 412: re-read the fresh rows and apply only my changes
const resend = mergeContactRows("phone", rowsAsLastStored, rows, freshRows);
```

## What the host must supply

Nothing at run time. The caller gives the served `values` and `meta` (the field's term and the sidecar term, each already looked up by the caller), and writes the patch.

## Do not

- Do not pair values with rows by position when the sidecar has `valueIndex`: the pairing is by `valueIndex` (the module does this).
- Do not treat the entry `type` (`email`, `phone`, `social`, `skill`) or the key prefixes as fact names or labels. They are the sidecar's data format.
- Do not drop a row's entry from the sidecar by omitting it: send the row, or let `contactRowsPatch` write the explicit `null` for a removed one, so a merge that recurses into the sidecar drops it too.
- Do not pass a reference value for email, phone or social. Only a Skills row reads and writes a reference; the other kinds read literals only.

## Wrong readings

- "Social uses the key `social`." The kind is `social`; the sidecar type is `social`; the keys are `account`, `account2`, ...
- "An empty row is dropped on save." It is kept in the sidecar (its structure), with no `valueIndex`; only the values list leaves it out.
- "A new row is public." It is `private`; the holder's own record publishes nothing.
- "`mergeContactRows` merges two edits field by field." It works per row: a row the person changed takes the person's whole version.
- "`readEmailRows` differs from `readContactRows("email", ...)`." It is the same call.

## Where it came from

`KaiGilb/GilbApp` (private repo), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/contactRows.ts` lines 1-265 (whole file) to `src/contactRows.ts`.
- `src/lib/base/__fixtures__/emailRowsIt3.ts` lines 1-127 (whole file; a test fixture, the email-only first version, used as the oracle for the email case) to `src/__fixtures__/emailRowsIt3.ts`.

Comments made generic (cycle, iteration and ticket tags, person names, agent names and the other app's name removed); no code change.

`src/index.ts` is new: it re-exports `contactRows.ts`. The tests: the source's three test files (`contactRows.*.test.ts`, 32 tests) ported, 30 of them (hosts renamed to `example.test`, a handle `@kai` renamed `@ann`); the 2 tests of a person card's section order are left out because they import another module of the app (`personName`), which is not in this unit. A fourth file pins every export.
