# org-terms

Resolves the ontology spellings an organization card reads: its served terms and the employment link.

## What this is

Resolves the ontology spellings an organization card reads: its served terms and the employment link.

Plain async functions, no React, no credential. An organization card never types the key of a fact. It asks the master for the spelling of each term by the term's NAME (through `term-slots`) and uses the answer; a master that does not answer makes that part of the card unavailable (the call rejects, it never guesses a key). Each answer is kept for the session when it succeeded, and asked again after a miss.

- `resolveOrgTerms()`: `{ logo, parentOrganization, employer }`, the master's BARE spelling of `a:logo`, `a:parentOrganization` and `a:employer` (the form a patch and a read of a record's facts use). Asks the three names in that order, together. Rejects with `OrgTermsUnavailableError` naming each missing term as `a/<name>`.
- `resolveEmploymentLinkVocab()`: `{ employer, employee }`, the master's spellings of `a:employer` and `a:employee`, each `a:`-prefixed as written. Asks `employer` then `employee`, together. Rejects with `EmploymentLinkVocabUnavailableError`. It is its own gate, apart from the employment's other terms: a master that stops serving a link term stops the link only.
- `refsOf(value)`: the addresses one served fact holds, as trimmed strings: a string, an `{"@id"}` node, or an array of either; empty ones dropped. Pure.
- `servedValue(doc, bare)`: a served document's value under the bare key, else under `a:<bare>`. Pure.
- `OrgTermsUnavailableError`, `EmploymentLinkVocabUnavailableError` (both `Error`), `__resetOrgTerms()` and `__resetEmploymentLinkVocab()` (test seams: forget the cache, never called by product code).
- The types `OrgTerms` and `EmploymentLinkVocab`.

## What this is not

- Not a reader of terms: the read of one term's document is `term-slots`'s `attributeSpelling`.
- Not a writer, and not a credential holder.
- Not the registration number terms (`a:registrationNumber`, `a:registrationRegister`): they are not asked here.

## How to take it

Package: `@kaigilb/gilbplatformcode-org-terms`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/org-terms` prints:

```sh
npm install <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The ontology origin is set once, at start-up, by `term-origin` (`setTermOrigin`), as for `term-slots`.

## Examples

```ts
import { resolveOrgTerms, resolveEmploymentLinkVocab, servedValue, refsOf } from "@kaigilb/gilbplatformcode-org-terms";

const terms = await resolveOrgTerms(); // { logo: "logo", parentOrganization: "parentOrganization", employer: "employer" } as the master spells them
const parents = refsOf(servedValue(doc, terms.parentOrganization));
const link = await resolveEmploymentLinkVocab(); // { employer: "a:employer", employee: "a:employee" }
```

## What the host must supply

Nothing. There is no host member: the unit calls `term-slots`, which reads the origin set through `term-origin`.

## Module state

Two pieces of module state, each a cache of one promise:

- `orgTerms.ts` `cached` (source `orgTerms.ts` line 26): the promise `resolveOrgTerms()` returns, kept on success, dropped on a rejection. `__resetOrgTerms()` empties it.
- `employmentLinkVocab.ts` `cached` (source `employmentLinkVocab.ts` line 16): the promise `resolveEmploymentLinkVocab()` returns, kept on success, dropped on a rejection. `__resetEmploymentLinkVocab()` empties it.

Two installed copies of this unit would each hold their own caches and would ask the master twice. Install it once; it is a singleton peer of every unit or app that reads these spellings (`org-employees`, `org-hierarchy`). The source has the two reset functions as test seams; this unit adds no other.

## Do not

- Do not install a second copy of this unit beside another one (see "Module state").
- Do not type a spelling of a term. A caller that cannot get an answer shows the part as unavailable.
- Do not call `__resetOrgTerms` or `__resetEmploymentLinkVocab` from product code.

## Wrong readings

- "A rejected call is remembered." It is not: the next call asks the master again.
- "`resolveEmploymentLinkVocab` returns bare spellings like `resolveOrgTerms`." It does not: its answers carry the `a:` prefix, `resolveOrgTerms`'s do not.
- "A concurrent second call asks again." It does not: it gets the same pending promise.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/orgCard/orgTerms.ts` (whole, 58 lines) to `src/orgTerms.ts`.
- `src/lib/mynet/employment/employmentLinkVocab.ts` (whole, 35 lines) to `src/employmentLinkVocab.ts`.
- `src/lib/mynet/org/employmentLink.ts` lines 14-19 (the interface `EmploymentLinkVocab`) to `src/employmentLinkVocabType.ts`. The declaration of the same interface that `org-employees` 0.1.0 held (copied from the same lines) has the same 14 tokens; from `org-employees` 0.2.0 on it imports the type from this unit.

Named changes, and only these:

1. the imports: `attributeSpelling` from `../termSlots` and from `../../base/termSlots` is `attributeSpelling` from `@kaigilb/gilbplatformcode-term-slots`; the type `EmploymentLinkVocab` from `../org/employmentLink` is imported from `./employmentLinkVocabType`;
2. comments only otherwise: cycle, agent and date tags, record ids and file names of the app are removed or reworded; no code changed.

`src/index.ts` and `src/employmentLinkVocabType.ts` are new files (the latter holds only the interface).

Tests (`src/*.test.ts`): `employmentLinkVocab.test.ts` has the 2 tests of the app's `lib/mynet/employment/employmentLinkVocab.s8org.test.ts` (same inputs and expectations; the `termSlots` mock is the `term-slots` peer) and 9 added; `orgTerms.test.ts` has 10 added (the app has no test of `orgTerms.ts` alone: its other tests mock it); `servedValue.test.ts` has the 5 tests of `org-employees` 0.1.0's `servedValue.test.ts`, moved here with the code (they were written for that unit, not the app's) and 4 added; `exports.test.ts` 2; `hostAgnostic.test.ts` 13 (copied).

Left out: none. The app's tests that mock `orgTerms` (`OrgHierarchySections.*`, `orgRecords.*`, `vaultProfilePhoto.logo.s8org`, `orgFinds.defaults.s9fix`) belong to the units that use it.
