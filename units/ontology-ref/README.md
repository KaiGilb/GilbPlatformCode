# ontology-ref

Whether a string is a store id, and the absolute term address on a host the caller passes.

## What this is

`looksLikeStoreId(ref)` is the id test.

`ontologyRefIri(ref, host)` turns a ref into `https://<host>/base/<plane>/<name>`.

`defaultTermIri(name, host)` is only the type plane: `https://<host>/base/t/<name>`.

Nothing is fetched. The host is a hostname, such as `terms.example`, not a URL.

## What this is not

- Not a catalogue, and not a decision that the term exists.
- Not the type-name unit. type-name returns the bare name. This unit returns an address, or says that a string looks like a store id.
- Not the type-spell unit. type-spell asks the host for a builder and keeps a foreign address as it was. This unit always builds on the host you pass, except when the ref is already `http://` or `https://` in lowercase.
- Not a link check. `httpfoo` is a name here. A link opener refuses `httpfoo`. A short-id expander keeps `httpfoo`. Do not unify those three.

## How to take it

Package: `@kaigilb/gilbplatformcode-ontology-ref`

```ts
import { looksLikeStoreId, ontologyRefIri, defaultTermIri } from "@kaigilb/gilbplatformcode-ontology-ref";

const iri = ontologyRefIri(ref, host);
const term = defaultTermIri("Person", host);
```

## What you pass

`host` is required. There is no default. Pass the hostname the app already uses for the ontology. Do not pass a scheme, and do not pass a path.

`looksLikeStoreId` takes the raw string. It does not trim.

`ontologyRefIri` trims `ref` first.

`defaultTermIri` does not trim `name`.

## What you get

`looksLikeStoreId` is true for either of these, and false otherwise:

- At least 10 characters, only `0-9` and `a-z`, and at least one digit. `3ehvnp0kqwha` is true. `improvement` is false (no digit). `3DPrinting` is false (uppercase). Nine characters is false. A leading space is false.
- A lowercase UUID, `8-4-4-4-12` hex. An uppercase UUID is false.

`ontologyRefIri`:

| Input | Result |
|---|---|
| `""` or spaces | `""` |
| `https://kept.example/t/Chair` | that address, after trim, unchanged |
| `HTTP://kept.example/t/Chair` | not passed through. It is a name on `t`. |
| `httpfoo` | `https://<host>/base/t/httpfoo` |
| `base:e/a b` | `https://<host>/base/e/a%20b` |
| `BASE:e/x` | not a CURIE. It is a name on `t`. |
| a store id | plane `e` |
| any other name | plane `t` |

A CURIE must be lowercase `base:`, then a lowercase plane, then `/`. The rest is encoded. `host` is not encoded.

`defaultTermIri("t:Person", host)` is `https://<host>/base/t/t%3APerson`. The `t:` is not stripped. A space in the name is encoded, not trimmed.

## Host must supply

The ontology hostname. The same host for every call on one screen, unless the term's own address already says otherwise. An address that is already `http://` or `https://` is not rebuilt.

## Do not

- Do not use `looksLikeStoreId` as "this term does not exist". It only separates an opaque id from a name. Seven real term names in the corpus do not start with an uppercase letter. The digit rule is what keeps them as names.
- Do not simplify the id test to "starts with a digit" or "is all lowercase".
- Do not put a default host back into this file.

## Wrong readings

- `HTTP://` is not "close enough" to an absolute address. Only lowercase `http://` and `https://` pass through.
- A store id and a name with the same letters go to different planes. `looksLikeStoreId` is the fork.
- `defaultTermIri` and `ontologyRefIri` do not trim the same way. Do not call one and expect the other's trim.

## Source

GilbApp `src/lib/base/ontologyBrowse.ts`, `looksLikeStoreId`, `ontologyRefIri`, and `defaultTermIri`. The default host argument was removed. The caller passes it. The fetch stays in the app.
