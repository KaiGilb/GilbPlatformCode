# vault-type-census

Learning what a vault holds, by type and plane, from its census of held types: which of the held type names go on the records door, found by dereferencing each term, with the one catalogue read that stands in when the platform serves no census.

## What this is

Learning what a vault holds, by type and plane, from its census of held types: which of the held type names go on the records door, found by dereferencing each term, with the one catalogue read that stands in when the platform serves no census.

A vault answers "which types do you hold, for me, with counts?" on its census door (`listVaultHeldTypes` in `lws-vault-sets`). Before the grid asks the records door for those names on `?type=`, it needs to know which PLANE each sits on: an entity, function or value type is a grid row; a relation-plane or attribute-plane type is not named on the records door. This unit learns the plane by dereferencing the type's term (`ontology-reads`), never from a list of its own. Plain functions and types, no React.

- `heldTypePlanes(bareNames)`: the plane of every census-named type, with the request counts the per-view log prints (`dereferences`, `parentWalks`, `batched`). One dereference per name at the term's identity address (`defaultTermIri`, or the ontology API origin when `setOntologyApiOriginRaw` was set, as given), at most `MAX_PARALLEL_DEREFERENCES` in flight; a term whose facts carry no node kind walks its is-a parents first. A name whose term does not dereference is `uncatalogued`. When the batched vocabulary read is served (`vocabTypeBatchServed()`), one `GET /base/vocab?type=a&type=b` per at most 100 names replaces the dereferences, and a chunk that fails falls back to the singular path.
- `vocabTypeBatchServed()`: true only when `setVocabTypeBatchRevisions` named a revision (or a prefix of one) and the platform's `/version` answers with it. The revision is read once per session. Never a probe of the vocabulary door's body shape.
- `censusBareNames(rows)`, `classifyCensusNames(bare, reading)`, `isIssuedOnTypeFind(plane)`: the pure derivation of "which of the held names go on `?type=`": the create planes plus an uncatalogued name.
- `chosenCensusCandidates(census, isChosen)` and `issueChosenCensusNames(candidates, reading)`: the same for a person's chosen types, which also issue a chosen relation kind (even one the census lists only under `excludedTypes`).
- `catalogNodeTypeNames()`, `readFindTypeCatalog()`: the fallback when the platform serves no census: the opt-in vocabulary listing (`?status=all`), read once a minute, as the names of the create planes (Things, Functions, Values). `classifyPlane(term, ancestors)`, `isCreatePlane(plane)` and the types `VedaPlane`, `VocabTypeEntry`.
- `__resetServedRevisionForTest()`: a test seam that forgets the session's `/version` reading.

The unit holds module state: `servedRevisionInFlight` (the `/version` reading, once per session), `ontologyBrowseInFlight` (the lazily loaded `ontology-reads`) and the catalogue's `findCached`, `findCachedAt` and `findInFlight`. An app must have ONE copy of it. It reads the settings of `base-origin` when a function is called and calls `ontology-reads` and `lws-vault-sets`. Its peers: `base-origin` (`baseOrigin`, `ontologyApiOriginRaw`, `vocabTypeBatchRevisions`; 0.2.0), `lws-vault-sets` (`mapWithConcurrency`, `MAX_PARALLEL_DEREFERENCES`, `typeLocalName`) and `ontology-reads` (`fetchOntologyTerm`, `fetchParentChain`, `defaultTermIri`; 0.2.0), which need the peers `node scripts/peers.mjs units/vault-type-census` prints.

## What this is not

- Not the census call. `listVaultHeldTypes` is in `lws-vault-sets` (0.2.0); the caller fetches the census and passes its rows in. That keeps this unit off the records and write layer, and keeps the call visible to a per-view request count.
- Not the whole of the app's `heldTypes.ts` and `vocabCatalog.ts`. Not taken: `MAX_PARALLEL_DEREFERENCES` and `mapWithConcurrency` (lines 106-111 and 116-151 of `heldTypes.ts`, already in `lws-vault-sets`), the file's header comment (1-61) and imports; from `vocabCatalog.ts` the create-side catalogue (`readTypeCatalog`, `listPublishedTypeTerms`), the attribute reads and searches, `catalogEntityTypeNames` and the type search, which no host member reaches.
- Not a cache of the census. The census is never kept; the catalogue is kept for a minute and the `/version` reading for the session.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-type-census`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/vault-type-census` prints:

```sh
npm install <path-to-the-library>/units/vault-type-census
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-records` and `record-cache-kit` do. `@tanstack/react-query` is a dev dependency only (a peer of `lws-vault-sets`); the unit does not call it.

## Examples

```ts
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { listVaultHeldTypes } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { censusBareNames, classifyCensusNames, heldTypePlanes } from "@kaigilb/gilbplatformcode-vault-type-census";

setBaseOrigin("https://platform.example.test");
setTermOrigin("https://ontology.platform.example.test");

const census = await listVaultHeldTypes("https://kai.platform.example.test/base"); // null: the platform serves no census
if (census) {
  const bare = censusBareNames(census.types);
  const reading = await heldTypePlanes(bare);
  const { issued, notIssued, uncatalogued } = classifyCensusNames(bare, reading);
  // `issued` goes on ?type=; `notIssued` are relation and attribute planes
}
```

## What the host must supply

- `setBaseOrigin(...)` from `base-origin` and `setTermOrigin(...)` from `term-origin`, once at start-up (the term address is built on the term origin).
- Optionally `setOntologyApiOriginRaw(text)` (a rig that serves terms at another origin, used as given) and `setVocabTypeBatchRevisions(text)` (the platform revisions at which the batched read is served; unset keeps it off), both from `base-origin`.
- Nothing else: there is no host object. The calls go to the peers.

## Module state

An app must have ONE copy of this unit: it keeps the `/version` reading and the catalogue's cache, and two copies would each read and keep their own.

## Do not

- Do not put an `authorization` header on the vocabulary read: the platform's preflight does not allow it and the browser rejects the request before it is sent.
- Do not fold the opt-in listing into the canonical one, or the other way: the find needs the opt-in listing (every servable term, with its true status), the create surfaces the canonical one.
- Do not add a list of planes or of type names here: the plane comes from the term's own facts.
- Do not replace the revision gate with an unconditional batched call or a fallback on error: a platform that predates the selector does not refuse it, it ignores it and answers the whole vocabulary document (175 MB).

## Wrong readings

Defects and quirks found while taking the code. Kept as the app has them, listed for the owner.

- "A refused catalogue read is not kept." It is: `fetchVocabGraphAt` answers `[]` for a non-200, `readFindTypeCatalog` keeps that empty list for a minute (`stale: true` is reported, but the empty list shadows the last good terms for that minute). Only a thrown error gives the last good terms back.
- "The `/version` reading is retried." It is not: a failed read (non-200, a throw, no revision) is kept for the session as "no revision", so the batched read stays off until a reload.
- "`classifyPlane` follows the platform's plane names." It follows its own order: relation, attribute, value, function, else entity. `a:providesFunction` is deliberately not a function marker (every type carries one).
- "The ontology API origin is a parsed origin." Here it is the text as set, trimmed, with one trailing `/` removed (the app read it that way); the term search's parsed origin is a different setting.
- "The batched read splits at 100 names for the platform's limit." It splits at 100 as the app does (`VOCAB_TYPE_BATCH_MAX`); nothing checks the platform's cap.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer that stops at the symbols of merged units):

- `src/lib/base/heldTypes.ts` to `src/heldTypes.ts`: lines 65-104, 112-114, 152-510 (`OntologyBrowse`, `ontologyBrowseInFlight`, `ontologyBrowse`, `HeldTypePlane`, `HeldTypePlaneReading`, `VOCAB_TYPE_BATCH_MAX`, `isIssuedOnTypeFind`, `termIdentityIri`, `publicVocabHeaders`, `singularPlane`, `planeOfTermFacts`, `pinnedBatchRevisions`, `servedRevisionInFlight`, `servedBaseRevision`, `vocabTypeBatchServed`, `__resetServedRevisionForTest`, `chunk`, `batchedPlanes`, `heldTypePlanes`, `IssuableTypeNames`, `censusBareNames`, `classifyCensusNames`, `ChosenCensusCandidates`, `chosenCensusCandidates`, `issueChosenCensusNames`). `MAX_PARALLEL_DEREFERENCES` and `mapWithConcurrency` (105-111, 115-151) are in `lws-vault-sets`.
- `src/lib/base/vocabCatalog.ts` to `src/vocabCatalog.ts`: lines 8-20, 21-28, 40, 77-81, 94-114, 115-195, 199-203, 217-227, 228-242, 243-255, 256-287, 343-356, 357-379, 402-426, 427-438, 446-484 (`VedaPlane`, `VocabTypeEntry`, `TTL_MS`, `pickLabel`, `publicVocabHeaders`, `fetchVocabGraphAt`, `OPT_IN_VOCAB_URL`, `parentId`, `bindsAttributePredicate`, `VALUE_MARKERS`, `classifyPlane`, `findCached`, `findCachedAt`, `findInFlight`, `readFindTypeCatalog`, `catalogNodeTypeNames`, `isCreatePlane`, `deriveTypeEntries`).

**Dynamic imports in the files taken (the tracer does not follow `import()`; both files were searched with `grep "import("`):** `heldTypes.ts` line 78, `import("./ontologyBrowse")`, and the type `typeof import("./ontologyBrowse")` at line 75: both are now the peer `ontology-reads`, still loaded on the first census and not at module load. `vocabCatalog.ts`: none.

**Merged units compared with the app's functions (each reached symbol, comments stripped) and taken as peers or not.**

- `lws-vault-sets`: `mapWithConcurrency`, `typeLocalName`, `listVaultRecordsPage` are equal. Peer.
- `ontology-reads`: `fetchOntologyTerm`, `fetchParentChain` and `defaultTermIri` are the app's, taken in 0.2.0 (equal but for the host default, its named change). Peer.
- `base-origin`: new settings in 0.2.0. Peer.
- `units/type-plane` overlaps `vocabCatalog.ts` and `heldTypes.ts` by name (`classifyPlane`, `isCreatePlane`): not compared as equal and not used; this unit copies the app's.

Named changes, and only these:

1. in `heldTypes.ts` the imports `./config`, `./recordPlane` and `./vocabCatalog` are replaced by imports of `base-origin`, `lws-vault-sets` and this unit's `./vocabCatalog`; in `vocabCatalog.ts` the imports `./config` and `./recordTypes` are replaced by `base-origin` (`isAppAddressableSlug` is not used by the lines taken);
2. `heldTypes.ts` line 75 `typeof import("./ontologyBrowse")` and line 78 `import("./ontologyBrowse")` are `import("@kaigilb/gilbplatformcode-ontology-reads")`;
3. `heldTypes.ts` line 179 `(import.meta.env.VITE_ONTOLOGY_API_ORIGIN as string | undefined)?.trim()` is `ontologyApiOriginRaw()?.trim()`: the value as set, not parsed; line 229 `import.meta.env.VITE_VOCAB_TYPE_BATCH_REVISIONS as string | undefined` is `vocabTypeBatchRevisions()`: undefined when unset, which the code reads as the empty text, as before;
4. `heldTypes.ts` lines 243 and 297 `${BASE_ORIGIN}` and `vocabCatalog.ts` line 203 `${BASE_ORIGIN}` are `${baseOrigin()}`;
5. comments: the long notes (about the lazy load, the term address, the plane derivation, the chosen types, the opt-in listing and the cost of the fallback) are rewritten shorter with the same facts; internal cycle, ticket and agent tags, names and hosts are removed; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, not shipped): ported `heldTypes.test.ts` (all 21) and `vocabCatalog.nodeTypeNames.test.ts` (1 of 1; its `catalogEntityTypeNames` lines are cut), with the app's environment values replaced by the `base-origin` settings, the collaborators mocked at the package name `ontology-reads` and the hosts made `example.test` hosts. New: `src/census.test.ts` (29: the plane rules and their order, the pure name derivations, the parent walk, the override and revision parsing, the catalogue read and its cache). Left out: `vocabTypeBatchPin.test.ts` and `vocabTypeBatchPin.live.test.ts` (they read the app's `package.json` build command and run its pin script), `recordHooks.census.test.ts` (8) and `recordHooks.census.live.test.ts` (1) go with the record hooks unit. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
