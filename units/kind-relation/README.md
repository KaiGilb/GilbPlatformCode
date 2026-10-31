# kind-relation

Writes and ends the tie between a person and a kind of contact, with race guards.

## What this is

Writes and ends the tie between a person and a kind of contact, with race guards.

A kind of contact (Friend, Customer ...) is a predicate relation from the contact to the vault's own entity, private to the holder, and it grants nothing. This unit writes it, reads the holder's own ties back, ends them, and keeps two people or two tabs from leaving two live ties of one kind. It is a **write layer**: it has no read-only mode, and a host that must not write does not take it.

Writing (`kindRelation.ts`):

- `writeTie(args, deps?)`: under one lock per vault and contact, reads the holder's own live ties; if one of the kind is live, keeps it (and ends the extra ones); else writes a new tie under an id that was ended earlier in this tab, an id still unconfirmed, or a new random id, reads it back, then re-reads the ties and ends any extra (the heal). A write whose wait ends keeps its id for the retry. Answers `{ id, uri, live, reused, ended, notEnded, endError }`. `deps` is for tests (`write`, `readBack`, `newId`, `lock`, `pending`, the readers).
- `writeKindRelation`, `readKindRelationBack`, `readBackIsTie`, `kindRelationFacts`, `assertKindRelationFacts` (the facts are an allowlist of exactly four), `KIND_RELATION_TIER` (`"private"`), `resolveKindRelationVocab` (reads the spelling of `claimSubject` and `visibilityTier` once), `kindVaultOf`, `vaultMasterType`, `KindRelationError`, `KindRelationVocabUnavailableError`.
- `ownLiveTies(args, deps?)`, `tieHolderOf`, `healTies(args, ties, deps?)`: the holder's own live ties of a contact in a vault, and the ending of all but the one with the lowest id.
- `endTies(vault, holder, subject, ties, deps?)`, `endKindRelations(vaultId, uris)`, `isEndedRelationDoc`: end ties by address (an end the vault refused counts as done when the tie reads back ended); never a delete. An ended id is remembered in this tab so the next write revives it.
- `withBrowserLock(name, act)`, `tieLockName(vaultId, subject)`: the Web Locks lock; only the wait for the grant is bounded. Without Web Locks the act runs as it is.
- `relationsTouchingVault`, `matchTies`, `defaultTieEntry`, `defaultTieEntryId()`, `relationKindsOffered`, `isPartyType`, `isDefaultTie`, `samePredicate`, `relationIdOf`, `legacyKindRelationId`, `isLegacyKindRelationId`, `MAX_TIE_GENERATIONS`; `kindWriteBoundMs()` (12 000 ms).
- Test hooks, never called by product code: `__setKindWriteBoundForTest`, `__resetKindRelationVocab`, `__resetEndedTies`.

The default link (`partyTie.ts`): `masterTypeAddress`, `isPartyTypeRef`, `defaultLinkPredicate(a, b)` (two parties give `t:AssociatedWith`, anything else `t:ConnectedTo`) and the hook `useDefaultLinkPredicate(a, b, enabled?)`.

`expandRelationRef.ts` is internal (four small functions copied from the app, see "Where it came from"); it is not exported from the entry.

## Changes in 0.1.1

Additive (a patch bump). `expandRelationRef(value, docUri)` is exported from the entry point; it was a private file of the unit. Its body is unchanged. `stated-by` imports it. Tests: 3 new in `src/expandRelationRef.test.ts`.

## What this is not

- Not the relation write itself (`lws-relations`: `writePairRelation`, `endRelation`, `mintRelationId`), not the catalogue of kinds (`contact-kind-catalogue`) and not the model of a kind (`contact-kind-model`).
- Not a reader: a host that only shows ties does not install this unit.
- Not the holder's own kind (no predicate): that is a private label claim, not a tie.

## How to take it

Package: `@kaigilb/gilbplatformcode-kind-relation`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/kind-relation` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation
```

Of those, this unit imports from eight: `term-origin` (`termOrigin`), `term-slots` (`attributeSpelling`), `lws-relations` (`boundAwait`, `endRelation`, `isBoundTimeout`, `mintRelationId`, `readRelationDoc`, `readRelations`, `uriTail`, `writePairRelation`, `GENERIC_PREDICATE_CURIE` and the types `LinkPlaneCatalog`, `RelationDoc`), `lws-session-bridge` (`NotSignedInError`), `relation-role` (the type `RecordRelation`), `plan-record-hooks` (the type `ReachableVault`), `contact-kind-model` (`DEFAULT_PARTY_TIE_CURIE`, `offeredFor`, `sameEntity`, the type `KindEntry`) and `contact-kind-catalogue` (`CATALOGUE_TTL_MS`, `readMasterCatalogue`, `typeAncestry`); and from the third-party `@tanstack/react-query` (`useQuery`) and `react`. The install line is long because those units have peers of their own.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own.

## Examples

```ts
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { writeTie, endTies } from "@kaigilb/gilbplatformcode-kind-relation";

setBaseOrigin("https://platform.example.test");   // once, at start-up
setTermOrigin("https://ontology.example.test");   // once, at start-up
setLwsAuth(yourAuthHost);                         // once, at start-up

const made = await writeTie({ vault, subject: contactEntityUri, curie: "t:FriendOf", holder: principal });
await endTies(vault, principal, contactEntityUri, [{ relationUri: made.uri, curie: "t:FriendOf" }]);
```

## What the host must supply

This unit has no host interface of its own. It needs what its peers need:

- The platform's origin, `setBaseOrigin(origin)` of `base-origin`, and the ontology origin, `setTermOrigin(origin)` of `term-origin`, once at start-up. The app's `GILBVEDA_MASTER_ORIGIN` that was read when the module loaded is `termOrigin()`, read when a call is made.
- The signed-in session and its credential: `setLwsAuth(host)` of `lws-session-bridge` (the relation reads and writes go through `lws-relations`, which asks it for the headers). `NotSignedInError` from that package stops a write and is thrown as it is.
- A fetch (the global `fetch`) and, for the lock, a browser with Web Locks (`navigator.locks`); without them the lock is skipped and the heal still runs.
- For `useDefaultLinkPredicate`: a React Query `QueryClientProvider`.

## Module state

- `kindWriteBoundOverride` (`kindRelation.ts` line 56): the test override of the 12 s bound, `null` by default; set only by `__setKindWriteBoundForTest`.
- `cachedVocab` (line 118): the one read of the spellings of `claimSubject` and `visibilityTier`, kept as a promise; dropped by `__resetKindRelationVocab` and when its read fails.
- `endedTieIds` (line 310): a map of the ties this tab ended, by vault, holder, contact and predicate, so a later write revives that id. Memory only, never stored.
- `pendingTieIds` (line 315): a map of the id sent for a write that is not yet confirmed, so a retry sends the same id. Memory only; cleared when the write is confirmed.

Two installed copies of this unit would each hold their own `endedTieIds` and `pendingTieIds`, and a retry made through the other copy would send a new id: two live ties of one kind. Install it once. The units it reads also hold state and must exist once in an app: `term-origin`, `base-origin`, `lws-session-bridge`, `lws-relations` (the class `BoundTimeoutError` is tested with `instanceof`) and `contact-kind-catalogue` (its catalogue cache).

## Do not

- Do not delete a tie: ending is `endRelation`, which closes it.
- Do not add a fact to the relation: the facts are the two roles, the claim subject and the tier `private`; `assertKindRelationFacts` refuses anything else.
- Do not derive the relation's id from its parts: it is random, so a reader of the vault cannot guess the kind. An old guessable id is recognised, kept while live and ended, and never written again once ended.
- Do not install a second copy of this unit (see "Module state").
- Do not rename the lock (`tieLockName`, `gilbapp:kind-tie:<vault>:<contact>`): every tab of every build that shares a browser must ask for the same name. The literal names the app that first used it and is kept as the source has it.
- Do not call the `__` functions from product code.

## Wrong readings

- "Picking a kind adds a second relation beside the default." It writes the kind first and then ends the default; never both live.
- "A write that timed out wrote nothing." The PUT may still land: the error carries `late` (a promise of the late answer) and the id stays pending, so a retry sends the same id and cannot make a second tie.
- "An end the vault refused failed." If the tie reads back ended, it is done (two tabs ending one tie at once get one refusal).
- "The lock waits as long as the write." Only the wait for the grant is bounded, by the write bound; the act is not inside that timer.
- "`defaultLinkPredicate` reads the kind of the contact." It reads the type of the two ends from the master's catalogue; two parties give associated-with, anything else connected-to.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/contact/kindRelation.ts` (795 lines) to `src/kindRelation.ts`, lines 43-85 and 104-795; lines 1-29 (the header comment, reworded here), 30-42 (the imports) and 86-103 (`KindPredicate` and `KindEntry`, which `contact-kind-model` holds) are not copied as they stand.
- `src/lib/contact/partyTie.ts` (whole, 54 lines) to `src/partyTie.ts`.
- `src/lib/base/relationDoc.ts` lines 35-39, 68-80, 82-84 and 133-135 (`vaultBaseFromDocId`, `idOf`, `firstValue`, `expandRelationRef`) to `src/expandRelationRef.ts`: `lws-relations` keeps them private and does not export `expandRelationRef`.

**Merged units compared and taken.** Each declaration was compared with the source (token for token, comments and imports excluded).
- `lws-relations`: `BoundTimeoutError`, `isBoundTimeout`, `boundAwait` (boundAwait.ts); `writePairRelation` and `endRelation` (relationWrite.ts); `RelationDoc` and `readRelationDoc` (relationDoc.ts); `mintRelationId`; `readRelations` and `uriTail` (relations.ts); `LinkPlaneCatalog` (linkPlaneCatalog.ts); `GENERIC_PREDICATE_CURIE`. All are the same as the app's. `endRelation` differs in one place only: the unit's `bearerHeaderFor(url, "POST")` where the app has `bearerHeaderFor(url)`, the method argument that `lws-relations` names in its own `unit.json`.
- `lws-session-bridge`: `NotSignedInError` (the same class, message and name as the app's `token.ts`). `relation-role`: `RecordRelation`. `plan-record-hooks`: `ReachableVault`. `contact-kind-model`: `sameEntity`, `offeredFor`, `DEFAULT_PARTY_TIE_CURIE` (the literal `"t:AssociatedWith"`). All the same.

Named changes, and only these:

1. the imports are the peers above; `./kindRelation` (in `partyTie`) and `./expandRelationRef` stay the unit's own;
2. `KindPredicate` and `KindEntry` are not defined here; `KindEntry` is imported from `contact-kind-model`;
3. `GILBVEDA_MASTER_ORIGIN` is `termOrigin()` at its three uses (two in `kindRelation.ts`, one in `partyTie.ts`);
4. `export const DEFAULT_TIE_ENTRY_ID = \`${GILBVEDA_MASTER_ORIGIN}/base/t/${typeTail(DEFAULT_PARTY_TIE_CURIE)}\`;` (built when the module loaded) is `export function defaultTieEntryId(): string { return \`${termOrigin()}/base/t/${typeTail(DEFAULT_PARTY_TIE_CURIE)}\`; }`, and its two uses are `defaultTieEntryId()`;
5. comments that name a cycle, a ticket, an agent, a person, a ruling, a measuring run or the host app are reworded; no code changed. The lock name `gilbapp:kind-tie:...` is kept (see "Do not").

`src/index.ts` is new. No host member was added and no test seam: the source already has the three `__` functions.

## Tests

`src/*.test.ts*` (shared set-up in `test/`, not shipped; hosts are `example.test` hosts, the people Ann and Ben; fake time throughout, nothing sleeps). `test/contactCatalogue.master.json` and `test/masterFetch.ts` are the app's `__fixtures__` files of the same name with the ontology host renamed; `test/support.ts` sets the origins and a fake host for the session bridge.

Ported from GilbApp `src/lib/contact/` at the same commit, all 72 of 72:
- `kindRelation.c214.test.ts` 53 (here `kindRelation.test.ts`), `kindRelation.c214r4.test.ts` 8 (`kindRelation.endTies.test.ts`), `kindRelation.endRace.agenttester.test.ts` 2 (`kindRelation.endRace.test.ts`), `kindRelation.pending.k2b06.test.ts` 1 (`kindRelation.pending.test.ts`), `kindRelation.bound.agenttester-s152.test.ts` 1 (`kindRelation.bound.test.ts`), `kindRelation.r5gaps.agenttester-s155.test.ts` 2 (`kindRelation.gaps.test.ts`): 67 in all.
- `partyTie.c214.test.ts` 5 (`partyTie.test.ts`).

The app's 12 `vi.mock` were: `dpop` twice and `token` twice (now the fake host of `lws-session-bridge`, `test/support.ts`), `relationDoc` three times and `relationWrite` once, and `termSlots` four times. Nine `vi.mock` remain in the unit's tests (the pin file adds two), all partial mocks of two peers that keep the real module and replace some exports: `lws-relations` in four files (`readRelationDoc`, and also `endRelation` in two of them) and `term-slots` in five (`attributeSpelling`, so no network read of the spelling). The inputs and expectations are the app's.

New: `kindRelationPinned.test.ts` (the exports and constants, the write bound, the cached vocabulary, the remembered ended ids and unconfirmed ids, `withBrowserLock`, `ownLiveTies`, `relationsTouchingVault`, `matchTies`, `healTies`, the legacy ids, `writeTie`'s named waits) and `partyTiePinned.test.tsx` (the hook's gates, key and options, and the ontology origin read at call time). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out: none of the source's tests.
