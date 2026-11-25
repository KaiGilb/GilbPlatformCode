Needs: vocabulary-source

# type-fields

Reads the fields of one GilbVeda type from the ontology master: each field's value kind, one-or-many, value set, record type, required and status.

## What this is

Reads the fields of one GilbVeda type from the ontology master: each field's value kind, one-or-many, value set, record type, required and status.

Plain functions and types, no React, no credential. An attribute term on the master declares `a:fieldOf <Type>`. This unit reads every such declaration with the master's carrier read (one request), reads which slots each type requires (a second request), and derives one type's fields from the two. A table draws the fields as its columns; a card can draw the same fields as its rows. Nothing about what a type or a field is, is typed into the unit: it all comes out of the master's documents at run time.

- `readTypeFields({ vedaOrigin, fetchImpl?, signal?, pageSize?, declarations? }, typeName)`: the fields of one type, as `TypeFields`. `typeName` is the bare name (`Person`) or the anchor (`t:Person`). Two requests when `declarations` is not given, none when it is. A type that comes out with no field costs one more request, for its own term, so that "this type has no fields" is told apart from "there is no such type".
- `readFieldDeclarations({ vedaOrigin, fetchImpl?, signal?, pageSize? })`: every field declaration and every required-slot statement of the master, as `FieldDeclarations`. The two requests are made at the same time and serve every type. A host keeps the answer in its own cache.
- `fieldsOfType(declarations, typeName)`: the pure step, from declarations already read.
- `fieldIndex(declarations)`: every field the master declares, by each key a stored fact of it may carry (prefixed and bare), as a `Map`. Pure, no request. A table uses it to head and read a fact a record holds outside its type's own fields, for example a field declared on a type above. `required` is false on every entry (it is a fact about one type). When two terms publish one key, the term whose address sorts first is kept. A host builds it once per reading of the declarations.
- `fieldKindOf(encoding)`: the value kind an encoding names. An encoding that names several forms (a list of texts, or `a|b`, `a,b` inside one text) is one kind only when every form is that kind; a term that allows a link or a text is `unknown`, and its value is shown as stored.
- `encodingAsServed(doc)`: a term's encoding as the master serves it: one text, a list of texts (one live term serves a list), or null. A list stays a list.
- `TypeFieldsError` (`kind`, `status`): why the fields are not known. `kind` is `not-found` (404), `forbidden` (401 or 403), `server` (another error status), `network` (not reached), `timeout`, `not-narrowed` (a master without the carrier read), `unknown-type` (the name is not a type on this master, or not a type name), or `unreadable`.
- `FIELD_DECLARATIONS_PAGE_SIZE` (1000): the rows one page of the carrier read asks for.
- Types: `TypeFields`, `TypeField`, `FieldDeclarations`, `FieldKind`, `FieldValueSet`, `RequiredSlot`, `FieldProblem`, `ReadOptions`, `TypeFieldsErrorKind`.

One `TypeField`:

| Member | What it is | Read from |
|---|---|---|
| `anchor` | the column's key, `a:<slug>` | the term's one current spelling (`a:predicateAttribute`), or its first spelling when it offers several |
| `writeKey` | the one spelling a writer may use, or null | the same, with retired spellings removed |
| `readKeys` | every key a stored fact may carry, prefixed and bare | every spelling |
| `term`, `doc` | the term's address and its document as served | `@id`, the document |
| `label` | the heading | `a:label`, else the bare name of the address |
| `kind`, `encoding` | `text`, `token`, `integer`, `decimal`, `boolean`, `date`, `uri`, `json`, `reference` or `unknown`; and the encoding as served (one text, or a list of texts when the term serves a list) | `a:encoding` |
| `cardinality`, `cardinalityAsServed` | `single`, `multi` or null; and the word as served | `a:cardinality` |
| `valueSet` | `{ values, closure }` or null | `a:valueSet`, `a:valueSetClosure` |
| `recordType` | the address of the type a link points at, or null | `a:fieldRecordType`, else the type of the `reference` end in `a:endpoint` |
| `required` | true when the type's own term requires this field | `a:requiredSlot` on the type term |
| `status` | `Approved`, `Suggested`, `Deprecated`, or null | `a:ontologyStatus` |

`TypeFields` also carries `requiredSlots` (every slot the type requires, also one that is not a declared field), `unreadable` (declarations naming the type that could not be read as a field, stated and not dropped), and `complete` with `incompleteAt` (false when the master did not list every declaration: the fields are then a floor).

To read a record's value under a field, use `readList(record, field.doc)` from `vocabulary-source`.

## What this is not

- Not a cache. Every `readFieldDeclarations` call reads the master again (each request is sent `no-cache`). The host keeps the answer.
- Not the fields of the types above a type. `fieldsOfType` gives a type's own fields, and no walk up the types is made (it would cost a request for each type above). A caller that must show a fact held under some other field finds that field by its key with `fieldIndex`; the index does not say whether the field's type is above.
- Not a writer, and not a screen.
- Not the stakeholder field sets: those are `stakeholder-field-sets`, which walks the kinds of stakeholder and their types above.
- Not a place that names a type or a field. The keys in the source are only the ontology's words about itself (`a:fieldOf`, `a:label`, `a:encoding` and the like).

## How to take it

Package: `@kaigilb/gilbplatformcode-type-fields`

From a clone of this repository, install the unit's folder; `npm install` takes its peer first, in the order `node scripts/peers.mjs units/type-fields` prints:

```sh
npm install --install-links <path-to-the-library>/units/type-fields
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency besides its peer.

## Examples

```ts
import { readFieldDeclarations, fieldsOfType, TypeFieldsError } from "@kaigilb/gilbplatformcode-type-fields";

try {
  const declarations = await readFieldDeclarations({ vedaOrigin: "https://ontology.platform.example.test" }); // two requests, once
  const columns = fieldsOfType(declarations, "GarmentStockLine").fields;                                      // no request
  for (const f of columns) console.log(f.anchor, f.label, f.kind, f.cardinality, f.status);
} catch (e) {
  // Never show a failed read as "no fields".
  if (e instanceof TypeFieldsError) console.warn(e.kind, e.status, e.message);
}
```

## What the host must supply

- The master's origin: `vedaOrigin`, a bare origin. There is no default.
- Optionally `fetchImpl`, when the app has its own HTTP stack or wants to test. It is called with `{ cache: "no-cache", signal }` and must pass both on.
- A cache for the declarations, if the app reads fields more than once. The master answers `cache-control: public, max-age=3600`, so a host may keep them for the session.

## Module state

None. The unit holds only constants.

## Do not

- Do not read a failure as "this type has no fields". A `TypeFieldsError` says "I could not read the definition".
- Do not read `complete: false` as the whole list.
- Do not treat `cardinality: null` as `single`. The term did not say. `readList` refuses such a term; a reader that only shows the value shows it as stored.
- Do not make a key from a label. A column's key is its `anchor`.

## Wrong readings

- "`recordType` null means the field is not a link." It means the term names no end type. `kind` says whether it is a link.
- "`required: false` on every field means the type requires nothing." Read `requiredSlots`: a type may require a slot that is not one of its declared fields.
- "An unknown type gives an empty list." It throws `unknown-type`. A type that exists and has no field gives an empty list.

## What was measured

On the live master, 2026-11-25T01:07Z (public read, no credential), before this unit was written:

| Request | Answer |
|---|---|
| `GET /base/vocab?status=all&carries=a:fieldOf&limit=1000` | 200, `complete: true`, 847 terms on one page, 4,017,960 bytes (852,798 bytes on the wire with brotli), 0.5 to 0.8 s |
| the same with `limit=100` | 9 pages, 4,024,102 bytes, 2.0 s |
| `GET /base/vocab?status=all&carries=a:requiredSlot&limit=100` | 200, `complete: true`, 6 terms, 27,946 bytes |
| `GET /base/t/<Type>` | does not list the type's fields (the fact is stored on the field term) |

The 847 terms named 252 types. 17 of them carried no `a:cardinality`, and 5 carried a word other than `single` or `multi`. They carried 20 distinct encodings (2 terms none): 19 served as one text and one as a list of two texts; the test of `fieldKindOf` lists all 20 with their counts. No route gave the fields of one type alone; that is why the unit reads all declarations once and derives each type from them.

## Where it came from

New code, written for the table view (GilbApp, Solution TableView.SameRecords, delivery step 1). It reads the master through `vocabulary-source` (`masterSource`, `spellingOfTermDoc`, `encodingOf`, `cardinalityOf`, `valuesUnder`, `refsUnder`, `textUnder`, `nameOfIri`), so the carrier read, its bounds and its "not known yet" errors are that unit's.

Tests (`src/typeFields.test.ts`, 24): the six facts for known types, the requests made, the field index, and the error cases 404, 403, 500, a network that is down, an unknown type, a name that is not a type name, and a master without the carrier read. The stand-in master (`test/support.ts`) serves term documents copied from the live master on 2026-11-25 (`test/fixtures/master-fields-2026-11-25.json`; its `_copiedFrom` names the host, the requests and what was cut). What the stand-in does that the live master was never measured to do (answer 403, 404 or 500 to every request; leave `carries` off an answer) is a guess, and is labelled so in `test/support.ts` and at each test that uses it. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
