# holder-reference

Adds a reference from a card field to another record with a version-checked write and the ontology's rules for which references are allowed.

## What this is

Adds a reference from a card field to another record with a version-checked write and the ontology's rules for which references are allowed.

Plain functions and types, no React, no credential of its own. A holder's card keeps references to other records of the same holder: a person is a member of a group, a record is held on behalf of a party, a contact has a preferred channel. This unit checks such a reference against the ontology master, live, in the write call, and then writes it to the holder's own vault: as a role record (a relation written at the vault's own address), or as one merge patch of one field of an existing record, conditional on the version that was read (`If-Match`).

- `checkReference(picker, { vaultId, field, carrierType, carrierFacts?, target }, call?)`: resolves with the checked reference (`field`, `writeKey`, `value`, ...) when the target may be written under the field on a carrier of that type in that vault; throws `ReferenceRefusedError` or `ReferenceUnknownError` otherwise. It writes nothing.
- `writeRoleRecord(picker, { vaultId, agent, player, group }, call?)`: writes one role record in the holder's vault, `role:source` the player and `role:target` the group, both found in that vault's typed list, the relation chosen by the group's exact type. A read-back that fails is a `PartialReferenceError` that names what was written.
- `addReference(picker, { vaultId, agent, carrier, field, target })`: adds one checked reference to an existing record of the holder's, by a merge patch of that one field. The patch carries the `If-Match` of the carrier's GET; on 412 the whole attempt runs again (the carrier is placed again, re-read, the reference re-checked, the value rebuilt). The call sends at most **3** merge patches (`ADD_REFERENCE_ATTEMPTS`); a third 412 is a `ReferenceChangedElsewhereError`. A carrier GET that names no ETag, or one `conditionFromEtag` cannot read, is "not known yet" with nothing sent: an unconditional patch is never sent in its place. `a:heldParty` is checked here and never written (`held-party-not-written`).
- `readReferenceVocabulary(source, fieldSets, opts?)`: reads, for DISPLAY, the role relations and their kinds, the party kinds, the contact-point types and the spelling of each reference predicate, through the cached readers of `stakeholder-kinds`. `ReferenceReading`, `RoleRelation`, `ReferenceField`, `ReferenceReadingOptions`. `referenceFieldFor(reading, key)` finds a reading's field by its term IRI or any spelling.
- `WriteCall`, `openWriteCall(picker)`: the live reads one write call shares. `addReference` and a create open one for the whole call; `checkReference` and `writeRoleRecord` open their own when none is passed.
- `ReferencePicker`: `platform` (a `PlatformClient`), `reading` (`fieldSets`, and `references` for display), `master` (the `VocabularySource` the write-time check reads live), `masterReadCapMs`.
- `ReferenceRefusedError` (`reason`: one of the `ReferenceRefusal` words), `ReferenceUnknownError` ("not known yet"), `PartialReferenceError`, `ReferenceChangedElsewhereError`; `conditionFromEtag(etag)`.
- `rowPlacement(row, vaultId)`, `PlacementUnknownError`, `RowPlacement` (`rowVault.ts`): the one reading of which vault holds a typed-list row's record.
- `PARTY_ROLE_TERM`, `CONTACT_POINT_TERM`, `ENDPOINT_TERM`, `REFERENCE_RULES`: the term addresses on the master, and the ruled check each of the four reference predicates takes (`a/memberOf` membership, `a/heldParty` held-party, `a/actsOnBehalfOf` party, `a/preferredChannel` contact-term). A predicate not in that list is refused.

The rule: every reference this unit writes points at a record IN THE CARRIER'S OWN VAULT, found through that vault's typed list. Never into another vault, never a party's identity anchor, a principal or a self card from another vault, never anything the check did not find. A target the check cannot place is refused and nothing is sent. A set that cannot be read whole is "not known yet" (`ReferenceUnknownError`), never "admits nothing" and never answered from a stored copy.

## What this is not

- Not the picker: finding a holder's records to offer, and creating a record with its references, are not here (`createRecord`, `findCandidates` and `readPickerVocabulary` of the source are not taken). A picker that has a `reading` and a `master` is a `ReferencePicker`.
- Not a list of kinds, fields or relations: every type set is read from the master. The unit names only term addresses.
- Not the master reader (`vocabulary-source`), the kinds and their cached readers (`stakeholder-kinds`), the field sets (`stakeholder-field-sets`), or the platform client and the typed-list walk (`record-sync`). All four are peers.
- Not a deleter: a role record that was written and could not be read back is reported, never removed.

## How to take it

Package: `@kaigilb/gilbplatformcode-holder-reference`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/holder-reference` prints:

```sh
npm install <path-to-the-library>/units/record-sync <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess` and `noImplicitOverride`, as the source repository's does (the error classes declare `cause` without `override`).

## Examples

```ts
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { addReference, readReferenceVocabulary, ReferenceRefusedError, ReferenceUnknownError } from "@kaigilb/gilbplatformcode-holder-reference";

const master = masterSource({ vedaOrigin: "https://ontology.platform.example.test" });
const fieldSets = await resolveFieldSets(master);
const references = await readReferenceVocabulary(master, fieldSets, { vedaOrigin: "https://ontology.platform.example.test" });
const picker = { platform: { origin: "https://ann.example.test", fetch: authenticatedFetch }, reading: { fieldSets, references }, master };
try {
  await addReference(picker, {
    vaultId: "https://ann.example.test/vault",
    agent: "https://id.example.test/base/p/writer",
    carrier: "https://ann.example.test/base/e/ben",
    field: "a:memberOf",
    target: "https://ann.example.test/base/e/owners",
  });
} catch (err) {
  if (err instanceof ReferenceRefusedError) console.log("refused:", err.reason);
  else if (err instanceof ReferenceUnknownError) console.log("not known yet, try again");
  else throw err;
}
```

## What the host must supply

- `platform`: the platform's origin and an authenticated `fetch` (`PlatformClient` of `record-sync`). The origin's host must be the named vault's host, or both writers refuse with `origin-not-vault-host` before anything is sent.
- `master`: a `VocabularySource` (`masterSource({ vedaOrigin })` of `vocabulary-source`, or your own). Without one, every write-time answer is "not known yet".
- `agent`: the principal of the writing token (not the holder's card), named in every write.
- `reading`: the field sets and, for display only, the reference reading. The write-time check takes nothing from it that admits or refuses; it uses it for extra type names for the vault's typed-list read, so a refusal can name the target's type.
- A timer: the master reads use `setTimeout` for their bounds.
- Nothing else. No setting and no start-up call.

## Module state

The unit holds one piece of module state.

- `remoteContexts` (`holderReference.ts`): a `Map` from a context URL to the prefix map read from the platform. A platform document that names its `@context` as a URL (a relation read back after a write) is expanded with that context, read once per URL for the whole run and never forgotten; a context that cannot be read is left out and not kept, so the next document reads it again. Nothing empties the map. Two installed copies of this unit would each read every context once; they would not break each other, but install one.

Everything else is closure state of one call: a `WriteCall` keeps its live reads (term documents, listings, sets) for that call only and drops them when it ends. The page's cached readers, and the register that shares them, belong to `stakeholder-kinds` (a singleton peer: two installed copies of it break behaviour, see its README). Nothing runs at import.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not treat `ReferenceUnknownError` as a refusal, or as "the field admits nothing". It means the master could not be read whole; try again.
- Do not let the page's reading decide a write. It is for display; the check reads the master live.
- Do not write `a:heldParty` through this unit. It is checked and refused (`held-party-not-written`); the record-and-claims door writes it.
- Do not send a patch without the ETag. `addReference` refuses when the carrier GET names none.
- Do not install a second copy of `stakeholder-kinds`, `vocabulary-source` or `record-sync` beside this unit.

## Wrong readings

- "`ADD_REFERENCE_ATTEMPTS` is the number of retries." It is the most merge patches one call sends: the first, and one more after each 412.
- "Against any platform a 412 protects the field." A platform that does not check `If-Match` on PATCH answers 200 either way, so against it two writers adding to one multi field at one instant can still lose one addition. This unit cannot tell the two platforms apart.
- "A `ReferenceField.term` and its `spelling.term` are the same address." They are not: `term` is the address the term document was read at (the master source's own), `spelling.term` the identity address the document names for itself. To write a value use `spelling.writeKey`.
- "`conditionFromEtag` accepts only the platform's tag." It sends any strong tag (`"..."`) as it is, and, under `W/`, only the platform's own `"sha256:<64 hex>"` form; any other weak tag, or anything else, gives `null`.
- "A role record whose read-back failed was not written." It was: `PartialReferenceError.written` names it and nothing is deleted.
- "A write to a vault nested in the named vault is allowed when the nested vault's record is in the list." The vault each typed-list row names decides: a row of another vault, a nested one included, is refused `not-in-vault`; a row with no `vault` key is "not known yet"; a row held in more than one vault is refused `in-more-than-one-vault`.
- "A kept `remoteContexts` entry is checked again." It is not; it lives as long as the page.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script:

- `src/holderReference.ts` to `src/holderReference.ts`: lines 129-1424, the whole file after its header comment (lines 1-86) and its imports (lines 87-127).
- `src/rowVault.ts` to `src/rowVault.ts`: lines 29-56, the whole file after its header comment (lines 1-27): `RowPlacement`, `rowPlacement`, `PlacementUnknownError`.

**Merged units compared and taken or not.** Every imported symbol is imported from a merged unit; none is copied. Each body was compared with the source (token for token, comments excluded): `record-sync` (0.3.0) holds `expectStatus`, `isAbsoluteIri`, `locate`, `originHostMismatch`, `PlatformError`, `request`, `routeUrl`, `PlatformClient`, `RecordListError`, `walkRecordPages`, `RecordRow`, `RecordWalk`; `vocabulary-source` (0.2.0) holds `bareForm`, `cardinalityOf`, `nameOfIri`, `refsUnder`, `spellingOfTermDoc`, `typeAttributeOf`, `MasterTimeoutError`, `VocabularyUnavailableError`, `PredicateSpelling`, `TermDoc`, `TermFetch`, `MASTER_READ_CAP_MS`, `MASTER_REQUEST_TIMEOUT_MS`, `ChildrenPage`, `VocabularySource`, `checkedBound`, `withDeadline`; `stakeholder-field-sets` (0.1.0) holds `StakeholderFieldSets`; `stakeholder-kinds` (0.3.0) holds `expandDownIsA`, `STAKEHOLDER_ROLE_TERM`, `PREDICATE_TERMS`, `createStakeholderKindReader`, `createTypeTreeReader`, `readTypeTree`, `stakeholderKindReader`, `typeTreeReader`, `StakeholderKindReader`, `StakeholderKindSet`, `TypeTreeReader`, `VocabularyStore`. All 45 are SAME. (The type-tree reader came into `stakeholder-kinds` in 0.3.0 for this unit.)

Named changes, and only these:

1. the imports of `holderReference.ts` (source lines 87-127) are four imports of the peers above; the import of `rowVault` is `./rowVault`; the code after them is the source's, unchanged. `rowVault.ts` has no imports;
2. the header comment of each file is a new, shorter one, and comments that name a cycle, a ticket, an agent, a person, a ruling, a finding or a host are reworded; no code changed;
3. one string literal carries a tag and is kept as it is: the message of `PlacementUnknownError` in `rowVault.ts` (source line 50) says "before GilbPlatform GAPP214.25c".

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/support.ts` and `test/fixtureTag.ts` are the same files as in `stakeholder-field-sets` (`gilb-stakeholders` `test/fixtureMaster.ts` and `test/fixtureTag.ts` at the same commit, hosts renamed); `test/fixtureReference.ts` and `test/fixturePlatform.ts` are the source's, with the hosts, people and tags renamed in comments and values; `test/readingOf.ts` is new (it builds the `fieldSets` and `references` a picker's reading holds, as the source's `readPickerVocabulary` does for them). Ported from `gilb-stakeholders` `test/` at the same commit, by test block (79 of the 94 that touch this code): `holderReference.test.ts` 20 of 26, `holderReference-r2.test.ts` 11 of 12 (here `holderReferenceVault.test.ts`), `holderReference-m3k-r4.test.ts` 12 of 12 (`holderReferenceKept.test.ts`), `holderReference-m3k-r5.test.ts` 8 of 10 (`holderReferenceLive.test.ts`), `holderReference-m3k-r6.test.ts` 7 of 7 (`holderReferenceFields.test.ts`), `ifMatchRetry-25f.test.ts` 14 of 14 (`ifMatchRetry.test.ts`), `rowVault-25e.test.ts` 7 of 13 (`rowVault.test.ts`). Changes: imports to the peers; the picker is a `ReferencePicker`; titles and comments lose their tags; hosts and people renamed; the `create` entry of `everyReference` in `rowVault.test.ts` is gone with `createRecord`. Added: `holderReferenceUnit.test.ts` (21: the export list, the constants, the reading's shape, `referenceFieldFor`, the write call's bounds, the error classes) and `holderReferenceContext.test.ts` (1: the module state). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units (13).

Left out, with reasons: the 15 tests that call `createRecord`, `findCandidates` or `CreateRefusedError` of `pickOrCreate.ts` (the create path and the picker are not in this unit): from `holderReference.test.ts` "a create whose member-of names another vault's group or an identity is refused before its first write", "a:skill stays refused at create, as before", "with no reference reading at all, a create refuses the reference field as before", "row 4 at create: a member-of edge is written as the checked reference; two as a list", "rows 6 and 7 at create: acts-on-behalf-of and the preferred channel, checked against the facts being written", "a member-of added to an existing record is one merge patch of that field, keeping the values it had" (it builds its carrier with `createRecord`; the merge patch is pinned by `ifMatchRetry.test.ts`); from `holderReference-r2.test.ts` "a create on a field-set reading that is not whole is 'not known yet', with nothing sent (the create path's sibling)"; from `holderReference-m3k-r5.test.ts` "the live master no longer offers a:actsOnBehalfOf on Person, the kept reading still does: refused, 0 writes" and "a create with a:memberOf of 2 groups: the second target sends 0 more requests to the master (15 in all)"; from `rowVault-25e.test.ts` the `findCandidates` describe (4: "does not offer a nested vault's record; offers the vault's own", "does not offer a record held in more than one vault", "answers 'not known yet' when a row it would offer names no vault, not an empty list", "agrees with the check: every offered record passes it, no record it refuses is offered") and the `createRecord` describe (2: "refuses an origin that is not the named vault's host before any request; the vault's own origin creates", "a system vault on the node's own host is created from the node's origin"). Other source tests that touch this code through the picker or the page (`pickOrCreate`, `qa-c214-m3k-s87`, `qa-c214-m3k-s89`, `qa-c214-m3kt-s92`, `qa-c214-m3kt-s93`, `kindReader-m3k-r3`) are left to the units that hold those paths.
