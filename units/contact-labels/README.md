# contact-labels

Shows the kinds and circles a person has for the holder, and lets the holder add one with "+ Relation".

## What this is

Shows the kinds and circles a person has for the holder, and lets the holder add one with "+ Relation".

On a held card (a person the holder keeps a record of) the chips beside the name say what kind of contact the person is for the holder: a circle ("Professional · Inner Circle") or a kind ("Friend", "associated-with", or a kind the holder made). They are for the holder's own knowing and grant the person no access. This unit reads them, offers the kinds that fit, and writes the holder's choice.

- `useContactLabels({ vaultId, subject, principal, ownVaultId, typeUri, kindVault?, enabled?, needOffers? })`: the React hook. It answers `ContactLabelsState`: `chips` (null while they are not read, never "none"), `offered` (per axis: what fits the record's type, is not already there, in order), `offersLoading`, `readError`, `noOwnVault`, `catalogueNote`, `actError`, `busy`, `add(entry)`, `remove(chip)`, `refreshOwnKinds()`, `entryPredicates`, `ties`. `vaultId` is the vault that HOLDS the record; `subject` is the contact's record address; `ownVaultId` is the signed-in person's own vault; `kindVault` is the vault as the TARGET of a kind (`{ vaultId, entity, represents }`).
- The rules (`heldContactLabel.ts`, React-free): `addContactLabel`, `removeContactLabel`, `contactLabelsOf`, `ownContactLabels`, `labelClaimFacts`, `assertNeutralLabelFacts` (the allowlist), `heldTypedClaims`, `hasAnnotationRecord`, `isEndedClaimDoc`, `resolveHeldClaimType`, `resolveContactLabelReadVocab`, `resolveContactLabelVocab`, `ContactLabelError`, `ContactLabelVocabUnavailableError`, `PRIVATE_TIER`, and the test seam `__resetContactLabelVocab`.
- The words: `CHIP_PENDING_LABEL` ("…", shown while a kind has not read), `CHIP_UNREADABLE_LABEL`, `NOT_OWN_VAULT_SAYS`, `NO_VAULT_TIE_SAYS`, `DEFAULT_TIE_MISSING_SAYS`.

One instance per card: the header and the card's slots both call it. React Query keys are shared, so two calls cost one read.

## What "+ Relation" writes

"+ Relation" opens the "+ Kind" chooser; what a choice writes depends on the choice, and only on that:

| The holder picks | What is written | Where |
|---|---|---|
| a kind that names a predicate ("Friend", "Customer", ...) | ONE private RELATION from the contact to the vault's entity (`kind-relation` `writeTie` over `lws-relations`); then the default associated-with is ENDED (replaced, never both) | the vault that holds the record |
| associated-with (the default) | the same relation with the default predicate; offered only while the contact has no tie | the same |
| a circle label | ONE private label claim (`t:HeldPartyFieldClaim`), the circle under `a:circleLabel` | the same |
| a kind the holder made (no predicate) | ONE private label claim, the kind under `a:relationshipKind` | the same |

- A label claim carries EXACTLY five facts and nothing else (`assertNeutralLabelFacts` is an allowlist, checked on every write): `a:heldParty` (the contact), the label, `a:statedBy` (the adder's OWN card, from `adder-card`), `a:claimSubject` (the holder) and `a:visibilityTier` = `"private"`. No membership, reader group, rung, find key, `a:directReader` or `a:directWriter`. It is private to the holder and found by nobody else.
- A relation is private to the holder too (`a:claimSubject` and the private tier ride on it) and grants nothing. It needs no card of the holder; a label does.
- Removing: a label claim is DELETED (and read back: gone or ended); a relation is ENDED, never deleted. Removing the last specific kind writes the default again (the floor rule), unless an older label claim of a kind with a predicate still stands as the specific kind.
- Only in the signed-in holder's OWN vault (`annotationsFit`): in another person's vault the chips are read, read-only, and `add` / `remove` refuse and write nothing (`NOT_OWN_VAULT_SAYS`). With no principal, no vault, or no vault entity for a kind with a predicate, nothing is written and the reason is said.
- Every write of one (vault, contact) runs after the one before has settled (`runSerial` of `held-notes`), and reads back only what it wrote.
- Nothing here changes the contact's own card, and no label or relation is shown to the contact.
- Older label claims of a kind with a predicate are still read and shown (a relation of the same kind wins); nothing stored is rewritten.

## What this is not

- Not the chips' look or the chooser: those are `ContactKindChips` of `stakeholder-contact-header`.
- Not a circle membership. In a circle app the same words are a grant; here they are a label.
- Not the notes: "My Note" and "Where / How we met" are `contact-annotation`.
- Not the lists' logic: ordering and fit are `contact-kind-model`, the master's lists are `contact-kind-catalogue`, the relation writes are `kind-relation`.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-labels`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/contact-labels` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-labels
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

None. The unit draws nothing.

## Requests and their servers

Three servers, never anything else. Every master read is public (no credential); every vault request is signed for the vault's own node.

| Request | Sent to | When | Credential |
|---|---|---|---|
| `GET /base/search?type=<CircleLabel\|RelationshipKind>&q=<word>&vault=<master>`, `GET /base/e/<entry>`, `GET /base/t/<Type>`, and the term documents of `term-slots` | the ontology master: `termOrigin()` of `term-origin`, read WHEN USED (the host sets it once at start-up) | a chip's own kind, by its address, once per kind per 30 minutes; the two catalogues, the type's ancestry and the vault type's ancestry only when the chooser is open (`needOffers`) | none |
| `GET /base/vocab?status=all&linkPlane=user` | `corpusApiOrigin()` of `ontology-reads` (via `lws-relations`): the platform's base address, or the public corpus origin on a local rig. The source sends it to the same function. | once per session (`USER_VOCAB_KEY`), only when a relation touches the vault or the chooser is open on a card whose vault has an entity | none |
| `GET /base/find-by-attribute?attr=a:heldParty&value=...` (one per spelling of the contact's address), `GET /lws/r/<id>` | the node of the vault that holds the record (`vaultOriginOf`) | the claims about the contact (shared with the skill, interest and language sections: one key per vault and contact); the read-back of a claim written | DPoP for the find; bearer for the read |
| `POST /lws/vault/<vault>/c` (the label claim), `DELETE /lws/r/<id>` (a label removed) | the same vault node | a label added or removed | DPoP |
| `GET /base/e/<id>/relations` (the reverse lookup), the relation write and end of `lws-relations` | the same vault node | the ties, and a relation added or ended | bearer / DPoP |
| the typed list of the holder's own kinds (`lws-vault-sets`) and one read per own kind (`vault-resources`) | the same vault node | only when the chooser is open | as the peers |

- The card with no chip, no relation to the vault and no chooser opened asks the master and the vocabulary nothing.
- A card with chips pays: the find, and the claim type (one document) if a held record exists, and the four read terms only if one is a chip.
- Writes: a label claim (POST, and DELETE to remove), a relation (written and ended through `kind-relation`). Nothing else.

## Examples

```tsx
const labels = useContactLabels({
  vaultId, ownVaultId, subject: recordEntityUri, principal, typeUri,
  kindVault: { vaultId, entity: vaultEntity, represents },
  needOffers: editing && chooserOpen,
});
// labels.chips -> ContactKindChips; labels.add(entry) writes the choice; labels.remove(chip) undoes it.
```

## What the host must supply

- `setTermOrigin(...)` (`term-origin`), `setBaseOrigin(...)` and `setSystemVaultHosts(...)` (`base-origin`), and the auth seam `setLwsAuth(...)` (`lws-session-bridge`), once at start-up.
- A React Query `QueryClientProvider` above the hook.
- The provider `adder-card` asks for (`AdderCardHostProvider`, with the passive session read): without it `useContactLabels` throws, naming it.
- The hook takes no React context of its own. The unit has no host members.

## Module state

Three promises in `heldContactLabel.ts` (the claim type; the four read terms with it; the write vocabulary): each resolved once per page session and not kept when it failed; `__resetContactLabelVocab()` clears them (a test seam, never called by product code). The hook's queries live in the host's query client (keys `["contact-labels", ...]`, `USER_VOCAB_KEY`, and the held-notes claims key). An app must have ONE copy of this unit.

## Do not

- Do not write a grant of any kind on a label, and do not widen the allowlist in `assertNeutralLabelFacts`.
- Do not write a label claim for a kind that names a predicate, or a relation for a circle label or a holder's own kind.
- Do not write in a vault that is not the signer's own, and do not guess a vault entity for a relation.
- Do not delete a relation: end it.
- Do not show the raw address of a kind while it reads: `CHIP_PENDING_LABEL`.
- Do not read the master's lists before the chooser is opened.
- Do not call `__resetContactLabelVocab` from product code.

## Wrong readings

- "`GILBVEDA_MASTER_ORIGIN` is a constant." It was one in the source; here it is `termOrigin()` read at each use, so an origin set after the module loaded is the one asked.
- "`PRIVATE_TIER` is defined here." It is `held-notes`' binding, re-exported under the source's name (one definition, `"private"`).
- "A card with a chip reads both catalogues." It reads one small document per distinct kind a chip names.
- "The default and a specific kind are both shown." The default is hidden beside a specific kind; if ending it failed, it is ended by the next change.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, whole files:

- `src/lib/contact/useContactLabels.ts` (619 lines) to `src/useContactLabels.ts`.
- `src/lib/contact/heldContactLabel.ts` (283) to `src/heldContactLabel.ts`.

Named changes, and only these:

1. The imports are imports of units: `termOrigin` from `term-origin`; `HELD_NOTES_STALE_MS`, `heldClaimsKey`, `mergeClaim`, `runSerial`, `listHeldClaimsAbout`, `readHeldClaimDoc`, `HeldClaimDoc` from `held-notes`; `useAdderCard` from `adder-card`; `sameIri` from `stated-by`; the catalogue reads, `readOwnEntryName`, `readOwnKinds`, `USER_VOCAB_KEY`, `readHeaderVocab` from `contact-kind-catalogue`; the model functions and types from `contact-kind-model`; the tie functions and `KindVault`, `TieFound` from `kind-relation`; `readRelations`, `relationsKey`, `uriTail`, `readRelationDoc` from `lws-relations`; `NotSignedInError` from `lws-session-bridge`; `annotationsFit` from `contact-annotation`; `createResource`, `deleteResource`, `getResource`, `FactValue` from `vault-resources`; `attributeSpelling`, `typeSpelling` from `term-slots`; `registerCardPartTypes` from `lws-vault-sets`.
2. `GILBVEDA_MASTER_ORIGIN` (a constant built when the module loaded) is `termOrigin()` at its three uses (the master address of a type name, and the keys of the two catalogue queries).
3. `readOwnKinds` and `readOwnEntryName` of `contact-kind-catalogue` take a host as their first argument; `useContactLabels.ts` holds `const ownKindsHost = { createResource, getResource }` (from `vault-resources`) and passes it at the two calls. The two calls' other arguments are the source's.
4. The header comments are new and shorter; comments that name a cycle, a ruling, an agent, a date, a ticket or a measuring rig are reworded with the same facts. No code changed.
5. `src/index.ts` is new and exports by name.
6. `PRIVATE_TIER` (a second definition of the word in the source) is imported from `held-notes` and re-exported under the same name.

With comments and imports removed, `heldContactLabel.ts` differs from the source by one line (1075 against 1074 words): `export const PRIVATE_TIER = "private"` is `export { PRIVATE_TIER }` of the imported binding. `useContactLabels.ts` differs by 9 words on 7 lines, exactly the named changes 2 and 3 (the new `ownKindsHost` line, three `termOrigin()` uses, two `ownKindsHost` arguments).

## Tests

127 tests in 9 files (`npx vitest run`):

- PORTED, the source's 64 + 11 cases: `useContactLabels.s8labels.test.tsx` 12, `useContactLabels.s9labels.test.tsx` 13, `useContactLabels.c214tie.test.tsx` 26, `useContactLabels.c214r5.test.tsx` 13 (64), and `heldContactLabel.s8labels.test.ts` (11 cases, 23 runs because its neutrality refusals are a loop of 13). Re-based on the real peers over the fake platform of `test/fakePlaceStore.ts` (the held-notes fake, with the source's typed-list spy added), the master's documents of `test/masterFetch.ts`, the relation store of `test/relationStoreFake.ts` and the viewer's own card of `test/adderCardMock.ts`; hosts are `example.test` hosts. Two cases changed (below).
- NEW `choice.test.tsx` 15: what each "+ Relation" choice writes (a kind with a predicate: one private relation and no claim; associated-with: a relation; a circle label and a holder's own kind: one private claim with exactly the five facts and no relation; a label needs the holder's card, a relation does not), every refusal writes nothing (not the signer's vault, no vault entity, no principal), removing follows the split (a relation is ended and nothing deleted, a label is deleted and nothing ended), a tie already there and the default beside any tie are not written, and the floor does not write the default while an older label claim stands as the specific kind.
- NEW `requests.test.tsx` 8: the three servers and the credentials per request (master public, vault signed for its node), the master's origin read when used, the vocabulary read once at the corpus origin with no credential, a card that needs nothing asks nothing, and the module state of the term caches (asked once, not kept when failed, the claim type registered as a card part).
- NEW `exports.test.ts` 4; `hostAgnostic.test.ts` 13 (the same host-agnostic check as the other units; it writes to the OS temp directory).

No wall-clock waits beyond the source's own `waitFor`. `vi.mock` is used only for the four seams named under "Left out".

Mutation checks: 37 mutants of the two files. 14 aimed at the choice (a predicate kind written as a label, every kind or every circle a tie, the own-vault rule off in add and in remove, no principal, a relation with no vault entity, the stater, the holder of a label and of a tie, a relation chip removed as a label, readOnly ignored, every chip the viewer's, an existing tie written again), 10 at the reads and the chips (the default beside a specific kind, the order, the lists read before the chooser, the floor, the default offered beside a tie, the master address, the raw address shown while a kind reads, ties read with no vault entity, a refused delete read back after a sign-in failure) and 13 at the label rules (the tier, the claim subject, the tier check, the allowlist, a label written twice, removal of only the named claims, note records taken for chips, the viewer's own chips, an ended claim, the contact match, the card-part registration, the stater, a failed read kept). First run: 33 killed, 4 survived: C14 (a tie already there), R5 (the floor with an older label), H11 (card-part registration) and H12 (stater): real gaps, tests added, all killed. H8 (`!!principal &&` in `ownContactLabels`) is EQUIVALENT: `sameIri` already answers false for a missing principal. Final: 36 killed, 1 equivalent.

Left out (not portable as they were written, or not this unit's):

- The source's module mocks of the app's record client, vault sets, find-by-attribute, term slots, relation doors and adder card are gone (`vi.mock("../base/records")` and its five fellows in each of the five files): the peers run for real over the fake platform. What is still mocked: `term-slots` (the master's spellings), `listVaultRecordsPage` of `lws-vault-sets` (the typed list of own kinds; the fake is the source's), the four relation doors of `lws-relations` (the source's in-memory store), and `adder-card` (the viewer's own card).
- One case is changed: "never makes a network call of its own" (the source spied on `fetch` and expected none, because its record client was mocked); the real client sends the create over `fetch`, so the case now pins that the one request is the create at the vault and nothing on a membership or grant route.
- One case is changed: the sign-in failure on a refused delete threw `NotSignedInError` from the mocked record client; now the platform answers 401 to the DELETE, which is what raises it.
- The relation writes themselves at the wire (the `kindRelation.c214` cases) belong to `kind-relation`; the catalogue reads (`contactKindCatalogue.s8labels`, `ownKinds.s9labels`) to `contact-kind-catalogue`.
- `ContactCardSlots.*` (the chips in the card, 54) belong to `contact-card-slots`.
