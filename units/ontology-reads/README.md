# ontology-reads

The public reads of the ontology: a term's definition, a type's picture and the live search of terms, none carrying a credential.

## What this is

The public reads of the ontology: a term's definition, a type's picture and the live search of terms, none carrying a credential.

Three readers of the published ontology, taken from the app that made them. Each asks a public address and sends no `Authorization` header (the ontology's cross-origin preflight allows only `accept`, and a credential there empties the answer). Plain functions and data, no React.

- `readTermDefinition(typeName, host?)`: one type term's definition from the host that holds it. The answer has three states, never a bare `null`: `{ state: "defined", does }`, `{ state: "none" }` (the term was read and carries no definition) and `{ state: "unreachable", reason }` (the request failed; it says nothing about the term). The host defaults to `defaultOntologyHost()`.
- `fetchTypePictureSrc(typeName)`: the public address of a type's picture, or `null`. One read per name, remembered. Also `typePictureSrc(termDocument)`, `fileBytesUrl(entityIri)`, `typeTermUrl(typeName)`, `normalizeTypeName(raw)` and `TYPE_PICTURE_ATTR`.
- `searchLiveTerms(query)`: the type chooser's search. Shipped types that match come first (`BUILTIN_TYPE_OPTIONS`), then live terms from `GET <corpus origin>/base/terms?q=…&limit=20`. A query shorter than the floor asks nothing and says how many letters are missing; a failed read answers the shipped matches with `degraded: true` and the sentence `DEGRADED_REACH`. Also `corpusApiOrigin()`, `blankQueryReach()`, `shortQueryReach(q)`, `DEGRADED_REACH`, `LIVE_TERM_LIMIT`, `kindFromNodeKind`, `typeOptionFromSpec`, `VEDA_ID_PREFIX` and the types `TypeOption`, `TypeOptionKind`, `TypeSearchResult`, `TypeSearchFn`, `TermDefinition`.
- `defaultOntologyHost()`, `defaultTermIri(name, host?)`: the host of the term origin, and `https://<host>/base/t/<Name>`.
- `fetchOntologyTerm(termIri, { bust?, revalidate? }?)` (0.2.0): one term of the ontology, read at its address (`/base/t/<Name>`), as an `OntologyTermDoc` or `null` (an address that is not on the type plane, a 404, a network error or a body that is not JSON; a miss is kept like a hit). A plain read is kept for five minutes. `revalidate` asks the origin with `cache: "no-cache"` (the browser sends `If-None-Match` and a 304 costs no body); `bust` reads with `no-store` and a unique `?_=` url and is never joined to another read; concurrent identical reads share one request. A pipe-joined identity is read at its first hop-able token. Also `fetchTermAtRef(ref, opts?)` (any ref, entity or term plane, to the published term it identifies), `fetchParentChain(termIri, { sameKindOnly?, bust? }?)` (the is-a ancestors, root first, at most 24, a cycle ends the walk), `ontologyRefIri(ref, host?)` (the one address rule: a store id is on the entity plane, a name on the type plane), `looksLikeStoreId(ref)`, `hopableTermIris(identity)`, `kindFromRaw(raw)` and the types `OntologyTermDoc` and `OntologyKind`.
- `__resetOntologyTermsForTest()` (0.2.0, new): empties the term cache and the reads in flight. A test seam standing in for the app's `invalidateOntologyTermCache`, which is not taken.

The unit holds module state: the picture cache (`pictureCache`, name to answer) and, since 0.2.0, the term cache (`termDocCache`, five minutes), the reads in flight (`termDocInFlight`) and a counter that makes a bust url unique (`bustSeq`). An app must have ONE copy of it. It reads the settings of `base-origin` and `term-origin` when a function is called. Its peers: `base-origin`, `term-origin`, `vault-origin-rule`, `record-types`, `plan-kinds`.

Old name to new name (a later batch renames call sites by script):

| In the app | In this unit |
|---|---|
| `BLANK_QUERY_REACH` | `blankQueryReach()` |
| `MIN_ONTOLOGY_QUERY` | `minOntologyQuery()` from `base-origin` |
| `DEFAULT_ONTOLOGY_HOST` | `defaultOntologyHost()` |
| `TYPE_TERM_ORIGIN` | `termOrigin()` from `term-origin` |
| `BASE_ORIGIN` | `baseOrigin()` from `base-origin` |
| `PUBLIC_CORPUS_ORIGIN` | `publicCorpusOrigin()` from `base-origin` |
| env `VITE_ONTOLOGY_API_ORIGIN` | `ontologyApiOrigin()` from `base-origin` |
| env `VITE_MIN_ONTOLOGY_QUERY` | `setMinOntologyQuery(n)` of `base-origin` |

## What this is not

- Not a writer: it never sends a credential and never writes.
- Not the whole `typeSearch`, `termSearch`, `typePicture` and `ontologyBrowse` of the app. Only the symbols the Plan-card readers reach are taken; the old registry-and-catalogue search (`searchBaseVedaTypes`), `searchBaseVedaCorpus`, `inferTypeName`, `fileThumbnailSrc`, `recordTypePictureSrc` and the ontology browser are not here.
- Not a default. There is no built-in ontology host or corpus origin.

### Changes in 0.2.0

Taken from the same GilbApp commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, because the census of a vault's held types (`vault-type-census`) reads a term by its address and walks its is-a parents to learn the term's plane. New file `src/ontologyTerms.ts`, copied by script from `src/lib/base/ontologyBrowse.ts` (the ranges under "Where it came from"; 278 code lines). Named changes: `DEFAULT_ONTOLOGY_HOST` (line 18, the default of `ontologyRefIri`'s `host`, line 221) is `defaultOntologyHost()`, as in 0.1.0; five long comments (about the in-flight reads, why a bust is never joined, why a finished read removes only its own entry, why the bust url carries a counter, and why the revalidating read uses `no-cache`) are rewritten shorter with the same facts; tags, names and hosts in the other comments are removed; no other code changed. New code, not in the app: `__resetOntologyTermsForTest()` (6 lines at the end of the file). Dynamic imports in the lines taken: none (the file's one `import()` is elsewhere). Nothing of 0.1.0 changed. Tests: `src/ontologyTerms.address.test.ts` (13) is ported from `ontologyAddress.test.ts` (13 of 17; the `loadOntologyFocus` blocks are not taken) and `src/ontologyTerms.revalidate.test.ts` (8) from `ontologyReadRevalidate.c161.test.ts` (8 of 10; the two that go through `loadOntologyFocus` are left out), with the hosts made `example.test` hosts and the app's `invalidateOntologyTermCache` replaced by the test seam. New: `src/ontologyTerms.test.ts` (18). Left out: `ontologyInFlightCoalescing.c161.test.ts` (8; most call `invalidateOntologyTermCache`, which is not taken). The peer range of `lws-relations` on this unit is `^0.2.0`. One mutant survives and is equivalent: the check `termIri.includes("/base/t/")` inside `fetchOntologyTermOnce` repeats the one in `fetchOntologyTerm`, its only caller.

## How to take it

Package: `@kaigilb/gilbplatformcode-ontology-reads`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/ontology-reads` prints:

```sh
npm install <path-to-the-library>/units/ontology-reads
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { readTermDefinition, searchLiveTerms } from "@kaigilb/gilbplatformcode-ontology-reads";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
setTermOrigin("https://ontology.platform.example.test");

await readTermDefinition("Person"); // { state: "defined", does: "…" }
await searchLiveTerms("rule"); // { options, reach, degraded }
```

## What the host must supply

- `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (from `base-origin`) and `setTermOrigin(...)` (from `term-origin`), once at start-up.
- Optionally, from `base-origin`: `setOntologyApiOrigin` (a corpus origin other than the platform origin), `setMinOntologyQuery` (the floor; 3 if unset).
- On a local development rig only: `setLocalRigHosts([...])` naming the rig host(s) the app tested for (the app tested for three loopback names) and `setPublicCorpusOrigin(...)`. The rig branch of `corpusApiOrigin()` is the only place the public corpus origin is read, so a production host never needs it.

## Do not

- Do not send a credential to these addresses: the ontology's preflight allows only `accept` and `if-none-match`, and a credential makes every cross-origin answer empty.
- Do not read an unreachable term as an undefined one: test `state`, not truthiness.
- Do not install a second copy of this unit: each would keep its own picture cache.
- Do not call the old constants (`BLANK_QUERY_REACH`, `MIN_ONTOLOGY_QUERY`, `DEFAULT_ONTOLOGY_HOST`); they are functions here because the settings are set at start-up, not at load.

## Wrong readings

- "The search is the old catalogue search." It is the server-side term search (`GET /base/terms`). The old registry-and-catalogue search is not in this unit.
- "A failed read says there is no such type." It does not: it answers the shipped matches with `degraded: true` and the unreachable sentence.
- "`corpusApiOrigin()` is the platform origin." Only when no override is set and the platform origin is not a local rig: with an override it is the override; on a local rig (the platform host is one of `localRigHosts()`) it is `publicCorpusOrigin()`, because a local ontology is thin. With no rig host set, which is the default, the rig branch is never taken.
- "An unset rig list means a local base is a production base." For this reader, yes: a local base with no rig host set is asked for terms like any other platform origin.
- "A trailing slash on the override is removed by the reader." The settings of `base-origin` already hold an origin without one; the reader's own removal is kept as in the app but cannot run.
- "A one-letter query is refused." Only below the floor (3 by default); a floor of 0 asks for any query; the query is counted trimmed.
- "A 404 for a picture is asked again." It is not: a 404 is remembered as no picture; a failed read (a 5xx or a network error) is not remembered.
- "`fileBytesUrl` keeps the address's host." It asks `vaultOriginOf` (peer `vault-origin-rule`): a host outside the platform family is answered at the platform origin.
- "The message strings carry the platform name." Some name the app that made them ("the types GilbApp ships"); they are kept as they are.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script, symbol by symbol (the reached ones only):

- `src/lib/base/typeSearch.ts` to `src/typeSearch.ts`, lines 105, 107-118, 126-155, 157-171, 173-179, 181-190, 192-196, 210-211, 218-237, 239-246, 248-250, 370-381, 383-475, 477-482, 484-488, 490-493, 495-496, 550-556, 558-569, 571-577;
- `src/lib/base/termSearch.ts` to `src/termSearch.ts`, lines 69-76 (`isLocalDevHost`) and 78-90 (`corpusApiOrigin`);
- `src/lib/base/termDefinition.ts` to `src/termDefinition.ts`, lines 51-64, 66-74, 76-121;
- `src/lib/base/typePicture.ts` to `src/typePicture.ts`, lines 15, 20-32, 64-68, 89-117, 123-152, 154-161;
- `src/lib/base/ontologyBrowse.ts` to `src/ontologyBrowse.ts`, lines 18 and 1644-1646.
- `src/lib/base/ontologyBrowse.ts` to `src/ontologyTerms.ts`, added in 0.2.0: lines 19-20, 43-72, 104-105, 112-116, 117-131, 132-150, 151-161, 162-167, 168-175, 176-204, 205, 206-209, 210-231, 232-251, 252-259, 260-273, 274-292, 421-434, 491-529, 530-557, 589-591, 592-606, 607-609, 610, 1104-1152, 1153-1228, 1229-1266, 1267-1313 (`OntologyKind`, `OntologyTermDoc`, `PARENT_CHAIN_MAX`, `publicHeaders`, `HOPABLE_TERM_IRI`, `hopableTermIris`, `hopableTermIri`, `typeNameFromIri`, `pickString`, `STORE_ID_RE`, `UUID_RE`, `looksLikeStoreId`, `ontologyRefIri`, `refIdOf`, `pickId`, `pickIds`, `kindFromRaw`, `fetchOntologyEntityAsTerm`, `canonicalIdentity`, `docFromRaw`, `termDocCache`, `termDocInFlight`, `bustSeq`, `TERM_CACHE_TTL_MS`, `fetchOntologyTerm`, `fetchOntologyTermOnce`, `fetchTermAtRef`, `fetchParentChain`). Not taken: `invalidateOntologyTermCache` (it also empties the caches of the parts not taken), `loadOntologyFocus` and the rest.

Named changes, and only these:

1. `PLAN_ONLY_TYPE_IDS` is imported from the merged unit `plan-kinds` (its body is the same as the source, lines 256-263; compared by script), `RECORD_TYPES` and `RecordTypeSpec` from `record-types`, and `vaultOriginOf` from `vault-origin-rule`; their imports from the app's own files are replaced;
2. `MIN_ONTOLOGY_QUERY` (a constant read from the environment at load, with `readMinOntologyQuery` and `DEFAULT_MIN_ONTOLOGY_QUERY`, none of them taken) becomes `minOntologyQuery()` from `base-origin`; `BLANK_QUERY_REACH`, built from it at load, becomes the function `blankQueryReach()`;
3. the environment read `import.meta.env.VITE_ONTOLOGY_API_ORIGIN ... ?.trim()` becomes `ontologyApiOrigin()`;
4. `isLocalDevHost` tests `localRigHosts().has(h)` in place of the three fixed loopback names; `PUBLIC_CORPUS_ORIGIN` (line 67, not copied) becomes `publicCorpusOrigin()`, read only inside the rig branch; `BASE_ORIGIN` becomes `baseOrigin()`;
5. `DEFAULT_ONTOLOGY_HOST` (`"veda.gilb.com"`, line 18 of `ontologyBrowse.ts`) becomes `defaultOntologyHost()`, `new URL(termOrigin()).host` (peer `term-origin`), in `defaultTermIri` and `readTermDefinition`;
6. `TYPE_TERM_ORIGIN` (`typePicture.ts` line 18, not copied) becomes `termOrigin()` in `typeTermUrl`;
7. comments that name a host or a replaced constant are reworded, no code changed.

`scripts/check-host-agnostic.mjs` differs from the model unit's copy by one pattern: the ontology-host test `/veda\./i` is `/veda\.[a-z0-9]/i`. The shipped sentences "…to search all of GilbVeda." end in a full stop that the old pattern read as a host. The new pattern still fails on `veda.gilb.com`, `veda.example.test` and any `veda.` followed by a letter or digit; `src/hostAgnostic.test.ts` plants both cases.

`src/index.ts` is new. Tests: `termDefinition.test.ts` (all 14), `typePicture.test.ts` (6 of the 15: the `typePictureSrc` block, `normalizeTypeName` and `typeTermUrl`) and `typeSearch.plane.test.ts` (1 of 3, `kindFromNodeKind`) are ported, with the hosts changed to `example.test` hosts and the settings set in a `beforeEach` in place of the environment. Left out: from `typePicture.test.ts` the tests of `inferTypeName`, `fileThumbnailSrc` and `recordTypePictureSrc` (not taken); `typeSearch.test.ts` (25 tests, all on `searchBaseVedaTypes`, the old catalogue search, with a mocked catalogue; none calls a taken symbol); from `typeSearch.plane.test.ts` the `optionMatchesPlane` block (not taken). `ontologyReads.test.ts` is new and pins every export, including `searchLiveTerms`, which the app's own tests do not call. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
