# record-plane

Which rows are not ordinary content, and the one place a file is treated differently.

The register hides a file, because files have their own list. A relation still has a file as a real end. If the relation screen uses the register test, the file disappears and the relation looks like it has only one end. Use `isInfrastructureEntry` on a mixed screen. Use `isNonRecordListEntry` only on the register's own rows.

## What this is

| Function | True when |
|---|---|
| `isRelationEntityUri` | The address contains `/base/r/`. |
| `isAppUiPreferencesType` | The type is the preferences type, in the spellings below. |
| `isUiPrefsRecord` | Preferences type, or an old note that still carries the preferences mark. |
| `isInternalControlType` | `filectl:` or `cost:`, or a local name in the non-record set. |
| `isNonRecordListEntry` | The register should hide the row. |
| `isInfrastructureEntry` | No mixed screen should treat the row as content. A file is false here. |

The non-record local names are: File, Vault, FileContent, Relation, PartOf, Reference, Authorship, DependsOn, Assignment, AppUiPreferences, VaultAccessGrant.

ReferenceDocument is not in that set. A reference document is content. The type named Reference is not.

## What this is not

- Not `narrow-total`. Drop the rows here, then count what you dropped over there.
- Not `kind-home`. That unit places standards types on tabs. This unit decides a row is not a content row.
- Not `type-curie` as a package. The local-name rules are copied so this folder stands alone, and they must stay in agreement. `/vault/t/` is not a type address here. A broken `%` in `/base/t/` throws `URIError`. It does not return false.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-plane`

```ts
import { isInfrastructureEntry, isNonRecordListEntry } from "@kaigilb/gilbplatformcode-record-plane";
```

Path: `units/record-plane/`.

## What you pass

An entity address, a type string, and the facts when you have them.

`isRelationEntityUri` is a substring test for `/base/r/`, case-insensitive. `/vault/r/` is false. `/base/r` without the following slash is false. Null is false.

`isAppUiPreferencesType` is true for `t:AppUiPreferences`, for an address that ends with `/base/t/AppUiPreferences`, and for any string that ends with `:AppUiPreferences`. The bare word `AppUiPreferences` is false on this function. It is still a non-record name, so `isInternalControlType("AppUiPreferences")` is true. An address under `/vault/t/AppUiPreferences` is false for both the type test and the register test. Do not add `/vault/t/` unless `type-curie` changes too.

`isUiPrefsRecord` is also true when `baseappPref` trims to exactly `ui-v1`, or when the title trims to exactly `BaseApp preferences` or `App UI preferences`. The title can be the argument or `facts.title`. `ui-v2` is not a match. The words are case-sensitive.

`isNonRecordListEntry` does not take a separate title. It only sees facts. Pass facts whenever you have them. An old note whose title is not inside `facts.title` stays visible if you omit facts. A caller that hides rows before facts are loaded must check again after they load.

`filectl:` and `cost:` are case-sensitive prefixes, checked before the local name. `filectl:%` is true and does not throw. `Filectl:x` is not that prefix.

## What you get

Booleans, except a corrupt `/base/t/%` type, which throws.

Order on the register: relation address, then control type, then preferences type, then preferences facts. A file type is hidden.

Order on the infrastructure test: relation address first, then a local name of exactly `File` returns false, then the register test. A file whose address is `/base/r/…` is infrastructure, because the relation check wins. A `t:File` record at `/base/e/…` is not infrastructure, even when the facts look like preferences, because the file return happens before the facts are read.

`isInfrastructureEntry` is the test for a search result that feeds more than one screen. `isNonRecordListEntry` is the test for the register grid only.

## Examples

```ts
isNonRecordListEntry("https://example.test/base/e/1", "t:File"); // true
isInfrastructureEntry("https://example.test/base/e/1", "t:File"); // false
isInfrastructureEntry("https://example.test/base/r/1", "t:File"); // true

isNonRecordListEntry(undefined, "t:Reference"); // true
isNonRecordListEntry(undefined, "t:ReferenceDocument"); // false

isNonRecordListEntry(undefined, "t:NoteDocument", { baseappPref: "ui-v1" }); // true
isNonRecordListEntry(undefined, "t:NoteDocument"); // false

isAppUiPreferencesType("AppUiPreferences"); // false
isInternalControlType("AppUiPreferences"); // true
```

## What the host must supply

The row's address, type, and facts. This unit does not load them and does not know which screen you are painting. You pick the function.

## Do not

- Do not use the register test on a relation picker. Files vanish.
- Do not use the infrastructure test on the register and then wonder why files came back.
- Do not treat ReferenceDocument as Reference. Only the exact local name Reference is in the set.
- Do not swallow the URIError from a broken percent. That row's type was not read.

## Wrong readings

- "File is never content." File is content on every screen except the register.
- "No facts means the row is not preferences." It means you could not see the old mark. Check again when the facts arrive.
- "Vault preferences under /vault/t/ are recognised." They are not, until the local-name rule recognises that path.
- "A throw means the row is hidden." A throw means the type address could not be decoded. Decide that in the caller. Do not catch it and return false inside this unit.

## Where it came from

GilbApp `src/lib/base/recordPlane.ts`, `isRelationEntityUri`, `isAppUiPreferencesType`, `isUiPrefsRecord`, `isInternalControlType`, `isNonRecordListEntry`, and `isInfrastructureEntry`.
