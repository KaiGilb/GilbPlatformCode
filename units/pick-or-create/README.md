# pick-or-create

Finds a holder's existing record of a person or makes one, with the tag and the duplicate guard, and says plainly what it wrote when a later step fails.

## What this is

Finds a holder's existing record of a person or makes one, with the tag and the duplicate guard, and says plainly what it wrote when a later step fails.

Plain functions and types, no React, no credential of its own. Every call names the vault. A record it returns is always the holder's own record of the person: an id the platform gave back from a read scoped to that vault (the typed record list, or the vault-scoped tag resolve), or the id a create minted into it. It never returns a party's own identity, and it never makes a default vault.

- `readPickerVocabulary(source, fieldSets, opts?)`: reads what a picker needs before it can act, beside a field-set reading already in hand: the tag grammar, the spelling of the stater predicate (`a/statedBy`) and, when the master has the record, the tag write rule. Answers a `PickerReading` (`fieldSets`, `grammar`, `statedBy`, and `references` and `tagWriteRule` only when they were read). `opts.references: true` also reads the reference reading of `holder-reference`; `opts.timeoutMs`, `opts.readCapMs` and the other `ReferenceReadingOptions` go through. A `timeoutMs` or `readCapMs` that is not a finite number above 0 and at most 2,147,483,647 is a `RangeError` before anything is read. A write rule that cannot be read is left off the reading and does not block a write.
- `Picker`: `platform` (a `PlatformClient`: the vault's origin and an authenticated `fetch`), `reading` (a `PickerReading`) and `master` (the `VocabularySource` every write-time reference check reads live; without one a reference field is "not known yet").
- `findCandidates(picker, { vaultId, text?, maxPages? })`: the holder's stakeholder records in one vault. The typed list for the kinds read from the master is walked to its end (full-row pages of 100, at most `maxPages`, default 200); `text` keeps the rows whose label holds it, ignoring case. Answers `{ candidates, complete, pages }`. Only the named vault's own records are offered: a row of another vault (a nested one included) and a row held in more than one vault are left out, and a row that would be offered but names no vault makes the whole answer "not known yet" (`PlacementUnknownError` of `holder-reference` is thrown). `complete: false` means the walk stopped before the list said it had no more: the candidates are a floor, never "no such person".
- `pickByTag(picker, { vaultId, tag })`: the stakeholder record a tag names in one vault, as a `PickResult`; `null` when the tag names none there, or names something that is not a record of a stakeholder kind. The tag is checked against the grammar first (`TagRefusedError` of `tag-grammar` for a bad one).
- `pick(candidate)`: a `Candidate` as a `PickResult` (`created: false`, `record`, `vaultId`, `type`). It reads nothing.
- `createRecord(picker, input)`: writes one record of a party into the named vault, with `a:statedBy` the holder. Everything that can be refused is refused before the first write, as a `CreateRefusedError` whose `reason` is one of `no-vault`, `no-holder`, `no-agent`, `unknown-kind`, `kind-offers-no-name`, `no-name`, `field-not-offered`, `field-ambiguous`, `field-not-writable`, `field-value`, `tag-refused`, `origin-not-vault-host` (the `CreateRefusal` words). A field-set reading that is not whole is "not known yet" (`VocabularyUnavailableError`), never "unknown kind". A field that holds a record of its own (`{ record: { ... } }`) is written first, then the record that points at it. A reference field is written only when `holder-reference` finds the target in the named vault and the ontology admits it; any other reference field is refused. The result is a `CreateResult`: `record`, `vaultId`, `tag` and `tagHandle` (the platform's, `null` when it would not say) and `held` (the records a field holds that were written with it).
- `pickOrCreate(picker, input)`: with a `tag`, the stakeholder record that tag names in the vault is picked and nothing is written; otherwise the record is created. The tag is only looked up, never registered: the platform makes every record's tag. With no tag it always creates, since two people may share a name.
- `PartialCreateError`: something WAS written and a later step failed. `record` (the party's record, or `null` when the failure came before it), `written` (everything this create wrote, in order), `vaultId` and `cause`. Nothing is deleted. A platform without the tag routes gives a `NoTagRoutesError` of `tag-client` with `created` set to the same three facts.
- `CreateInput`, `PickOrCreateInput`, `FieldValue`, `RecordEntry`, `Ref`, `Candidate`, `FindResult`, `PickResult`, `CreateResult`, `CreateRefusal`, `PickerReading`; `STATED_BY_TERM` (`a/statedBy`).

## What this is not

- Not `createRecord` of `lws-records`. The name is the same and the function is not: that one writes any record; this one writes a party's record with the stater, the field sets, the references and the platform's tag. The unit does not import it.
- Not the reference check or the reference write: `checkReference`, `addReference` and the rules for which references are allowed are `holder-reference`, a peer, which `createRecord` calls for each reference field.
- Not the tag grammar, the write rule or the tag look-up (`tag-grammar`), and not the tag routes (`tag-client`): both are peers.
- Not a deleter and not a sharer: a record that was written is never removed, and no grant, audience fact or sharing route is touched. The vault's audience is the vault's reader set.
- Not a vault chooser: there is no default vault. Writing into a vault other people read is the caller choosing those readers.
- Not the app's wrapper: how an app asks for the holder's self card, shows candidates or turns a refusal into a sentence is the app's.

## How to take it

Package: `@kaigilb/gilbplatformcode-pick-or-create`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/pick-or-create` prints:

```sh
npm install <path-to-the-library>/units/record-sync <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/pick-or-create
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
import { pickOrCreate, readPickerVocabulary, CreateRefusedError, PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";

const master = masterSource({ vedaOrigin: "https://ontology.platform.example.test" });
const fieldSets = await resolveFieldSets(master);
const reading = await readPickerVocabulary(master, fieldSets);
const picker = { platform: { origin: "https://ann.example.test", fetch: authenticatedFetch }, reading, master };
try {
  const found = await pickOrCreate(picker, {
    vaultId: "https://ann.example.test/vault",
    holder: "https://ann.example.test/vault/e/ann-self-card",
    agent: "https://ann.example.test/vault/e/our-app",
    kind: "https://ontology.platform.example.test/base/t/Person",
    name: "Ben Lee",
    fields: { "a:email": "ben@example.test" },
    tag: "ben-lee",
  });
  console.log(found.created ? "made" : "found", found.record);
} catch (err) {
  if (err instanceof CreateRefusedError) console.log("refused before any write:", err.reason);
  else if (err instanceof PartialCreateError) console.log("written:", err.written, "failed after:", err.cause);
  else throw err;
}
```

## What the host must supply

- `platform`: the platform's origin and an authenticated `fetch` (`PlatformClient` of `record-sync`). The origin's host must be the named vault's host, or `createRecord` refuses with `origin-not-vault-host` before anything is sent.
- `master`: a `VocabularySource` (`masterSource({ vedaOrigin })` of `vocabulary-source`, or your own). Optional: without one, a reference field of a create is "not known yet".
- `holder`: the IRI of the self card of the vault the record is written into, given by the caller on every create. It is the value of `a:statedBy`. The unit cannot check that the signed-in person is that vault's holder.
- `agent`: the principal of the writing token, not the holder's card. It is sent as the writer of every write.
- A timer: the master reads use `setTimeout` for their bounds.
- Nothing else. No setting and no start-up call.

## Module state

None. Every piece of state is closure state of one call: a create's list of what it wrote, and the write call it opens for its reference checks, dropped when the call ends. The cached readers and the register that shares them belong to `stakeholder-kinds`, and `remoteContexts` to `holder-reference`; this unit holds nothing of its own. Nothing runs at import.

Dynamic imports in the file taken: none (searched with `grep "import("`).

## Do not

- Do not read `complete: false` of `findCandidates` as "no such person". It is a floor.
- Do not pass a name and expect the same person: without a `tag`, `pickOrCreate` creates.
- Do not give a `tag` to `createRecord`: it takes none. The platform makes the record's tag, and `pickOrCreate` only looks one up.
- Do not treat a `PartialCreateError` as "nothing was created". Read `written`; delete nothing from here.
- Do not use it to link a record to a party's identity (`a:sameAs`): no function here writes a party's own identity.
- Do not install a second copy of `stakeholder-kinds`, `vocabulary-source`, `record-sync` or `holder-reference` beside this unit.

## Wrong readings

- "`createRecord` here is the `createRecord` of `lws-records`." It is not; see "What this is not".
- "A tag given to `pickOrCreate` is written." It is looked up in the named vault. A stakeholder record it names is picked; a tag that names something else, or nothing, picks nothing and the create then gets the platform's own tag. A tag the grammar refuses is refused (`tag-refused`), with the write rule's sentence when the rule refuses it too; a tag the grammar accepts is looked up even when the write rule would refuse a new one, so a stored tag the rule would refuse is still picked.
- "A reference field of a create is always refused." Only a reference this unit cannot check is. Where `picker.reading.references` is present, the four references `holder-reference` knows are checked live against the named vault before the first write, and written as references.
- "`PartialCreateError.record` is always the party's record." It is `null` when the failure came before the party record was written, and the address the create answered with when the record could not be read back to learn its own IRI.
- "`CreateResult.held` lists every record this create wrote." It lists the records a field holds, not the party's record itself (`written` without its last entry).
- "`findCandidates` with a `text` of spaces filters by spaces." The text is trimmed; an empty text filters nothing. A row with no label never matches a non-empty text. The type is checked a second time after the server filtered by type.
- "`readPickerVocabulary` with a bad bound and `references: false` reads first." The bounds are checked first in both cases, before any request.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script:

- `src/pickOrCreate.ts` to `src/pickOrCreate.ts`: lines 74-660, the whole file after its header comment (lines 1-50) and its imports (lines 51-72). `src/tagClient.ts` of the same commit is the unit `tag-client` (0.2.0), so it is not copied.

**Merged units compared and taken or not.** Every imported symbol is imported from a merged unit; none is copied. Each body was compared with the source (token for token, comments excluded): `record-sync` (0.3.0) holds `expectStatus`, `isAbsoluteIri`, `locate`, `originHostMismatch`, `PlatformError`, `request`, `routeUrl`, `vaultSegment`, `walkRecordPages`, `PlatformClient`; `vocabulary-source` (0.2.0) holds `bareForm`, `spellingOfTermDoc`, `VocabularyUnavailableError`, `PredicateSpelling`, `MASTER_READ_CAP_MS`, `MASTER_REQUEST_TIMEOUT_MS`, `VocabularySource` and `checkedBound` (the source's `deadline.ts`); `stakeholder-field-sets` (0.1.0) holds `FieldRecord`, `RecordField`, `StakeholderFieldSets`; `tag-grammar` (0.1.0) holds `assertTagString`, `readTagGrammar`, `TagRefusedError`, `TagGrammar`, `checkNewTagString`, `readTagWriteRule`, `tagRefusalSentence`, `TagWriteRule`, `lookupTagString`; `tag-client` (0.2.0) holds `ensureMasterTag`, `NoTagRoutesError`, `readMasterTag`; `holder-reference` (0.1.0) holds `checkReference`, `openWriteCall`, `readReferenceVocabulary`, `referenceFieldFor`, `ReferenceReading`, `ReferenceReadingOptions`, `PlacementUnknownError`, `rowPlacement`. All 39 are SAME.

Named changes, and only these:

1. the imports of `pickOrCreate.ts` (source lines 51-72) are imports of the peers above; the code after them is the source's lines 74-660, unchanged;
2. the header comment is a new, shorter one, and comments that name a cycle, a ticket, an agent, a person, a ruling, a finding or a host are reworded (a person's name in one comment is "Ann Lee"); no code changed. No string literal carries a tag.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/support.ts`, `test/fixtureTag.ts`, `test/fixtureReference.ts` and `test/fixturePlatform.ts` are the same files as in `holder-reference` (`gilb-stakeholders` `test/` at the same commit, hosts and people renamed). Ported from `gilb-stakeholders` `test/` at the same commit: `pickOrCreate.test.ts` 54 of 54; the tests of `createRecord`, `findCandidates`, `pickByTag`, `pickOrCreate` and `CreateRefusedError` left out of `holder-reference` (15): `createReferences.test.ts` 6 (of `holderReference.test.ts`), `createReferencesVault.test.ts` 1 (of `holderReference-r2.test.ts`), `createReferencesLive.test.ts` 2 (of `holderReference-m3k-r5.test.ts`), `findCandidates.test.ts` 6 (of `rowVault-25e.test.ts`); and the same kind of tests of other files (23, with 3 more cases of a table): `createRefusals.test.ts` 6 and `createFieldShapes.test.ts` 6 and `createListShapes.test.ts` 4 (the three QA files on the create path), `createNested.test.ts` 2, `createCarrierRow.test.ts` 1, `createKept.test.ts` 2, `tagLookup.test.ts` 2 (and 3 table cases). Added: `pickOrCreateUnit.test.ts` (14: the export list, the stater term, the reading's shape and bounds, the bound of a write call at create, `pick`, the two error classes). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units (13).

Left out, with reasons: from `tagWriteRule.test.ts` the blocks that run `addTag` (they are `tag-client`'s) and the 54 known tag-string answers (they are `tag-grammar`'s: `tagWriteRule.cases.json` is not in this unit); `qa-c214-m3kt-s93.test.ts` (its one test of `createRecord`, which builds its page from the recorded live answer of the master), `qa-c214-m3kt-s92.test.ts`, `masterTimeout-m3kt.test.ts` and `kindReader-m3k-r3.test.ts` (they need that recorded answer, `test/fixtures/m3kt-s92/live-memo.json.gz`, which is not in the library; the bounds they pin are pinned again in `pickOrCreateUnit.test.ts` against the fixture master); and the tests of `qa-c214-25b`, `qa-c214-25b-r2`, `qa-c214-25f-qa1b`, `qa-c214-25e`, `qa-c214-m3k-s87`, `qa-c214-m3k-s89` and the `holderReference*` files that use `readPickerVocabulary` only to build a picker and then call `addReference`, `checkReference` or `writeRoleRecord` alone (they test `holder-reference`, which ported them with its own reading builder).
