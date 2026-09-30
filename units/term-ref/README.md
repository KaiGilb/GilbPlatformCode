# term-ref

An absolute address, kept as a reference. A local name is not turned into an address.

## What this is

`termRefFromNameOrIri(nameOrIri)` answers one question: did the caller already hand us an absolute `http://` or `https://` address?

If yes, the reference is `{ "@id": trimmed }`. If no, the result is null. Null means "this is not an address I may store as one." It does not mean "look the name up" and it does not mean "build an address."

The app's async resolver may still search a catalogue when this returns null. That search stays in the host. Composing an address from a local name is the defect this function refuses.

## What this is not

- Not ontology-ref. That unit builds `https://<host>/base/t/<name>` when the host passes the host and the name. This unit never builds. A null here is not a request to call `defaultTermIri`.
- Not statement-href. That function parses an address and returns trimmed text, not `url.href`. A value that merely starts with the letters is not enough there. Here, the prefix is the whole test. `https://a b` is kept, spaces and all, because this function does not parse.
- Not a scheme fold. `HTTP://` is null, not repaired to `http://`.
- Not a fetch, and not a check that the address exists.
- Not a trim of a trailing slash. `https://h.example/t/A/` stays with the slash. The trim is only the ends of the input, before the test.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-ref`

```ts
import { termRefFromNameOrIri } from "@kaigilb/gilbplatformcode-term-ref";

const ref = termRefFromNameOrIri(text);
```

## What you pass

One string. A name, a short id, or an address, as the person or the document spelled it.

## What you get

`{ "@id": string }` or `null`. The object is new. The string inside is the trimmed input, not a normalised URL.

| Input | Result |
|---|---|
| `"  https://terms.example.test/base/t/A  "` | `{ "@id": "https://terms.example.test/base/t/A" }` |
| `"http://terms.example.test/x"` | kept the same way |
| `"https://terms.example.test/t/A/"` | kept, slash included |
| `"https://a b"` | kept, space included |
| `"HTTP://terms.example.test/t"` | `null` |
| `"httpfoo"` | `null` |
| `"Person"`, `"t:Person"`, `"base:t/Person"` | `null` |
| `""` or spaces | `null` |

The scheme test is `^https?://` against the trimmed string. Lowercase `http` and `https` only.

## Examples

```ts
termRefFromNameOrIri("https://terms.example.test/base/t/Chair");
// { "@id": "https://terms.example.test/base/t/Chair" }

termRefFromNameOrIri("Chair");
// null
```

## Host must supply

The text. When the result is null and the host still needs a reference, the host must resolve it from a catalogue it already trusts, or ask the person. It must not concatenate a host it prefers onto the name. That concatenation is what this null is for.

## Do not

- Do not treat null as an empty `@id`. `{ "@id": "" }` is not what null means, and storing it would write a blank reference.
- Do not run the result through a URL parser and save `url.href` instead. A parser would add a slash, lowercase the host, or reject the space. The stored spelling is the trimmed input.
- Do not accept `HTTP://` by lowercasing first. The capital scheme is not an absolute address for this function.
- Do not use this as the open-in-browser test. statement-href is that test. This one will accept strings a browser should not be handed, as long as the prefix matches.

## Wrong readings

- "A local name comes back as a term address on the default host." It comes back as null.
- "`httpfoo` is close enough." It is null. The colon-slash-slash is required. compact-id keeps `httpfoo` for a different reason. Do not unify them.
- A trailing slash is not removed, and a missing slash is not added.
- The function does not look at `@id` inside an object. Pass the string. An object will not type-check, and stringifying one is not the address.

## Source

GilbApp `src/lib/base/ontologyWrite.ts`, `termRefFromNameOrIri`. `resolveTermRefFromCatalog` fetches, and it was not copied.
