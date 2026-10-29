# contact-kind-catalogue

Reads the master catalogue of contact kinds and the holder's own additions, with caches.

## What this is

Reads the master catalogue of contact kinds and the holder's own additions, with caches.

Plain async functions and types, no React, no credential of its own. The two label catalogues (`t:CircleLabel` and `t:RelationshipKind`) are read from the ontology master; the holder's own relationship kinds are read from, and written to, the holder's own vault. No entry, label, order or applicability is typed in the unit: they are the master's and the holder's answers.

The master (`contactKindCatalogue.ts`):

- `readMasterCatalogue(axis, { fetchImpl? })`: the master's entries of one axis (`"circleLabel"` or `"relationshipKind"`), ordered by `a:labelOrder`, as `{ entries, complete }`. Kept for the session (30 minutes, `CATALOGUE_TTL_MS`); a failed read is not kept. Asks the typed search once per page (at most five pages, then `complete: false`), then each entry by its address. A list that could not be read at all rejects with `CatalogueUnavailableError`: never an empty list that reads as "no kinds". An entry that did not read is left out and `complete` is `false`.
- `entryFromDoc(fetchImpl, axis, id, doc, own)`: one served entry as a `KindEntry`, or `null` when it carries no label. Resolves each `a:playableBy` and `a:kindForVault` reference to the type's own address (an unresolved one stays the reference, so it matches no type), and reads the CURIE of its `a:kindPredicate` term.
- `readEntryName(id, read)`, `readMasterEntryName(id, fetchImpl?)`: one entry's name, order and predicate reference, read by its address and kept 30 minutes; a failed read is not kept.
- `readPredicateCurie(ref, fetchImpl?)`: the CURIE of a predicate term (its own `a:typeAttribute`, a single `t:` name), kept for the session; a failed read is not kept.
- `typeAncestry(typeIri, { fetchImpl? })`: the type and every type above it by is-a, at most twelve steps; the type alone when the master did not answer.
- `getJson(fetchImpl, url)`, `CATALOGUE_TYPE`, `CatalogueUnavailableError`, `__resetCatalogueCache()`, and the types `Catalogue`, `CatalogueDeps`, `EntryName`.

The holder's own kinds (`ownKinds.ts`):

- `readOwnKinds(host, vaultId, fetchImpl?)`: every own kind of the vault, read by the list's total (pages in waves of six, documents 32 at a time, at most `MAX_OWN_KINDS` = 500 kinds), as `{ entries, total, totalIsFloor, complete }`. When the ceiling is hit or a kind did not read, `complete` is `false` and `total` says how many there are.
- `readOwnEntryName(host, id, vaultId)`: one own kind's name by its address.
- `addOwnKind(host, { vaultId, label, typeIri? })`: writes one own kind and returns it as written. Refuses before any host call with no vault or a blank name, and when the ontology names neither the type nor its fields.
- `OwnKindsHost`, `OwnKindError`, `MAX_OWN_KINDS`, `OWN_KIND_PARALLEL`, `__resetOwnKindType()`, and the type `OwnKinds`.

The user-plane vocabulary (`userVocab.ts`): `readHeaderVocab()` is the session's one read of the user-plane link catalog; a stale answer with no term is a thrown `VocabUnreadableError`, never "no terms". `USER_VOCAB_KEY` is the one query key for it.

## What this is not

- Not the pure model of the chips (ordering, filtering, naming): that is `contact-kind-model`, which this unit imports.
- Not the write of the tie between a person and a kind, and not the chip component.
- Not the vault list, the vault-record client or the credential: the vault list is `lws-vault-sets`; the two vault-record calls are host members (below).

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-kind-catalogue`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/contact-kind-catalogue` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/direct-shares <path-to-the-library>/units/folder-part <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue
```

Of those, this unit imports from five: `contact-kind-model` (`orderEntries`, the types `LabelAxis`, `KindEntry`, `CatalogueEntry`), `lws-relations` (`readUserLinkPlaneCatalog`, the type `LinkPlaneCatalog`), `lws-vault-sets` (`listVaultRecordsPage`, `mapWithConcurrency`), `term-origin` (`termOrigin`) and `term-slots` (`typeSpelling`, `attributeSpelling`). The install line is long because those units have peers of their own.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { readMasterCatalogue, readOwnKinds, type OwnKindsHost } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";

setTermOrigin("https://ontology.platform.example.test"); // once, at start-up

const host: OwnKindsHost = { createResource: yourCreate, getResource: yourRead };
const master = await readMasterCatalogue("relationshipKind");
const own = await readOwnKinds(host, "https://home.platform.example.test/base");
```

## What the host must supply

- The ontology origin: `setTermOrigin(origin)` of `term-origin`, once at start-up. The unit reads `termOrigin()` when a call is made, never when the module loads, and throws the setting's error when it is unset. The app's `MASTER_BASE` (built when its module loaded) is the function `masterBase()` for that reason.
- `OwnKindsHost`, passed as the first argument of `readOwnKinds`, `readOwnEntryName` and `addOwnKind` (both members are required: the unit reads and writes):
  - `createResource(vaultId, { type, facts })`: writes one record in the vault and answers `{ id, location, etag }`. Replaces `createResource` of the app's place library (`src/lib/mynet/place/lws.ts` line 44), called at `src/lib/contact/ownKinds.ts` line 140. Called once per `addOwnKind`, after the refusals and after the ontology's spellings are read; the `facts` keys carry the `a:` the ontology spelled.
  - `getResource(id, vaultId, entityUri?)`: reads one record's served document and answers `{ doc, etag, gone, typeUri? }`, `gone` being true for a 404. Replaces `getResource` of the same library (`src/lib/mynet/place/lws.ts` line 57), called at `ownKinds.ts` lines 77 (once per own kind of the list, with the kind's address) and 91 (`readOwnEntryName`, with the tail of the address as the id and the address as `entityUri`).
- The vault list and its credential: `lws-vault-sets` asks the platform's record list through the session bridge it needs (see its README for what it requires of the host).
- A fetch for the master reads (the global `fetch` unless you pass one). `addOwnKind` falls back to the global `fetch` for the type's own document, as the app did.

## Module state

Six module-level caches, all named here; two installed copies of this unit would each keep their own and read the master twice.

| Cache | File | What it holds | Reset |
| --- | --- | --- | --- |
| `catalogues` (line 47) | `contactKindCatalogue.ts` | the master's list of each axis, with the time it was read (30 minutes) | `__resetCatalogueCache()` |
| `typeOfEntity` (line 48) | same | the type address an entity reference resolves to | same |
| `ancestries` (line 49) | same | a type's ancestors | same |
| `predicateCuries` (line 51) | same | a predicate term's CURIE | same |
| `entryNames` (line 95) | same | one entry's name by its address, with the time (30 minutes) | same |
| `kindTypeFromUri` (line 97) | `ownKinds.ts` | the record type an own kind is written under | `__resetOwnKindType()` |

(Line numbers are the app's.) Both reset functions are the app's own test seams, and product code never calls them. `term-origin` and `lws-relations` (the user-plane catalog cache) hold state too and must exist once in an app.

## Do not

- Do not type an entry, a label or an order here, and do not turn an unreadable list into an empty one: `readMasterCatalogue` rejects, and `complete: false` means the entries are a floor.
- Do not change the query key `USER_VOCAB_KEY` (`["s5c-user-link-plane"]`) in one place only: the header's relation chips and the kind chips share the one read through it. The string carries an app step tag and is kept as it is so a page that already uses it keeps sharing the read.
- Do not call a `__reset…` function from product code.
- Do not keep the master's origin in a module constant: it is set after this module loads.
- Do not install a second copy of this unit, of `term-origin` or of `lws-relations`.

## Wrong readings

- "A holder's own kind past the first fifty is cut." It is not: the list is walked by its total up to 500 kinds, and past that the answer says `complete: false` with the true `total`.
- "`total` is the number of own kinds." It is a floor when `totalIsFloor` is true (the list was not walked to its end).
- "The `playableBy` of an entry is the type it names." It is the type's address, resolved from the entity the master serves; an unresolved reference stays as the reference, which matches no type, so the kind is not offered by a failed read.
- "`typeAncestry` always reaches the root." It stops after twelve steps, at a cycle, or at the first read that failed (the failure is not kept).
- "A failed entry-name read is remembered." Only a good read is kept; a failure is asked again.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/contact/contactKindCatalogue.ts` (whole, 286 lines) to `src/contactKindCatalogue.ts`;
- `src/lib/contact/ownKinds.ts` (whole, 142 lines) to `src/ownKinds.ts`;
- `src/lib/contact/userVocab.ts` (whole, 23 lines) to `src/userVocab.ts`.

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded). `lws-vault-sets`: `listVaultRecordsPage` and `mapWithConcurrency` are the same as the app's `src/lib/base/vaultSets.ts` and `src/lib/base/heldTypes.ts` (the seam map's name `map-limit` is not the unit that holds the app's version; `lws-vault-sets` does). `lws-relations`: `readUserLinkPlaneCatalog` and `LinkPlaneCatalog` are the same as the app's `src/lib/base/linkPlaneCatalog.ts`. `term-slots`: `typeSpelling` and `attributeSpelling` are the unit cut from the app's `termSlots.ts`. `contact-kind-model` holds `orderEntries`, `LabelAxis`, `CatalogueEntry` and `KindEntry`. `term-origin` is the setting for the ontology origin (it replaces the app's `GILBVEDA_MASTER_ORIGIN`).

Named changes, and only these:

1. the imports are the five peers above, and `./contactKindCatalogue` stays the unit's own;
2. `const MASTER_BASE = \`${GILBVEDA_MASTER_ORIGIN}/base\`;` (built when the module loaded) is `function masterBase(): string { return \`${termOrigin()}/base\`; }`, and its three uses (`entityAddress`, and the `vault` parameter and the search url of `readCatalogue`) are `masterBase()`;
3. `${GILBVEDA_MASTER_ORIGIN}/base/t/RelationshipKind` in `ownKindType` is `${termOrigin()}/base/t/RelationshipKind`;
4. the interface `OwnKindsHost` is added and exported; `readOwnKinds(vaultId, fetchImpl?)` is `readOwnKinds(host, vaultId, fetchImpl?)`, `readOwnEntryName(id, vaultId)` is `readOwnEntryName(host, id, vaultId)`, `addOwnKind(args)` is `addOwnKind(host, args)`; inside, `getResource(` (two places) and `createResource(` are `host.getResource(` and `host.createResource(`, with the same arguments at the same place;
5. comments that name a cycle, a ticket, an agent, a person, a ruling, a measuring rig or the host app are reworded; no code changed. One string literal carries an app step tag: `USER_VOCAB_KEY` (`"s5c-user-link-plane"`), kept as it is (see "Do not").

No test seam was added: the source already has `__resetCatalogueCache` and `__resetOwnKindType`.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/contactCatalogue.master.json` and `test/masterFetch.ts` are the app's `__fixtures__` files of the same name with the ontology host renamed; `test/relationsMaster.json` is the same file as in `contact-kind-model`; `test/fakeVault.ts` is the app's `mynet/place/fakePlaceStore.ts` cut to the in-memory vault, the typed list and the term spellings, with the fake host (the app's two place calls over it) added. Ported from GilbApp `src/lib/contact/` at the same commit: `contactKindCatalogue.s8labels.test.ts` 11 of 11 (here `contactKindCatalogue.test.ts`; the tests set `term-origin`), `ownKinds.s9labels.test.ts` 11 of 11 (`ownKinds.test.ts`; the three `vi.mock` of the app's record client, vault sets and term slots are the fake host and two peer mocks of the fake vault) and the two "reads" tests of `headerRelations.s5c.test.ts` that `contact-kind-model` left out (`contactKindCatalogueReads.test.ts`). New: `contactKindCataloguePinned.test.ts` (37: the export list and constants, the origin read at call time, the time and failure rules of the caches, the paging ceiling, each branch of an entry's reading, `readEntryName`, `readPredicateCurie`, `getJson`, `typeAncestry`, `readHeaderVocab`) and `ownKindsPinned.test.ts` (19: each host member's arguments and order, the refusals before any host call, the type fallback, the flags of an incomplete read, the walk of the list pages and the ceiling). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: none of the source's tests. One ported test (`ownKinds.test.ts`, "the documents are read SIDE BY SIDE and bounded") waits 2 ms inside its fake read to make the reads overlap, as the app's test does.
