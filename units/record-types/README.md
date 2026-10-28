# record-types

The Plan record types, each with its fields and its BaseVeda type address, and the one way to resolve a type from its id or any spelling of its address.

## What this is

The Plan record types, each with its fields and its BaseVeda type address, and the one way to resolve a type from its id or any spelling of its address.

A table of the ten record types a vault grid can show (`note`, `person`, `task`, `folder`, `function`, `functionConstraint`, `value`, `solution`, `designConstraint`, `resource`): for each its local id, its BaseVeda type name (and any older names that still resolve), its label, and its typed fields. On top of the table, the functions that turn a name into the type address the vault expects and a stored spelling back into a table entry. The type address is `https://<host of the platform origin>/base/t/<Name>`. The platform origin comes from `base-origin` when a function is called. Plain functions and data, no React, no network.

- `RECORD_TYPES`: the table, in order. `RECORD_TYPE_BY_ID`: the table keyed by local id; the retired id `contact` still resolves to `person`.
- `recordTypeByUri()`: the table keyed by absolute type address, for the type name and every older name. Rebuilt when the platform origin changes. (In the app this was a constant, `RECORD_TYPE_BY_URI`.)
- `resolveType(idOrUri)`: the entry for a local id, a retired id, or any spelling of a type address; `null` otherwise.
- `typeUri(name)`, `typeNamespace()`, `baseHost()`: the absolute address of a type name, its namespace, and the host it is built on.
- `typeUriForVaultNamespace(name, vaultNamespace)`: the type for a create into a vault: the host-free form `t:<Name>` (the namespace argument is kept for call sites and unused).
- `normalizeTypeUri(raw)`: any spelling (`t:Task`, `Task`, an address under any host with `/base/t/<Name>`) to the one absolute address; a foreign ontology address is returned as it is; nothing gives `""`.
- `attrKey(slug)`: `a:<slug>`. `isAppAddressableSlug(slug)`: whether a served key is a slug the app can name.
- The types `FieldKind`, `FieldSpec` and `RecordTypeSpec`.

The unit holds one piece of state of its own, the cache behind `recordTypeByUri()`, and reads `base-origin`'s state. An app must have ONE copy of `base-origin`; this unit takes it as a peer dependency (`^0.1.0`).

## What this is not

- Not the Plan card types and their lines: that is `plan-kinds`. This table is the grid's registry of record types and fields.
- Not a type registry fetched from the ontology. It is a fixed table; it never asks a server.
- Not a default origin. With no platform origin set, `baseHost`, `typeNamespace`, `typeUri`, `normalizeTypeUri` and `recordTypeByUri` throw, and so does `resolveType` for any text that is not a local id.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-types`

From a clone of this repository, install the unit's folder, and its peer first:

```sh
npm install <path-to-the-library>/units/base-origin
npm install <path-to-the-library>/units/record-types
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resolveType, typeUri } from "@kaigilb/gilbplatformcode-record-types";

setBaseOrigin("https://platform.example.test"); // once at start-up

typeUri("Task"); // "https://platform.example.test/base/t/Task"
resolveType("t:Task")?.id; // "task"
resolveType("https://u.example.test/base/t/NoteDocument")?.id; // "note"
```

## What the host must supply

- `setBaseOrigin(...)` from `base-origin`, once at start-up, before any type address is built or resolved.

## Do not

- Do not read the old constant `RECORD_TYPE_BY_URI`; it does not exist here. Call `recordTypeByUri()`.
- Do not call `recordTypeByUri()` or `typeUri` before the origin is set: it throws.
- Do not edit the table to add a type without its typed fields: every entry holds a `nameField` that exists in its fields, except an entry marked `fieldsFrom`.

## Wrong readings

- "The type address uses the scheme of the platform origin." It does not: it is always `https://`, even when the origin is `http://` (a development rig).
- "`normalizeTypeUri` keeps a foreign host's type address." Only a foreign ONTOLOGY address (no `/base/t/` path) is kept. The match is on the path `/base/t/<Name>` under ANY host, so a third-party Base-shaped host is collapsed onto the registry key too. This is a hole the app recorded and did not close; it is kept and pinned by a test.
- "`typeUriForVaultNamespace` uses the vault namespace." It ignores it. With a blank name it returns the absolute address of the text as given.
- "`resolveType` needs the origin." Only for a text that is not a local id: a local id or the retired id `contact` resolves with no origin set.
- "`RECORD_TYPE_BY_URI` is still a constant." It is `recordTypeByUri()` here, because the keys depend on the origin, which is set at start-up, not at load.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, file `src/lib/base/recordTypes.ts`, copied by script to `src/recordTypes.ts`: lines 66-79 (`baseHost`), 81-85 (`typeNamespace`), 87-90 (`typeUri`), 92-106 (`typeUriForVaultNamespace`), 108-163 (`normalizeTypeUri`), 165-169 (`attrKey`), 171-190 (`isAppAddressableSlug`), 192-193 (`FieldKind`), 213-225 (`FieldSpec`), 227-415 (`RecordTypeSpec` and `RECORD_TYPES`), 417-444 (`RETIRED_TYPE_IDS`, `RECORD_TYPE_BY_ID`, `RECORD_TYPE_BY_URI`), 456-465 (`resolveType`). Not taken because nothing reaches them: `ALLOWED_EXTRA_ATTR_SLUGS` (lines 195-211) and `RECORD_TYPE_NAMES` (lines 446-454).

Named changes, and only these:

1. the one import, `import { BASE_ORIGIN } from "./config"`, is now `import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin"`, and `BASE_ORIGIN` is read as `baseOrigin()`;
2. in `baseHost`, the `try`/`catch` with the fallback host is removed, so it is `return new URL(baseOrigin()).host;`: `baseOrigin()` is a validated origin, so the `catch` could not run, and an unset origin throws naming `setBaseOrigin`;
3. the constant `RECORD_TYPE_BY_URI` (built at load from `typeUri`) is now the function `recordTypeByUri()`, which builds the same table from the same expression and rebuilds it when `typeNamespace()` changes; `resolveType` calls it;
4. comments that name a host or `BASE_ORIGIN` are reworded, no code changed.

`src/index.ts` is new. Tests: `recordTypes.registry.test.ts` is `recordTypes.test.ts` (4 tests) and `recordTypes.personLabel.test.ts` is the file of the same name (5 tests), both ported whole; the platform origin is set in a `beforeEach`, `RECORD_TYPE_BY_URI` is read as `recordTypeByUri()`, and an ontology host in a comment is changed to an `example.test` host. No test of the app is left out that calls these symbols alone; the many component and hook tests that import `recordTypes` use it as a fixture and are not ported. `recordTypes.test.ts` is new and pins every export. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
