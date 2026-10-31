# held-notes

Reads and writes the notes a person keeps about someone in their own vault, private or shared with that person, one claim per note.

## What this is

Reads and writes the notes a person keeps about someone in their own vault, private or shared with that person, one claim per note.

A held note is one claim (`t:HeldPartyFieldClaim`) in the vault that HOLDS a person's record, about ONE category of that person (a skill, or an interest) and its free-text note:

```
a:heldParty  -> { "@id": the person's record }
a:skill | a:topicInterest -> { "@id": the catalogue term }       (the claim's ONE field)
a:skillDepthNote | a:topicInterestNote -> "the holder's free text" (a qualifier)
a:statedBy   -> { "@id": the ADDER's own card, in their own landing vault }
a:directReader -> the signed-in principal, at mint                 (the writer's own read-back, nobody else's)
```

Every term is asked of the ontology master by name (`term-slots`); a term it does not name makes THAT kind unavailable and a note is never written under a guessed key.

- **The store** (`heldNote.ts`, React-free): `listHeldClaimsAbout(vaultId, subject)` reads EVERY held claim about one person in one vault, of every kind, once (the platform's per-person find, `GET /base/find-by-attribute`, asked at the vault's own node, once per spelling of the person's address, 200 per page, ten pages at most; more than that FAILS the read, none is shown rather than some); a claim that was deleted between the find and its read is skipped, any other failed read or a claim served with nothing fails the read. `listHeldNotesAbout(kind, ...)`, `heldNotesOfKind`, `heldNotesAbout` (a claim about exactly this record), `ownHeldNotes` (the claims THIS viewer stated), `notesForTopic`, `toHeldNote`, `readHeldClaimDoc`, `readHeldClaim`. Writes: `saveHeldNote` (create on the first note, patch after, retract the NOTE when it is emptied and keep the category), `addHeldTopic` (the category's own claim, no note), `removeHeldNotes`, with the pure rules `planHeldNoteWrite`, `heldNoteSurvived`, and `heldClaimFacts`, the ONE composer of a new claim's facts. `subjectSpellings`, `inVault`, `HeldNoteError`, `HELD_FIND_PAGE`, `HELD_FIND_MAX_PAGES`.
- **The marks** (`heldDetailMark.ts`): `privateMarkFacts(principal)`, `sharedMarkFacts()`, `writeHeldMark(claim, mark)`, `refuseGrantKeys`, `isPrivateDoc`, `PRIVATE_TIER`, `HeldMarkError`: the private/shared switch (see "The privacy rule").
- **The vocabulary** (`heldNoteVocab.ts`): `resolveHeldNoteVocab(kind)`, `resolveHeldPartyAttr()`, `HELD_NOTE_TERMS`, `HeldNoteVocabUnavailableError`, `__resetHeldNoteVocab()`; the claim type is registered as a card PART (not a register row) when this module loads.
- **The hook** (`useHeldNotes.ts`): `useHeldNotes(kind, vaultId, subject, principal?)` answers `HeldNotesState` (`noteFor`, `topics`, `readError`, `noOwnVault`, `editableFor`, `errorFor`, `savingFor`, `save`, `add`, `removeFor`, `markFor`, `sourceFor`, `setPrivate`), with `heldClaimsKey`, `HELD_NOTES_STALE_MS`, `mergeClaim`, `runSerial`, `__resetHeldNoteChains()`. ONE React Query key per (vault, person) holds every claim about the person, so a card's Skills and Interests sections share one read. Every save, add, removal and switch of one (kind, vault, person, category) runs after the one before has settled, on a promise chain shared by every card on the page, and plans on its OWN fresh read (never a read already in flight); after a write only the claim written is read again.
- `DIRECT_READER` (`"a:directReader"`): the grant key a note's create carries for the writer's own read-back. A named copy of the constant of the app's place-claim module (see "Where it came from"); the place unit will import it from here.

Who stated what: every claim the platform returns about the person is shown (the platform decides who may read it); only the claims the viewer stated themselves (their own card is the one `a:statedBy`, compared byte for byte by `stated-by`) are edited, removed or switched by them.

## The privacy rule

A held note is born SHARED with the vault, ⛔ never with a tier and ⛔ never with a grant to anyone but its writer. It becomes PRIVATE (only its adder sees it) by one separate act, the mark, which only the adder can make:

1. **A new note carries no tier, no claim subject and no group.** `heldClaimFacts` is the one composer of a new claim's facts. It writes `a:heldParty`, the category, `a:statedBy`, the note when there is one, and `a:directReader` = the writer's own principal when one is given (trimmed; blank gives none). Then it runs `refuseGrantKeys` on the facts and throws if they carry `a:visibilityTier` or `a:claimSubject` in either spelling (the keys that put a claim into the network's find index, or that make it private).
2. **`refuseGrantKeys` lets those two keys through ONLY on the objects `privateMarkFacts` and `sharedMarkFacts` made.** The marks are remembered in a `WeakSet` (`MARKS`, module state): a copy of a mark (a spread, a JSON round trip) is not a mark and is refused. `also` names further keys that stay refused whatever the facts are.
3. **`privateMarkFacts(principal)`** is `a:visibilityTier` = `"private"` AND `a:claimSubject` = `{ "@id": principal }`, together; with no principal it throws (a private detail needs someone to keep it for). **`sharedMarkFacts()`** is both set to `null`. **`writeHeldMark(claim, mark)`** refuses facts that are not a mark (before any request), reads the claim (refuses if it is gone), and sends ONE merge-patch with `If-Match` = the version just read, the two keys together, and nothing else (no reader, no writer, no group).
4. **The hook only lets the adder switch.** `setPrivate(topic, makePrivate)` finds the viewer's own card without making one (`adder.find()`), reads fresh, and marks only the claims on that category whose one `a:statedBy` is the viewer's card; with none it says "You did not add this, so you cannot change who sees it." and patches nothing. It needs a principal and a vault. It confirms by reading back the claim it patched and checking the tier, and says so if the store did not keep it.
5. **An edit of a private note does not touch the mark**: the patch carries the note's key only.

What the platform does with the mark (hiding a private claim from co-members and read-only grantees by its own tier gate) is the platform's; this unit writes the two keys and nothing that widens the audience.

## What this is not

- Not the Skills or Interests sections (rows, pickers, the note box, the "Added by" line, the visibility switch): those draw `HeldNotesState`, which this unit owns.
- Not the person card's held LANGUAGES, contact labels, annotations or organization numbers: they are other claims of the same layer and import `heldClaimsKey`, `mergeClaim`, `runSerial`, `refuseGrantKeys`, `privateMarkFacts`, `writeHeldMark`, `isPrivateDoc`, `listHeldClaimsAbout`, `subjectSpellings`, `inVault`, `HeldClaimDoc`, `DIRECT_READER` from here.
- Not the finding of the adder's own card (`adder-card`), the comparison of addresses (`stated-by`), nor the entity verbs (`vault-resources`).
- Not a search index: a held claim is ⛔ never findable by the network (it carries no tier row and no claim subject at create).

## How to take it

Package: `@kaigilb/gilbplatformcode-held-notes`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/held-notes` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/stated-by <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/held-notes
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

It WRITES, in the vault that holds the person's record (the holder's own vault), through `vault-resources` and `lws-records`:

- **create** a claim: `POST /lws/vault/<vault>/c`, type `t:HeldPartyFieldClaim`, the facts above (`saveHeldNote` on a first note, `addHeldTopic`);
- **patch** a claim: `PATCH /lws/r/<id>`: the note (`saveHeldNote` on a changed note; `null` retracts the note when it is emptied), or the two marks (`writeHeldMark`, with `If-Match`);
- **delete** a claim: `DELETE /lws/r/<id>` (`removeHeldNotes`), only the claims it is handed.

It writes nothing on the person's own record (a note is not one of its values), nothing in any other vault, and no tier or claim subject except through a mark. The query cache of the page is written with each read-back (`mergeClaim`).

## Requests and their servers

- **`GET /base/find-by-attribute?attr=a:heldParty&value={"@id":...}&limit=200[&offset=n]`**: the node of the VAULT ASKED (`vaultOriginOf(vaultId)`), never the base address. The route has no crossing: it answers only from the store of the process at that host. A vault minted since the platform moved vaults to their own stores lives behind its own host, so a find asked at the base address answers "none" with no error: notes would vanish on reopen, each save would make a new claim, a removal would find nothing. Asked once per spelling of the person's address (`/base/e/` and `/vault/e/`), and a 400 (a platform that takes no paging) is retried once without paging by `lws-vault-sets`.
- **`GET /lws/r/<id>`**: the claim's own node (the authority of its address), up to 6 at a time (`readResources`), and once per claim after a write.
- **`POST /lws/vault/<vault>/c`**, **`PATCH /lws/r/<id>`**, **`DELETE /lws/r/<id>`**: the holder's own vault node.
- The term reads (`GET /base/a/<name>`, `GET /base/t/<Type>`) are `term-slots`', at the ontology node.
- The viewer's own card (`adder-card`): see its README (the vault list, the own-card finding, and, only on a write path with no card yet, the basic card).
- Credentials are signed for the host each request names, through the auth seam of `lws-records` and `lws-vault-sets` (`lws-session-bridge`).

## Examples

```tsx
import { AdderCardHostProvider } from "@kaigilb/gilbplatformcode-adder-card";
import { useHeldNotes } from "@kaigilb/gilbplatformcode-held-notes";

// Above the card, once: <AdderCardHostProvider value={{ useSession }}> and a QueryClientProvider.
const skills = useHeldNotes("skill", vaultId, personRecordIri, principal);
skills.noteFor(skillIri);      // null until read, "" when none
await skills.save(skillIri, "ICU nights");   // true only when the read-back carries the note
await skills.setPrivate(skillIri, true);     // only the adder; one PATCH of the two marks
```

## What the host must supply

- One `QueryClientProvider` above the hook, and an `AdderCardHostProvider` (see `adder-card`: the passive session read the app already has).
- The platform settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (`base-origin`), `setSystemHostLabels(...)` (`own-card`), the term origin (`term-origin`) and the auth seam `setLwsAuth(...)` (`lws-session-bridge`).
- The vault that HOLDS the person's record (`vaultId`: its namespace), the person's record IRI (`subject`) and the signed-in principal.

## Module state

Owned here, singleton per installed copy of the unit:

- `chains`: a `Map` of promise chains, one per (kind, vault, person, category); an entry lives while an act is running and is dropped when the chain settles. `__resetHeldNoteChains()` clears it (tests only).
- `MARKS`: a `WeakSet` of the fact objects `privateMarkFacts` and `sharedMarkFacts` made, the only objects that may carry the tier or the claim subject.
- the vocabulary caches: one `Promise` per kind and one for `a:heldParty`, kept on success only. `__resetHeldNoteVocab()` clears them (tests only).
- the registration of `t:HeldPartyFieldClaim` as a card part (in `lws-vault-sets`' set), made when `heldNoteVocab.ts` loads, so a register opened before any person card already hides it.

A second installed copy of this unit would have its own chains and its own marks: install one.

## Do not

- Do not write `a:visibilityTier` or `a:claimSubject` on a held claim any other way than `writeHeldMark(claim, privateMarkFacts(...) | sharedMarkFacts())`. Do not add keys to a mark, copy one, or relax `refuseGrantKeys`.
- Do not add a reader, a writer or a group to a note's facts.
- Do not ask the find at the base address, or leave the origin out: it must be the vault's own node.
- Do not plan a write on a cached read or a read already in flight (`fetchQuery`): two saves would make two claims.
- Do not switch or remove a claim the viewer did not state.
- Do not keep a second copy of any symbol here in another unit (`contact-rows` and `org-employees` import `HeldNotesState`, `subjectSpellings` and `inVault` from here since their 0.1.1 and 0.2.1).

## Wrong readings

- "A private note is created with a restricted audience." It is created like any note, shared with the vault, and then the mark is patched on; the create carries no tier and no grant but the writer's own.
- "`a:directReader` shares the note with the principal." It is the writer's own read-back (the signed-in principal at mint), not a grant to anyone else.
- "`null` from `noteFor` means no note." It means not read yet; no note is `""`.
- "A claim another person stated is hidden." It is shown (the platform decides who may read it) and read-only: not editable, not removable, not switchable.
- "Emptying the note deletes the claim." It retracts the note and keeps the category's claim.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/mynet/heldnote/heldNote.ts` to `src/heldNote.ts`, the whole file (363 lines);
- `src/lib/mynet/heldnote/useHeldNotes.ts` to `src/useHeldNotes.ts`, the whole file (412 lines);
- `src/lib/mynet/heldnote/heldDetailMark.ts` to `src/heldDetailMark.ts`, the whole file (92 lines);
- `src/lib/mynet/heldnote/heldNoteVocab.ts` to `src/heldNoteVocab.ts`, the whole file (125 lines);
- `src/lib/mynet/place/placeClaim.ts` line 351 (`DIRECT_READER`) to `src/directReader.ts`, a named copy: the place-claim module is in no unit yet (the app also keeps a private copy in its field-claim module).

Imports: `pageAllByAttribute`, `registerCardPartTypes` from `lws-vault-sets` 0.2.0 (equal to the source's); `vaultOriginOf` from `vault-origin-rule` 0.1.0 (only `BASE_ORIGIN` read as `baseOrigin()`, that unit's named change); `idFromResourceUri` from `resource-id`; `isStatedBy` from `stated-by`; `createResource`, `getResource`, `patchResource`, `deleteResource`, `readResources`, `FactValue`, `ReadResource` from `vault-resources`; `patchRecord`, `readRecord`, `MergePatchValue`, `WriteSource` from `lws-records` 0.4.0; `attributeSpelling`, `typeSpelling` from `term-slots` 0.1.0 (`typeSpelling` reads the master's origin as `termOrigin()`, that unit's named change); `useAdderCard` from `adder-card`.

Named changes, and only these: the imports; `DIRECT_READER` as its own file; the comments that name a cycle, a ticket, an agent, a person, a ruling or a test run are reworded with the same facts. No code changed. The comment-stripped files, imports excluded, equal the source: `heldNote.ts` 0 diff lines, `useHeldNotes.ts` 0, `heldDetailMark.ts` 0, `heldNoteVocab.ts` 0.

The symbols other units held a copy of (D-H3): `HeldNotesState` was in `contact-rows` 0.1.0 and `subjectSpellings`, `hostOf` (private) and `inVault` in `org-employees` 0.2.0; both units now import them from here (their patch releases 0.1.1 and 0.2.1) and their copies are deleted. `heldClaimsKey`, `HELD_NOTES_STALE_MS` and `HELD_FIND_PAGE` / `HELD_FIND_MAX_PAGES` were in no unit.

## Tests

179 tests in 13 files (`npx vitest run`):

- Ported from the source, 51 cases, re-based on the fake platform of `test/fakePlaceStore.ts` (the real `lws-records`, `lws-vault-sets`, `vault-resources` run over a fake `fetch`; the source's store functions kept as spies; `test/twoHostFindFake.ts` for the two-store cases; `test/adderCardMock.ts`, the app's `adderCard.testkit.ts` copied under a header, stands in for the viewer's own card): `heldNote.c214.test.ts` 31, `heldNote.twoHost.e2e.d9.test.ts` 9, `heldNote.twoStore.d8.test.ts` 4, `heldNoteVocab.registration.c214.test.ts` 1, `useHeldNotes.b1.c214.test.tsx` 3, `useHeldNotes.f1.d8.test.tsx` 2, `useHeldNotes.joinPin.d9.test.tsx` 1. Changed from the source: the module mocks of the record client are gone, the hosts are `*.platform.example.test`, and the two-host fake no longer verifies an ES256 DPoP proof or the apex htu rewrite (those are the auth seam's, `lws-session-bridge`); it checks that each credential was signed for the host the request names.
- New, 128: `heldDetailMark.test.ts` 31 (the marks, the guard, `isPrivateDoc`, `writeHeldMark`), `heldNote.pure.test.ts` 27 (the pure rules, the read's limits and the cap, the vocabulary), `useHeldNotes.surface.test.tsx` 46 (the hook's members, the write paths' messages, `setPrivate`, `removeFor`, the serial chain, `mergeClaim`), `privacy.test.tsx` 8 (the privacy rule over the whole flow, every request body scanned; in particular that a note's create carries no tier, no claim subject and no grant to anyone but its writer, that the only marks are two patches of exactly the two keys with If-Match, and that no composer can be made to write a tier), `exports.test.ts` 3, `hostAgnostic.test.ts` 13.
- Left out: none of the 51 named by the seam map.

Mutation checks: 91 mutants of `heldDetailMark.ts` (25: P01-P25), `heldNote.ts` and `directReader.ts` (34: N01-N34), `heldNoteVocab.ts` (7: V01-V07) and `useHeldNotes.ts` (25: U01-U25), 90 killed, 1 equivalent (P23: `writeHeldMark` hands `patchRecord` the slugs without the `a:`; `patchRecord` writes the same key either way). 15 are aimed at the private/shared mark and its guard (P01-P15, P20, P24, P25, U03-U09), among them the ones that matter most: P10 (the guard lets any facts carry a tier, which would let a note be written private or a tier be smuggled in), P13 (a copy of a mark passes), N01 (a note is written without the guard), P02/P03/P06/P07 (a half mark), P21 (no If-Match), U05 (the switch marks claims the viewer did not add). Six first survived (an empty note key, unsorted claims, a missing claim type, `markFor` with two claims, categories sharing a chain, and P23); a test was added for each but P23.
