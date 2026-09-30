# type-curie

Reads a JSON-LD type value down to one string. When the value is an address under `/base/t/`, the result is `t:` plus the bare name. A value that is already `t:Name` stays `t:Name`.

## What this is

`typeCurieFromJsonLd(raw)` accepts:

| Shape | Result |
|---|---|
| `"t:BrotherOf"` | `"t:BrotherOf"` |
| `"https://example.test/base/t/BrotherOf"` | `"t:BrotherOf"` |
| `["t:BrotherOf", "t:Relation"]` | `"t:BrotherOf"` (first only) |
| `{ "@id": "https://example.test/base/t/SisterOf" }` | `"t:SisterOf"` |
| `"BrotherOf"` | `"BrotherOf"` (no `t:` added) |
| `"https://example.test/vault/t/BrotherOf"` | that whole string |
| missing, blank, `[]`, `{ "@id": "" }` | `null` |

`typeLocalName(typeUri)` is the bare-name cut this uses. It is exported because other readers need the same cut. It is not the same function as `type-name`.

## What this is not

- Not `type-name` (`normalizeTypeName`). That one returns null when a slash is left, strips a leading `veda:` label and a trailing `.png`, and treats `/t/` on any path as the name. This one returns the trimmed original when it does not recognise the shape, only looks for `/base/t/`, and does not strip a picture suffix.
- Not a fetch of the type document.
- Not a check that the type is a real one. `"t:MadeUp"` stays `"t:MadeUp"`.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-curie`

```ts
import { typeCurieFromJsonLd, typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
```

Path: `units/type-curie/`.

## `typeLocalName` in detail

1. Trim.
2. If it starts with `t:`, return everything after those two characters. `t:` alone returns `""`. No further check.
3. If the whole string is `prefix:Name` — prefix starts with a letter, then letters or digits; name is letters, digits, `_`, or `-` — return `Name`. `base:Note` → `Note`. A prefix with a dot does not match.
4. If `/base/t/` appears, return that segment, decoded once, stopping at `/`, `#`, or `?`.
5. Otherwise return the trimmed string, slashes and all.

`/vault/t/Name` falls through to step 5. Do not add `vault` to the pattern. The relation type this was written for is served under `/base/t/`.

A broken `%` in the `/base/t/` segment throws `URIError`.

`typeCurieFromJsonLd` adds `t:` only when `typeLocalName` returned something different from the trimmed input. A bare word is already "local", so it does not gain a prefix. An address does.

## What the host must supply

The raw `@type` value, which may be a string, a one-element list that was not collapsed, a longer list, or `{ "@id" }`. Pass `doc["@type"] ?? doc.type` if you have both spellings; this function does not look at a document.

The second list entry is ignored on purpose. Do not join them.

## Do not

- Do not run the result through `type-name` afterwards "to be safe". A `/vault/t/` address would become a bare name there and stay an address here. Pick the one your screen already used.
- Do not treat null as "untyped entity". Null means this value did not contain a type string.

## Wrong readings

- "Every result starts with `t:`." Bare words do not. Addresses under `/base/t/` do. Addresses under `/vault/t/` do not.
- "The list is a union of types." Only the first entry is read. The rest are not merged and not reported.

## Where it came from

GilbApp `src/lib/base/relationDoc.ts`, `typeCurieFromJsonLd`, and the bare-name cut `typeLocalName` in `src/lib/base/recordPlane.ts`.
