# stated-by

Tells whether a fact was stated by a given person, comparing addresses as the platform does.

## What this is

Tells whether a fact was stated by a given person, comparing addresses as the platform does.

A held detail (a note, a language, a label, an organization number) carries `a:statedBy`: the address of the card of the person who added it. This unit answers the two questions every such detail asks:

- `isStatedBy(statedBy, card, _docUri?)` is true only when the detail's ONE `a:statedBy` value is BYTE-EQUAL to the viewer's own card address (`card`). No trimming, no trailing slash, fragment or query stripped, no host-case folding, no `/vault/e/` = `/base/e/` mapping, no `base:` expansion: a value in any other spelling is NOT the viewer's. None or two stated values is nobody's; no card known (`null`, `undefined`, `""`) is nobody's. This is the one place that decides a detail is "own" (edit, delete, the private switch, "Added by you"). The third argument is accepted so callers need not change and is not read.
- `sameIri(a, b, docUri?)` is the lenient comparison (host lower-cased, trailing slash and query dropped, `/vault/e/` read as `/base/e/`, a compact `base:e/...` form expanded against `docUri`, the address of the claim that carries it). It is for the contact-label chips' `a:claimSubject`, a different field that is not a source. `comparableIri(value, docUri?)` is the form it compares.

Both compare the FULL address, never the id tail: two cards with the same id in two vaults are two people.

## What this is not

- Not a reader of anything. It makes no request; it compares strings.
- Not the rule for who may see a detail (that is the platform's tier gate) and not the private switch (`held-notes`).
- Not the way to decide the viewer's own card (`adder-card`).
- Do not use `sameIri` for `a:statedBy`; use `isStatedBy`.

## How to take it

Package: `@kaigilb/gilbplatformcode-stated-by`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stated-by` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/direct-shares <path-to-the-library>/units/folder-part <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/stated-by
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. It is pure.

## Requests and their servers

None. It makes no request.

## Examples

```ts
import { isStatedBy, sameIri } from "@kaigilb/gilbplatformcode-stated-by";

isStatedBy([claim.statedBy], myCardAddress); // true only for the exact same string
sameIri(chip.claimSubject, personAddress, chip.uri); // lenient, for the chips' claim subject
```

## What the host must supply

Nothing.

## Module state

None.

## Do not

- Do not loosen `isStatedBy` (trim, case-fold, strip a slash, map `/vault/e/`): a spelling another person stored must never make the viewer see "Added by you" and a private switch on that person's detail.
- Do not keep a second copy of these functions in another unit.

## Wrong readings

- "`isStatedBy` forgives a trailing slash." It does not; `sameIri` does.
- "The `docUri` argument of `isStatedBy` expands `base:` forms." It is unused; a `base:` form is not the viewer's.
- "Two stated values include the viewer's." Two values are nobody's.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/statedBy.ts` to `src/statedBy.ts`, the whole file (44 lines: `comparableIri`, `sameIri`, `isStatedBy`).

Imports: `canonicalEntity` from `contact-kind-model` 0.1.0 (its stripped compare against the source's is 0, 31 words); `expandRelationRef` from `src/expandRelationRef.ts`, a NAMED COPY of `kind-relation`'s private file of the same name (that unit does not export it; its four functions compare 0 against the source's `relationDoc.ts`: `expandRelationRef` 13 words, `idOf` 79, `vaultBaseFromDocId` 25, `firstValue` 12).

Named changes, and only these: the two imports; the comments that name a cycle, a ticket, a ruling or a test run are reworded with the same facts. No code changed. The comment-stripped file, imports excluded, equals the source (0 diff, 90 words).

## Tests

34 tests in 3 files (`npx vitest run`):

- `statedBy.test.ts` 19: ported from the source's `sourceIsAdder.sb1a.test.ts` ("isStatedBy compares the FULL card address", 4 cases) and `sourceIsAdder.sb1d.test.tsx` ("isStatedBy: byte-equal, nothing else": the exact form and 7 spellings = 8 tests here; its `base:` case repeats the first file's), with the example hosts of the library, plus 7 new cases (12 ported, 7 new) for `isStatedBy`, `sameIri` / `comparableIri` (the source only touches `sameIri` once) and the unused-third-argument pin.
- `exports.test.ts` 2: the three exports and their arities.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units (it writes to the OS temp directory).

Left out: the screen cases of `sb1d` (an interest, an organization number and a language row shown as own only on the exact form): they draw `InterestRows`, `OrgNumberSection` and `LanguageSection`, which are not units here.

Mutation checks: 11 mutants of `src/statedBy.ts` (the one-value rule, any-value match, trim, case fold, empty card, blank sides, raw compare, the `/vault/e/` fold, `base:` expansion with and without the claim address, trim in `comparableIri`), 10 killed, 1 equivalent (M09: expanding without a claim address returns null, and the value is then used as it is, which is what not expanding does).
