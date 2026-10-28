# lws-relations

Writing, reading and ending the relations between two records in a vault over the platform's relation interface, and the share acts and link-plane checks a relation write goes through.

## What this is

Writing, reading and ending the relations between two records in a vault over the platform's relation interface, and the share acts and link-plane checks a relation write goes through.

A relation here is the reified link between two records: its own document at `/base/r/<id>` with a type (the predicate) and two ends (`role:source`, `role:target`). The unit writes one (create and update are the same `PUT`), reads the ones a record takes part in, reads one relation's document, and ends one. A relation write is not a bare `PUT`: it first checks the type against the platform's live link-plane catalogue (or, for a relation that names its own roles, against the GilbVeda master), and a `t:PartOf` link into a public folder makes the new link and the member public too. Those two pieces, the catalogue and the share acts, are in the unit because the write reaches them. Each call is addressed at the vault the record lives in and signs through the auth seam (`lws-session-bridge`). Plain functions and types, no React.

- `writePairRelation(input)`: create or update a relation. `PUT /base/r/<id>` with `{ type, agent, facts, vault, valid_from? }`. Answers `{ id, changed, uri?, notMadePublic?, relations? }`. A relation id without `asCreate` is an update (no reverse lookup, no folder step); a create reads the source's relations once and returns the rows. `WriteRelationInput` is its argument type (`sourceId`, `targetId`, `typeCurie?`, `relationId?`, `asCreate?`, `vaultNamespace?`, `sourceEntityUri?`, `targetEntityUri?`, `extraFacts?`, `validFrom?`, `roles?`, `onSent?`, `signal?`).
- `endRelation(relationIdOrUri, vaultNamespace?)`: end a relation with `POST /base/r/<id>/end` (no body, no content type), then read the document back. Answers `{ relation, changed, verified }`. Throws `RelationSurvivedEndError` when the read-back still frames the ends, and an error when the vault applied the act somewhere other than where it was sent.
- `memberEntityUri(idOrUri, preferredUri?, vaultNamespace?)`: the address of a member: the framed `@id` when it is an address, else an id that already is one, else the vault namespace and the id, else the platform origin and the id.
- `hostOfUri(uri)`: the lower-cased host of an address, or `null`.
- `readRelations(id, at)`: `GET /base/e/<id>/relations`, the `(relation, role)` rows a record takes part in, with the relation's type and its co-members when the vault sends them. `[]` on 404. `relationsKey(id, at)` is the cache key of that question: the id and the origin it was asked at, so two doors are two keys.
- `readRelationDoc(relationIdOrUri, at?)`: `GET /base/r/<id>` signed with a proof, as a `RelationDoc` (`id`, `uri`, `typeCurie`, `sourceUri`, `targetUri`, `extras`, `otherRoles?`), or `null` on 404. `relationDocFromJson(id, doc)` is the parser, and expands a `base:e/...` reference against the document's own `@id`.
- `uriTail(uri)`: the last path segment of an address, decoded.
- `shareEntity(recordId, grantee, mode, vaultNamespace, door, opts?)`, `revokeEntityShare(recordId, principal, vaultNamespace, door, opts?)`: share one record (read, or write in one act) and take a principal's grants back (one patch per predicate; on a refused patch, `revoke-direct`). `grantPublicOnRelation(uri)`, `revokePublicOnRelation(uri)`: public read on one folder link. `grantDirectUrl`, `revokeDirectUrl`, `entityUriForShare`, `listDirectShares(facts)`: their addresses and the list of direct shares on a record. `onEntityShareChanged(listener)`: the signal that a share list changed.
- `setFolderTreePublic(folder, on, vaultNamespace, door)`, `inheritFolderPublic(input)`, `isPublicFolder(folder, door)`, `listFolderPartMembers(folder, door)`: make a folder, its links, its members and the folders inside it public (or take that back), the hook a new link into a public folder runs, and who is a member of a folder, read from what each link means.
- `publicGrantee()`, `isPublicPrincipal(principal)`: the platform's "everyone" grantee, built from the ontology origin the host set, and the exact-equality test for it.
- `readUserLinkPlaneCatalog()`, `catalogFromGraph(graph, plane, stale?)`, `liveIsOfferable(curie)`, `LINK_PLANES`, `__setCatalogForTest(catalog | null)`: the live user-plane link catalogue (read once a minute from the public corpus origin) and the set of types a person may link with. The last is the test seam that injects a catalogue and empties the module state below.
- `GENERIC_PREDICATE_CURIE` (`t:ConnectedTo`), `RELATION_CATEGORY_CURIE` (`t:Relation`, never written), `mintRelationId()`, `boundAwait`, `BoundTimeoutError`, `isBoundTimeout`: the default predicate, the term that is refused, the 26-digit id of a new relation, and the bounded wait the write uses.

The unit holds module state: `byCurie`, `cached`, `cachedAt` and `inFlight` (the live catalogue and the read in flight, `linkPlaneCatalog.ts`) and `shareListeners` (`entityShare.ts`). An app must have ONE copy of this unit, or each copy reads and keeps its own catalogue and a share signal does not reach a listener in the other. It reads the settings of `base-origin` through `vault-origin-rule` and the ontology origin of `term-origin` when a function is called, and signs through `lws-session-bridge`. Its peers: `base-origin`, `direct-shares`, `folder-part`, `lws-records` (from 0.2.0), `lws-session-bridge` (which needs `signin`), `lws-vault-sets`, `ontology-reads`, `record-types`, `relation-role`, `share-refusal`, `term-origin`, `type-curie`, `vault-origin-rule`.

## What this is not

- Not the whole relation code of the app. Only what a relation write, a relation read, an end and the folder-public hook reach is taken. Not here: `resolveMemberEntityUri` (relationWrite.ts), `opaqueIdFromUri`, `memberIdsFromRelationDoc`, `memberUrisFromRelationDoc` and `roleLabel` (relations.ts), `roleIs` and `expandRelationRef` (relationDoc.ts), `shareEntityRead`, `shareFolderAndMembers`, `listFolderMemberships`, `listFolderMemberIds`, `isUnderFolder` (entityShare.ts; `shareRefusalMessage`, also defined there, is imported from `share-refusal`), `notMadePublicSentence` (folderPublic.ts), `childrenOf`, `termByCurie`, `livePredicateLabel`, `liveIsDirected`, `cachedUserCatalog` and `invalidateLinkPlaneCatalog` (linkPlaneCatalog.ts), `plainBoundStep` (boundAwait.ts), the rest of `relationPredicates.ts` (the predicate labels, `isOfferablePredicate`, `readRelationType`) and `PUBLIC_LABEL`, `isPublicReadEdge` and the vault-level public acts (publicAccess.ts). `roleIs` and `opaqueIdFromUri` are in `relation-role` and `id-tail` (equal to the app's); the rest are for a later unit.
- Not `lws-records`. It reads a record and patches a record through that unit, and takes `factsAsServed` and `writeSource` from its 0.2.0.
- Not a sign-in and not a cache of relations. Every read is a request; the key helper is for the host's cache.
- Not a relation graph. It reads one record's relations and one relation's document; walking a graph is the app's.

## How to take it

Package: `@kaigilb/gilbplatformcode-lws-relations`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/lws-relations` prints:

```sh
npm install <path-to-the-library>/units/lws-relations
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-session-bridge`'s does, because a unit's type check reads its peers' source and the peer `signin` does not pass it.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { endRelation, readRelations, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
setTermOrigin("https://ontology.platform.example.test");
setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: "https://platform.example.test/base/auth/session/dpop-token" })));

const vault = "https://kai.platform.example.test/base";
const a = `${vault}/e/note-a`;
const b = `${vault}/e/note-b`;
const { id } = await writePairRelation({ sourceId: "note-a", targetId: "note-b", sourceEntityUri: a, targetEntityUri: b, typeCurie: "t:Reference", vaultNamespace: vault });
const rows = await readRelations("note-a", a); // [{ relation: ".../base/r/<id>", role: "role:source" }, ...]
await endRelation(id, vault); // { relation, changed, verified }
```

## What the host must supply

- `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, once at start-up.
- `setTermOrigin(...)` from `term-origin`, once at start-up: the GilbVeda master's origin. A relation that names its roles is checked at `<origin>/base/t/<Type>`, and the public grantee is `<origin>/base/t/PublicGrantee`. Called before it is set, those calls throw an error that names `setTermOrigin`.
- `setLwsAuth(host)` from `lws-session-bridge`, once at start-up. Called before it is set, a call that signs a request rejects with an error that names `setLwsAuth`.
- For the link-plane catalogue: `setOntologyApiOrigin(...)` if the term search is answered elsewhere than the platform origin, and on a local rig only `setLocalRigHosts([...])` and `setPublicCorpusOrigin(...)` (the catalogue is read from the origin `corpusApiOrigin()` of `ontology-reads` names).

## Do not

- Do not install a second copy of this unit: the catalogue and the share signal are module state.
- Do not call `bearerHeaderFor(url)` for a request that is not a GET without naming the method: a DPoP proof names it. The three write sites here do (see below).
- Do not pass `undefined` for `at` to `readRelations`: pass the record's own entity URI, or `null` only where none exists. The answer is the answer at that door: `null` asks the platform origin and gets `[]` for a record that lives in a vault.
- Do not build a cache key for `readRelations` by hand; use `relationsKey`, which carries the origin.
- Do not write `t:Relation` as a type: it is the category of predicates, and `writePairRelation` refuses it.

## Wrong readings

- "The bearer fallback is a second credential." It was in the app (a DPoP proof first, a bearer token after a refused proof). Here `bearerHeaderFor` answers the same sender-constrained pair as `dpopWriteAuth` (the bridge's README says why), so a refused proof is followed by a second, fresh proof for the same method and URL, not by a weaker credential. The two-step is kept as the app wrote it; if the first failed because the session is bad, the second usually fails the same way. What changed is the argument: the app's bearer token did not name a method and a proof does, so each fallback now names the method of its own request (see "Where it came from", change 5).
- "Every write that times out on its proof falls back." The relation `PUT` and the `/end` `POST` do not: a proof that timed out (`isBoundTimeout`) is rethrown, so a stuck sign-in is never waited for twice. The per-item share acts (`grantPublicOnRelation`, `revokePublicOnRelation`, `shareEntity`, `revokeEntityShare`'s fallback) fall back after ANY failure of the proof, a timeout included. Kept as the app wrote it.
- "A 2xx is the outcome." For an end it is not: the status is read, then the relation document is read back and a connection that still frames its ends is a failure (`RelationSurvivedEndError`). A 404 on the `/end` is `verified: null`, never `true`: it may be the wrong vault.
- "A write that names a type the catalogue does not list is written." It is refused with "not a live user-plane join". A cold catalogue does not widen the door: it is read once (and kept a minute), and a read that fails lists nothing, so every type off the fast path is refused until it succeeds. A relation that names its `roles` is not checked against the catalogue but on the master (the term exists and is a relation, itself or by up to eight parents).
- "A link into a public folder makes the member public everywhere." Only `t:PartOf` asks the hook, only on a create, and what could not be made public is returned in `notMadePublic`, not thrown: the link itself landed.
- "`listDirectShares` here is the one in `direct-shares`." Both answer the same on the inputs tried, but the code differs (this unit keeps the app's, the other is a rewrite), so only `parseGrantPrincipals` and the `DirectShareEntry` type are imported from `direct-shares`.
- "`isPublicPrincipal` accepts a near miss." It compares exactly, as the platform does. The grantee it compares to is `publicGrantee()`, so a host that sets a different ontology origin shares with a different string; the app had the one literal.
- Two kept oddities, for the owner and not fixed here: a reference is read as an address when it merely STARTS with `http` (`idOf`, relationDoc.ts: `httpx:..` passes), while `memberEntityUri` requires `http://` or `https://`; and `entityUriForShare` accepts an `entityUri` that starts with `http` but an id only with `http://` or `https://`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from `readRelations`, `relationsKey`, `readRelationDoc`, `writePairRelation`, `endRelation` and `memberEntityUri`, and from the host members of the stakeholder, tag-link, impact and value-write families):

- `src/lib/base/relations.ts` to `src/relations.ts`: lines 1-22 (the file's header comment), 28-61 (`relationsKey`), 84-88 (`authHeader`), 90-144 (`readRelations`), 146-157 (`uriTail`);
- `src/lib/base/relationDoc.ts` to `src/relationDoc.ts`: lines 1-3 (header comment), 11-24 (`RelationDoc`), 26-39 (`vaultBaseFromDocId`), 41-80 (`idOf`), 82-84 (`firstValue`), 114-124 (`roleUri`), 137-162 (`relationDocFromJson`), 164-179 (`getRelationJson`), 181-220 (`readRelationDoc`);
- `src/lib/base/relationWrite.ts` to `src/relationWrite.ts`: lines 1-18 (header comment), 39-116 (`WriteRelationInput`, `memberEntityUri`), 152-156 (`termLocalName`), 158-167 (`termIsRelation`), 169-177 (`subTypeUri`), 179-204 (`assertMasterRelation`), 206-268 (`writePairRelation`), 270-271 (`FOLDER_LINK_CURIE`), 273-285 (`signingInBoundMs`), 287-350 (`putKnownRelation`), 352-388 (`createPairRelation`), 390-396 (`RelationSurvivedEndError`), 398-410 (`EndRelationResult`), 412-420 (`hostOfUri`), 422-598 (`endRelation`);
- `src/lib/base/relationPredicates.ts` to `src/relationPredicates.ts`: lines 198-246 (`GENERIC_PREDICATE_CURIE`), 258-264 (`RELATION_CATEGORY_CURIE`);
- `src/lib/base/relationId.ts` to `src/relationId.ts`: lines 1-13 (`mintRelationId`);
- `src/lib/base/boundAwait.ts` to `src/boundAwait.ts`: lines 1-7 (`BoundTimeoutError`), 14-45 (`isBoundTimeout`, `boundAwait`);
- `src/lib/base/publicAccess.ts` to `src/publicAccess.ts`: lines 17-18 (`PUBLIC_GRANTEE`), 23-28 (`isPublicPrincipal`);
- `src/lib/base/entityShare.ts` to `src/entityShare.ts`: lines 1-9 (header comment), 20-192 (`ShareMode`, `ShareListener`, `shareListeners`, `onEntityShareChanged`, `emitEntityShareChanged`, `grantDirectUrl`, `entityUriForShare`, `toWireFacts`, `shareEntity`), 367-394 (`listDirectShares`), 396-628 (`samePrincipal`, `typeBareOf`, `namedVaultOf`, `grantFieldValue`, `revokeEntityShare`, `revokeDirectUrl`, `grantPublicOnRelation`, `revokePublicOnRelation`, `revokeDirect`, `postAuthzAct`, `grantDirect`);
- `src/lib/base/folderPublic.ts` to `src/folderPublic.ts`: lines 1-26 (header comment), 51-330 (`PART_OF`, `isEndedLink`, `listFolderPartMembers`, `DOC_READ_CAP`, `mapWithCap`, `FolderPublicOutcome`, `reason`, `isFolderRecord`, `isPublicFolder`, `setFolderTreePublic`, `inheritFolderPublic`);
- `src/lib/base/linkPlaneCatalog.ts` to `src/linkPlaneCatalog.ts`: lines 1-11 (header comment), 15-300 (`LINK_PLANES` to `catalogFromGraph`), 310-313 (`remember`), 329-331 (`liveIsOfferable`), 343-403 (`readUserLinkPlaneCatalog`, `loadUserCatalog`, `emptyStale`, `__setCatalogForTest`). The last is a test seam: no product code reaches it, and every ported case that sets a catalogue uses it; it is taken with the module state it empties.

Named changes, and only these:

1. the imports are replaced by imports of the peers: `./config` by `vault-origin-rule` (`BASE_RELATION_URL`, `BASE_ENTITY_RELATIONS_URL`, `vaultOriginOf`, `recordDoor`); `./token`, `./bearer` and `./dpop` by `lws-session-bridge` (`NotSignedInError`, `tokenManager`, `bearerHeaderFor`, `dpopReadAuth`, `dpopWriteAuth`, `invalidateDpop`, and `import * as dpopModule` for the module the app read as a namespace); `./records` by `lws-records` 0.2.0; `./vaultSets` and `./recordPlane` by `lws-vault-sets` (`listVaultRecordsPage`, `typeLocalName`); `./recordTypes` by `record-types` (`resolveType`); `./stakeholderKinds` (`GILBVEDA_MASTER_ORIGIN`) by `term-origin`; `./termSearch` by `ontology-reads` (`corpusApiOrigin`); the type `RecordRelation` by `relation-role`; `typeCurieFromJsonLd` by `type-curie`; `parseGrantPrincipals` and the type `DirectShareEntry` by `direct-shares`; `shareRefusalMessage` by `share-refusal`; the type `FolderPart` by `folder-part`; the imports between the unit's own files are `./name`. The names the taken code does not use are dropped from the import lists;
2. `BASE_ORIGIN` is `baseOrigin()` at four places: `relationWrite.ts:115` (the last resort of `memberEntityUri`), `relationWrite.ts:305` (the anonymous agent), `entityShare.ts:103` (the last resort of `entityUriForShare`) and `entityShare.ts:625` (the share agent);
3. `GILBVEDA_MASTER_ORIGIN.replace(...)` (`relationWrite.ts:187`) is `termOrigin().replace(...)`;
4. the constant `PUBLIC_GRANTEE = "https://<ontology host>/base/t/PublicGrantee"` (`publicAccess.ts:18`) is the function `publicGrantee()`, built from `termOrigin()` (a constant evaluated at load that holds a host becomes a getter), and its seven uses (`publicAccess.ts:27`, `entityShare.ts:553` and `:561`, `folderPublic.ts:195`, `:196`, `:239`, `:240` and `:310`) call it. The string is the same in production, where the ontology origin is the host the literal named;
5. the method of the request is passed at the three bearer fallbacks of write requests: `relationWrite.ts:326` is `bearerHeaderFor(url, "PUT")`, `relationWrite.ts:509` is `bearerHeaderFor(url, "POST")` and `entityShare.ts:584` is `bearerHeaderFor(url, "POST")`. This is the only change in what the code asks of the seam: a DPoP proof names the method, and the app's bearer token did not. The one other `bearerHeaderFor` site, `relations.ts:87` (`readRelations`), is a GET and keeps the default;
6. comments that name a host are reworded, `BASE_ORIGIN` in a comment reads `baseOrigin()`, and person and agent names in comments are generic; no code changed.

Dynamic imports in the taken code: none. (The app's `entityShare.ts` holds `import("./folderPublic")`, `import("./relations")` and `import("./graphNeighbourhood")` in `shareFolderAndMembers` and `listFolderMemberships`; neither is taken.)

Merged units compared before any symbol was copied (RuleGhsUnitBeforeHost, comments stripped and whitespace collapsed; where text differed, the printed syntax tree and a measured comparison): `type-curie` `typeCurieFromJsonLd` equal in text, and measured equal on 183 inputs (its `typeLocalName` differs by a temporary variable and agrees on 125 inputs), so it is imported; `relation-role` `RecordRelation` equal, imported (`relation-count` holds an equal copy too); `direct-shares` `parseGrantPrincipals` and `DirectShareEntry` equal, imported, but its `listDirectShares` differs (`modes.length > 0` for `modes.length`, braces) and is not used; `share-refusal` `shareRefusalMessage` equal, imported; `folder-part` `FolderPart` equal, imported, but its `isEndedLink` differs (a renamed local) and is copied; `lws-vault-sets` `typeLocalName` equal, imported; `ontology-reads` `corpusApiOrigin` is the app's under that unit's own named change (the rig hosts are a setting), imported. False friends, copied: `id-tail`, `entity-ref` and `relation-members` `uriTail` (each with `?.` and `?? ""` for the strict index setting), `predicate-tree` `LinkTerm` and `LinkPlaneCatalog` (a narrower shape, no `labelled`), `relation-ends` `typeCurieFromJsonLd` (renamed locals), `folder-public-words` `notMadePublicSentence` (not reached), `type-curie` and `record-plane` `typeLocalName` (equal in behaviour on 125 inputs, different text; the `lws-vault-sets` copy is the equal one). Not compared, not reached: `relation-count`, `relation-members` other symbols, `entity-ref`, `share-link`.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/support.ts`, the served-`@context` pin in `test/servedContext.fixture.ts`, neither shipped): the app's mocks of `./token` and `./dpop` are a fake `LwsAuthHost` set with `setLwsAuth`, the settings are set in place of the environment, and the hosts are `example.test` hosts. The collaborators the app's tests mocked at module level (`./records`, `./vaultSets`, `./folderPublic`, `./entityShare`, `./relations`) are mocked the same way, by the package name for the peers. Ported (123 cases): `relations.test.ts` 7 of 8; `relationDoc.curieExpansion.test.ts` 3 of 3; `relationDoc.test.ts` 4 of 5; `relationWrite.c214b01b.test.ts` 1 of 1; `relationWrite.folderPublic.c210.test.ts` 5 of 5; `relationWrite.gate.test.ts` 11 of 11; `relationWrite.wMint.test.ts` 10 of 10; `relationEnd.def6.test.ts` 12 of 12; `relationEnd.readBackDoor.test.ts` 6 of 6; `doorInCacheKey.test.tsx` 2 of 5 (as `doorInCacheKey.test.ts`); `entityShare.grantDoor.c161f7.test.ts` 6 of 9; `entityShare.grantShape.test.ts` 5 of 5 (without the optional dump of the captured bodies to disk and the environment overrides of the principals that fed it); `entityShare.revokeFallback.c209.test.ts` 3 of 3; `entityShare.wField.test.ts` 10 of 10 (the file-reading cases read `src/entityShare.ts`; `replaceRecord`, which is not taken, is a stand-in mock so the file can still say it is never the act); `folderPublic.c210.test.ts` 22 of 22 (its one assertion on `notMadePublicSentence` is dropped, the function is in `folder-public-words`); `folderPublic.r2.vatester.c210.test.ts` 2 of 2; `folderPublic.r3.vatester.c210.test.ts` 2 of 2; `folderPublic.vatester.c210.test.ts` 2 of 2; `linkPlaneCatalog.test.ts` 8 of 8 (the two one-line readers `childrenOf` and `termByCurie` it uses are written in the test); and the two "Share this item" cases of `factsAsServed.c214gapp42.test.ts` as `entityShare.served.test.ts` (2).

Left out, with reasons: `relations.test.ts` the `roleLabel` case (not taken); `relationDoc.test.ts` the `typeCurieFromJsonLd` case (that function is `type-curie`'s, which holds its tests); `relationWrite.vatester.test.ts` (all 6, `resolveMemberEntityUri` is not taken); `relationWrite.k2b09.abort.test.ts` (its one case drives `linkThenRefresh` of the app's `connectedCreate`; the same property, a write whose caller's bound fired after the sign-in and the proof is not sent, is a new case in `relationWrite.extra.test.ts`); `doorInCacheKey.test.tsx` 3 of 5 (they render the app's graph, record and relation hooks); `entityShare.grantDoor.c161f7.test.ts` F7-6, F7-7, F7-8 (they test `shareRefusalMessage`, which is `share-refusal`'s); `relationPredicates.test.ts`, `relationHeldFacts.c214r2.test.ts` and `relationPlanguage.test.ts` (they test code that is not taken).

New (146 cases): `lwsRelations.test.ts` (18: the export list, `hostOfUri`, `mintRelationId`, `boundAwait`, `publicGrantee`, `isPublicPrincipal`, `relationsKey`, `uriTail`), `methodSites.test.ts` (18: every place a credential header is formed, DPoP first and the bearer fallback after a refused proof, the method each fallback asks for, no fallback after a timed-out proof in the relation write and end, a fallback after any failure in the share acts, the 401 and refusal paths), `relationWrite.extra.test.ts` (40), `entityShare.extra.test.ts` (26), `readers.extra.test.ts` (20), `linkPlaneCatalog.extra.test.ts` (17), `folderPublic.extra.test.ts` (7). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units (13).
