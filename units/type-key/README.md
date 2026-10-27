# type-key

The one test "is this type the type named X", so every Plan unit compares types the same way.

## What this is

The one test "is this type the type named X". Every Plan unit (the Value card model, the links, the constraints) asks `isTypeName(typeUri, name)` and nothing else, so they all compare types under one key. The key is the type's name, lower-cased; a host that has its own type registry swaps the key once at start-up. Plain functions, no React, no network.

- `isTypeName(typeUri, name)`: `typeKey(typeUri) === typeKey(name)`.
- `typeKey(typeUriOrId)`: the key by the current function. Default: `defaultTypeKey`.
- `defaultTypeKey(typeUriOrId)`: the key with no registry. A type spelled as an address with `/base/t/` in it (any host, `http` or `https`), as `t:Name`, or as a bare `Name`, gives `name` lower-cased. An address without `/base/t/` is kept whole, lower-cased. A bare name that holds a `/` keeps only the part after the last `/`. The empty string gives the empty string.
- `setTypeKey(fn)`: replace the current function. `resetTypeKey()`: put the default back (for tests).

The unit holds one piece of module state (the current function). An app must have ONE copy of it: every unit that tests types takes this unit as a peer dependency (`^0.1.0`), and the app installs it once.

## What this is not

- Not a type registry. It knows no type names. A host with a registry passes it in through `setTypeKey`.
- Not a way to read a type's meaning. It only says whether two spellings name the same type.
- Not a fetcher: it never asks a server what a type is.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-key`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/type-key
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. A unit that tests types lists this one under `peerDependencies`, never under `dependencies`.

## Examples

```ts
import { isTypeName, setTypeKey, defaultTypeKey } from "@kaigilb/gilbplatformcode-type-key";

isTypeName("https://vault.example/base/t/Scale", "Scale"); // true
isTypeName("t:Scale", "scale"); // true

// A host with its own type registry, once at start-up:
setTypeKey((id) => myRegistry.resolve(id)?.id ?? defaultTypeKey(id));
```

## What the host must supply

- Nothing, if the default key is right for the types it uses. The Plan and Value type names (Function, Solution, Value, Scale, ScaleQualifier, ScaleQualifierDefinition, Meter, MeterLine, the level types and the rest), written with their usual capitals, are compared the same way by the default as by the app it came from (see Wrong readings for the cases where an app with a registry differs).
- A host with its own type registry calls `setTypeKey` ONCE at start-up, before any card reads a type.

## Do not

- Do not call `setTypeKey` per render or per record: it changes the answer for every unit at once.
- Do not install a second copy of this unit: units that test types would read a different current function than your `setTypeKey` set.
- Do not compare types with `===` on the raw strings; ask `isTypeName`.

## Wrong readings

- "The default key is the app's key." It is the app's key with no registry. The two differ where the registry knows more than the name: (a) registry aliases: an app that treats `Note` and `NoteDocument` (or `Contact` and `Person`) as one type gives both the registry id `note`, so `isTypeName("NoteDocument", "Note")` is true there; the default gives `notedocument` and `note`, so it is false here; the same for a registry id that is not the type's name (`folder` and `VirtualFolder`); (b) a lower-cased spelling of a camel-case registry type: the app finds `FunctionConstraint` in its registry and gives the registry id `functionConstraint`, but does not find `functionconstraint` and gives it as it is, so `isTypeName("FunctionConstraint", "functionconstraint")` is false there; the default lower-cases both and says true. For the Plan and Value type names written with their usual capitals (Function, Solution, Value, Scale, ScaleQualifier, ScaleQualifierDefinition, Meter, MeterLine, and the level types), in a URL, a `t:` name or a bare name, the two agree on every comparison. A host with a registry calls `setTypeKey`.
- "A bare name is cut at nothing." A bare name that holds a `/` keeps only the part after the last `/`: `a/b` gives `b`.
- "A foreign address is cut to its last word." An address without `/base/t/` is kept whole, lower-cased: `https://example.test/other/Thing` gives `https://example.test/other/thing`.
- "The host of an address matters." It does not: any host with `/base/t/` gives the same key.
- "It never throws." A `/base/t/` address with a malformed percent escape in the type name (`%E0%A4%A`) throws a `URIError`, as the source's `decodeURIComponent` does.
- "`t:` alone is empty." `t:` gives `t:`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`:

- `src/lib/base/planLinks.ts` lines 28-31 (`isTypeName`) to `src/typeKey.ts`; the body is verbatim with `typeFacetKey` replaced by `typeKey`.
- `src/lib/base/workingSetFacets.ts` lines 70-80 (`typeFacetKey`) to `defaultTypeKey`: the registry lookup (`resolveType`, lines 71-72) is removed, as if it returned nothing; the fallback lines 73-79 are verbatim.
- `src/lib/base/recordTypes.ts` lines 152-163 (`normalizeTypeUri`) inlined into `src/typeKey.ts` as a private function. The branches, the regex `/\/base\/t\/([^/#?]+)/i`, the `decodeURIComponent`, the `t:` strip and the empty-string case are as in the source; `typeUri(x)` (lines 83-90, `https://${baseHost()}/base/t/` + name) is written as the literal path `/base/t/` + name, with no host: the host never changes the result, because the fallback keeps only the text after the last `/`.
- `setTypeKey`, `resetTypeKey` and `typeKey` (the replaceable function and its default) are new. `src/index.ts` is new.

The tests are new (the source has none for these two functions in isolation); the cases are pinned from the code's own results. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
