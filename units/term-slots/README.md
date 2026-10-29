# term-slots

Finds a card field by its ontology term, and reads its spelling, label and value set from the master.

## What this is

Finds a card field by its ontology term, and reads its spelling, label and value set from the master.

Plain async functions, no React, no credential. A card finds a field by the NAME of its ontology term (`email`, `addressLine1`) and takes the fact's spelling, the label and the closed set of values from the master that serves the term, so no spelling and no label is typed into the app. Each read is a public `GET` of a term document made with the global `fetch`, at the origin the app set once with `setTermOrigin` (the `term-origin` unit), and read each time a URL is built. Each answer is kept for the session, so asking again costs no request.

- `attributeSpelling(name)`: the bare fact key the master binds to the attribute term (`a:predicateAttribute`, without `a:`), or `null`. `GET <origin>/base/a/<name>`.
- `attributeLabel(name)`: the term's own label, from the SAME document (the label shown and the spelling written come from one answer), or `null`.
- `termDocLabel(doc)`: the one rule for reading a label off a term document: `a:label`, else `label`, else `https://schema.org/name`, trimmed; `null` when none. Pure.
- `termValueSet(name)`: the closed set of values the master allows for the term (`a:valueSet`), else the set of the type the attribute defines (`a:typeUri`, one more `GET <origin>/base/t/<Name>`), or `null`. Blank and non-string values are dropped.
- `termLabelOfIri(iri)`: the label of a catalogue term named by its address (`<origin>/base/t/<Name>`), or `null` (also, without a request, for any address that is not exactly that). `GET <origin>/base/t/<Name>`.
- `typeSpelling(name)`: the create spelling the master binds to a type term (`a:typeAttribute`), always as `t:<Name>`, or `null`.
- `__resetTermSlotsForTest()`: empties the four caches. A test seam; new in this unit.

Every request sends only `accept: application/ld+json, application/json` (no `Authorization`: the ontology's cross-origin preflight allows only `accept`, and a credential there empties the answer).

## What this is not

- Not the lookup of a field in a card's field set: `termName` (the term's name from its address) and `fieldOfTerm` are not here. They go to a later unit.
- Not a writer, and not a credential holder.
- Not a way to read a term from another origin: every URL is on the origin the app set, and `termLabelOfIri` answers `null` for an address on any other.
- Not a fetch seam: the reads use the global `fetch`, as `ontology-reads` does. A host that wants another transport replaces `fetch`.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-slots`

From a clone of this repository, install the peer first, then the unit's folder:

```sh
npm install <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `term-origin` (`^0.1.0`) is a peer.

## Examples

```ts
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { attributeLabel, attributeSpelling, termValueSet } from "@kaigilb/gilbplatformcode-term-slots";

setTermOrigin("https://ontology.example.test"); // once, at start-up

const key = await attributeSpelling("email"); // "email": the key a stored fact carries, or null when the master did not answer
const label = await attributeLabel("email"); // from the same document: no second request
const choices = await termValueSet("contactLanguageLevel"); // string[] | null; null means offer free text
```

## What the host must supply

- `setTermOrigin(origin)` of `term-origin`, once at start-up, before the first question. It is read when a URL is built, so setting it after this unit was imported is fine. Until it is set, the functions that build a URL throw `term-origin: call setTermOrigin(<origin>) once at start-up`.
- A global `fetch` that can reach that origin without a credential.
- Nothing else.

## Module state

The unit holds four module caches, each a `Map` from a term's name to the read (a promise) that answered or is in flight. An app must have ONE copy of this unit, or each copy keeps its own caches and asks again.

- `attributeDocs` (name to the attribute's document): shared by `attributeSpelling`, `attributeLabel` and `termValueSet`.
- `valueSets` (name to the value set, or `null`): `termValueSet`.
- `typeSpellings` (name to `t:<Name>`): `typeSpelling`.
- `typeLabels` (name to the label): `termLabelOfIri`.

A read that answered `null` (refused, unreachable, or no value) is removed from its cache when it settles, so the next question asks again. Only an answer is kept. There is no call that forgets the caches in the app; `__resetTermSlotsForTest()` does, for tests: the tests here call it after each test and set a fresh origin before each.

The origin is NOT module state of this unit: it is the setting of `term-origin`, which holds its own state and must also exist once.

Dynamic imports in the lines taken: none (`grep "import("` found none).

## Do not

- Do not call a function before `setTermOrigin`: it throws. Reading the code (no test pins this, because the stored promise is an unhandled rejection): `termValueSet` stores its failed read in the cache before it throws, so set the origin first and do not catch the error and ask again.
- Do not read `null` as "the term has no such thing". It is also "the master did not answer".
- Do not type a spelling or a label into the app because a read returned `null`. Show free text, or show nothing, until the master answers.
- Do not install a second copy of this unit.

## Wrong readings

These behaviours are as the source has them, kept on purpose and pinned by tests.

- "A term that answered with no label is remembered." It is not: `termLabelOfIri` removes a `null` label from its cache, so a term with no label is asked again each time (the same for `typeSpelling` with no binding). `attributeSpelling` and `attributeLabel` do keep the document of a term that answered, even with no binding.
- "`termValueSet` reads the type only for a set it cannot find." True, and the type may be on any host: the type's NAME is taken from `/t/<Name>` in the `a:typeUri` and read on the term origin.
- "`termLabelOfIri` reads any term address." Only `<origin>/base/t/<Name>` with a name of letters and digits, on the origin that was set; a trailing slash, a hyphen, a query or a fragment is `null` with no request. (The source pinned this to one production host; here it is the set origin.)
- "A label with an empty `a:label` falls back to `label`." It does not: a present `a:label` of `""` stops the lookup, and the answer is `null`.

## Where it came from

`KaiGilb/GilbApp` (private repo), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, file `src/lib/base/termSlots.ts`, copied by script to `src/termSlots.ts`: lines 38-194, which is the module cache `attributeDocs` and `attributeDoc` (38-57, above the first exported function) and then `attributeSpelling`, `attributeLabel`, `termDocLabel`, `valueSetOf` (private), `valueSets`, `termValueSet`, `readValueSet` (private), `typeSpellings`, `typeLabels`, `termLabelOfIri` and `typeSpelling` (59-194). Not taken: lines 1-37 (the header comment, the import, `termName` and `fieldOfTerm`).

**Merged units compared and taken or not.** `term-origin` (0.1.0) is the setting the source's `GILBVEDA_MASTER_ORIGIN` becomes; it is a peer. No merged unit holds any of these functions (searched by name over every `units/*/src`).

Named changes, and only these:

1. the import `GILBVEDA_MASTER_ORIGIN` from `./stakeholderKinds` is `import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin"`; each of the four URLs that began `${GILBVEDA_MASTER_ORIGIN}` (source lines 48, 133, 158 and 178) begins `${termOrigin()}`, read when the URL is built;
2. the pattern in `termLabelOfIri` (source line 153), `/^https:\/\/veda\.gilb\.com\/base\/t\/([A-Za-z0-9]+)$/`, is `new RegExp(`^${escapeRegExp(termOrigin())}/base/t/([A-Za-z0-9]+)$`)`, built each call; `escapeRegExp` is a new private function at the end of the file. On the origin the app used the two patterns match the same texts: a scripted scenario run against the source's lines and against this unit gave the same answers and the same requests;
3. `__resetTermSlotsForTest()` is new code, a test seam;
4. the file's header comment is a new, shorter one; other comments lose cycle and step tags, names and one specification-clause number, and one host name in a comment is `<origin>`; no code changed.

`src/index.ts` is new. The app has no test of this file (it was tested through its callers), so every test here is new: `src/termSlots.test.ts` (47: every export, one GET for two questions, the spelling and the label sharing one document, a refused read that is not kept, the value set through the type, the shape of an address `termLabelOfIri` accepts, and the origin set after import and changed between calls), against a fake `fetch`, no network, no wall clock; hosts are `example.test` hosts. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units. Left out: none.
