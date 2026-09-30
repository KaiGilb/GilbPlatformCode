# kind-home

Which standards screen a stored type belongs on, and what a `?pk=` link opens.

A home is a place a person can open. A wire type is the name the vault stored. They are not always the same word. Stanza is not its own home. The tab still has to read a Stanza record, or that record disappears. Schema is stored as Schema and labelled Form-Schema. ReferenceDocument is labelled Reference. LookupTable is labelled Lookup.

## What this is

The registry:

| Kind id | Tab label | Bare type names it reads |
|---|---|---|
| `process` | Process | Process |
| `processCard` | ProcessCard | ProcessCard, then Stanza |
| `formSchema` | Form-Schema | Schema |
| `referenceDocument` | Reference | ReferenceDocument |
| `lookupTable` | Lookup | LookupTable |

| Function | You pass | You get |
|---|---|---|
| `parseProcessKind` | The `pk` query value, or null. | `process` or `processCard`. |
| `applyProcessKindParams` | The current query, and a process kind. | A new query. `pk` is removed for Process. `std` is always removed. |
| `processKindOfTypeUri` | A type string, or null. | `process` or `processCard` only. |
| `standardKindLabel` | A kind id. | The tab label. |
| `standardKindRow` | A kind id. | The row, or undefined. |
| `legacyStoredTypeOf` | A kind id and the stored bare name. | That name when it differs from the tab label, otherwise null. |

The arrays `PROCESS_KINDS`, `FORM_KINDS`, `REFERENCE_KINDS`, `LOOKUP_KINDS`, and `STANDARD_KINDS` are the same rows.

## What this is not

- Not the list of records. The fetch stays in the app.
- Not a type renamer. Showing "Stanza" beside a ProcessCard row does not change the stored type.
- Not `type-curie` as a package, though the local-name rules inside `processKindOfTypeUri` are the same and must stay in agreement with that unit. `/vault/t/` is not recognised. A broken `%` throws `URIError`. It does not become "process" by failing quietly. The throw is the signal that the address was corrupt.
- Not a second home for Stanza. Stanza is the second wire name on ProcessCard. It has no tab of its own.

## How to take it

Package: `@kaigilb/gilbplatformcode-kind-home`

```ts
import {
  legacyStoredTypeOf,
  parseProcessKind,
  processKindOfTypeUri,
} from "@kaigilb/gilbplatformcode-kind-home";
```

Path: `units/kind-home/`.

Wire names are bare. `ProcessCard`, not `t:ProcessCard`, not a full address. The request that filters a vault by type drops a value that contains a colon, and the vault then looks like it returned everything. Pass the bare name.

## What you pass

`parseProcessKind` gets the raw query string or null. The match is case-sensitive. `stanza` opens ProcessCard. `Stanza` opens Process. `schema` opens Process, not Form-Schema. Form-Schema is a different tab, not a `pk` value. `constructor`, empty, and null open Process. A bad link must not blank the tab.

The alias table is a `Map`. Do not rebuild it as a plain object. On a plain object, the key `constructor` is an inherited function, and a bad link would look like a real kind.

`processKindOfTypeUri` gets the record's own type, which may be `t:Name`, `prefix:Name`, or an address with `/base/t/Name`. It does not read `?pk=`. The stored type decides the home. The query does not.

## What you get

`processKindOfTypeUri("t:Stanza")` is `processCard`. `t:Process` is `process`. `Schema` is `process`, not `formSchema`. This function only answers the Process tab. Anything it does not recognise, including null and blank, is `process`. An address under `/vault/t/Stanza` is `process`, because that path is not read as a type address. Do not add `/vault/t/` here unless `type-curie` changes too.

`legacyStoredTypeOf` compares the stored name to the tab label, not to the wire name.

- ProcessCard and `Stanza` returns `Stanza`. ProcessCard and `ProcessCard` returns null.
- Form-Schema and `Schema` returns `Schema`. The label and the stored word differ on purpose.
- Reference and `ReferenceDocument` returns `ReferenceDocument`. The label is the word Reference.
- Lookup and `LookupTable` returns `LookupTable`.
- A blank stored name returns null. Nothing is invented.

So a correctly stored reference still discloses `ReferenceDocument`, because that is not the word on the tab. That is the comparison. Do not switch it to compare wire names, or Form-Schema versus Schema goes silent while Stanza still shows.

`applyProcessKindParams` copies the query. It does not edit the input. Choosing Process deletes `pk`. Choosing ProcessCard sets `pk=processCard`. Both delete `std`, because a detail selection from the other kind is not meaningful. Other keys, including a tab key, are kept.

## What the host must supply

The query string and the record's type. The rows of records. This unit does not load them.

## Do not

- Do not remove Stanza from the ProcessCard wire list. A live Stanza record would drop out of the only home that reads it.
- Do not add Stanza as its own kind. That is a second home.
- Do not prefix wire names with `t:`.
- Do not send `schema` to Form-Schema from `parseProcessKind`. That alias is absent on purpose.
- Do not use `processKindOfTypeUri` to classify a reference or a lookup. It will say `process`.

## Wrong readings

- "The tab label is the type to request." Form-Schema requests Schema. Reference requests ReferenceDocument. Lookup requests LookupTable.
- "A bad pk should clear the screen." It opens Process.
- "Stanza on a ProcessCard row means the record was retyped." It was not. The disclosure is so the screen does not pretend the stored word is ProcessCard.

## Where it came from

GilbApp `src/lib/base/standardKinds.ts`, the registry and the pure readers. The page fetch stays in the app. The local-name helper matches GilbApp `src/lib/base/recordPlane.ts` `typeLocalName`, which is the same behaviour as `units/type-curie`.
