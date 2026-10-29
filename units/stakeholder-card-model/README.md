# stakeholder-card-model

The pure rules of a Stakeholder card: which fields it shows for a kind, how a party's name is read and saved, and which term a field is.

## What this is

The pure rules of a Stakeholder card: which fields it shows for a kind, how a party's name is read and saved, and which term a field is.

Plain functions and types, no React, no network, no credential. Everything is a function of a reading of the ontology master (`StakeholderCardVocabulary` of `stakeholder-card-vocabulary`) and of a record's facts. No kind and no field is named: they are the master's answers.

The card's fields and state (`stakeholderCardModel.ts`):

- `cardFieldOf(field)`: the card's reading of one field of a kind's set, as a `CardField`: `mode` is `card-edit` (a literal the card's own edit path writes under the field's one write spelling, `slug`), `reference-add` (a reference the package's checked write adds, with its `rule`) or `shown` (shown and not offered for edit, with `shownBecause`). A field that holds a record of its own, the `held-party` reference, a reference the checked write does not write, a field with no single declared encoding, with no write spelling, or with a spelling this app cannot address, is `shown`. The card never guesses a literal.
- `kindFieldSetOf(fieldSets, typeUri)`, `isListedKind(typeUri, kindNames)`, `personKindNamesOf(vocabulary)` (the kinds whose set carries both name terms; `null` when the reading holds no field sets), `kindsUnknownOf(state)`.
- `stakeholderCardState(typeUri, { data?, error?, pending })`: one of `not-a-stakeholder-kind`, `reading`, `kinds-not-known` (with the reason), `fields-not-known` (shown, no edit, with the reason), `ready` (the kind, its `CardField`s, `complete`, `incompleteAt`).
- `storedValuesOf(field, facts)`, `splitSetFields(fields, facts)` (the fields the card edits, and the others, with the reason a field is only shown), `packageReferenceFactKeys()`, `extraFactEditable(slug, valueIsReference, state, referenceKeys?)` and `factsTheCardKeeps(state, facts, referenceKeys?)` (while the kinds are not known, a reference field is decided by its name).
- `cardPartyName(state, vocabulary, facts, editableSlugs, registryMarksStakeholderKind)`: the party's name on the card and how a save writes it: `nameSlot`, `name`, `rule` (a `PartySaveRule`), `notKnownYet`.
- `sessionKindNames(host)`, `sessionKindNamesSettled(host, timeoutMs = 2500)`, `nameRuleFor(typeUri, spec, kindNames)`, `createWritesNameOnly(...)`, `nameOnlyRetypeFacts(facts, nameSlot, shownName, rule?)`, `registryFieldsBesideName(fields, registryNameField, nameSlot)`, `legacyShownInNameBox(slug, party, draft)`: how a create or retype names the record (`party`, `generic` or `unknown`).
- Types: `CardFieldMode`, `CardField`, `StakeholderCardState`, `NameRule`, `SessionKindsHost`.

A party's name (`partyName.ts`): `PARTY_NAME_FLOOR` (the dated synchronous seed of the name's spellings), `factKeyOfSpelling`, `partyNameKeys(predicates?)`, `partyNameOf(facts, predicates?)` (the name, then the legacy label, never the title), `partySavePatch(served, next, rule, { keep?, retractable? })` (the merge-patch body a party save sends: changed facts only, the name under its one home, the legacy label retracted when the name changes), and the types `PartyNameKeys`, `PartySaveRule`.

Which term a field is (`termFields.ts`): `termName(term)` (the name from an IRI or CURIE, first letter lower-cased) and `fieldOfTerm(fields, name)` (the field whose write spelling names the term, else the one whose listing IRI does).

## What this is not

- Not the reading of the master: that is `stakeholder-card-vocabulary`. This unit takes its result and its type.
- Not the field sets, the kinds, or the reference rules: those are the peers `stakeholder-field-sets`, `stakeholder-kinds` and `holder-reference`.
- Not the writes: `partySavePatch` and `nameOnlyRetypeFacts` return what to send; nothing is sent here.
- Not the term reads (`attributeSpelling`, `attributeLabel` and the rest): those fetch and are in `term-slots`.
- Not which vault holds a record, and not the reference write (`addReferenceFromCard`): those need the app's memory and the platform client.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-card-model`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-card-model` prints:

```sh
npm install <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/entity-ref <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/stakeholder-card-model
```

(`react` is an optional peer of the `signin` unit in that list; this unit does not use it.)

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess` and `noImplicitOverride`, as `holder-reference` does, because the peers' source is type-checked with it.

## Examples

```ts
import { stakeholderCardState, splitSetFields, cardPartyName } from "@kaigilb/gilbplatformcode-stakeholder-card-model";

// `reading` is what the card's query gave (stakeholder-card-vocabulary): { data, error, pending }
const state = stakeholderCardState("t:Person", { data: vocabulary, pending: false });
if (state.state === "ready") {
  const { editable, other } = splitSetFields(state.fields, facts);
  const party = cardPartyName(state, vocabulary, facts, editable.map((f) => f.slug!), false);
  // party.nameSlot is the slug the Name box binds to, or null
}
```

## What the host must supply

- `SessionKindsHost`, passed as the first argument of `sessionKindNames` and `sessionKindNamesSettled` (where the app passed its `QueryClient`). Each member replaces one call of the app and is called when the function runs, never read once at render:
  - `cardVocabulary()`: the card's session reading if the page holds one. Replaces `qc.getQueryData<StakeholderCardVocabulary>(STAKEHOLDER_CARD_VOCABULARY_QUERY_KEY)`, GilbApp `src/lib/base/stakeholderCard.ts` line 513. The key is `stakeholderCardVocabularyQueryKey()` of `stakeholder-card-vocabulary`.
  - `typeSet()`: the Stakeholders entry's type set if the page holds one. Replaces `qc.getQueryData<StakeholderTypeSet>(STAKEHOLDER_TYPE_SET_QUERY_KEY)`, line 515.
  - `fetchTypeSet()`: reads the type set from the master, held for the session by the page. Replaces `qc.fetchQuery(STAKEHOLDER_TYPE_SET_QUERY)`, line 563 (the options in the app: `staleTime: KIND_SET_MAX_AGE_MS` (10 minutes), `retry: false`).
- Nothing else: no setting, no credential, no start-up call, no timer except the one `sessionKindNamesSettled` sets (and clears).

## Module state

None. The unit holds only types, functions and the constant `PARTY_NAME_FLOOR` (never written).

## Do not

- Do not read `PARTY_NAME_FLOOR` as the master's answer. It is a dated seed for the surfaces that cannot await the master (the list, search, pickers). Use `partyNameKeys(predicates)` once the session reading holds them.
- Do not write the name under the label or the title of a party. A party's name is written under its one home; `partySavePatch` writes nothing else and retracts the legacy label, never the title.
- Do not treat `kindsUnknownOf(state)` as "not a stakeholder kind". It means the kinds are not known yet.
- Do not call `sessionKindNamesSettled` on a render path: it waits for the master, up to `timeoutMs`.
- Do not offer a `shown` field for edit because its value looks like text.
- Do not install a second copy of `holder-reference` or `stakeholder-card-vocabulary` beside this unit.

## Wrong readings

- "`sessionKindNamesSettled` cancels the read when the time is up." It stops waiting. The host's read goes on and its answer is dropped.
- "`partyNameKeys` takes any spelling to a bare key." It strips one leading `a:` and nothing else: a full IRI spelling in `readKeys` stays as a legacy key of its own.
- "A listed kind with a one-item list under its slug is shown." It stays editable; two or more values under the slug make it shown.
- "A field with a write spelling that has no `a:` is editable." It is shown ("this app cannot address its write spelling").
- "`extraFactEditable` refuses a reference field in every state." It refuses it only while the kinds are not known (`reading`, `kinds-not-known`), by the fact's name or by a reference value. In `fields-not-known` and `not-a-stakeholder-kind` it answers true for any fact; in `ready` false for every one.
- "`nameOnlyRetypeFacts` always moves the name to its home and drops the old slot." With the rule `unknown` nothing is dropped; with `party` only `title` and the legacy keys are dropped, and a slot with any other name stays.
- "`storedValuesOf` shows numbers as numbers." Every value is a string; an object with no `@id` is its JSON.
- "`PARTY_NAME_FLOOR.source` is the app's text." It names the ontology host without its address (see "Where it came from").

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/stakeholderCard.ts` lines 213-635 to `src/stakeholderCardModel.ts` (the brief named 213-636; line 636 is a comment about the re-export of line 637, which is not taken).
- `src/lib/base/partyName.ts` (whole, 145 lines) to `src/partyName.ts`.
- `src/lib/base/termSlots.ts` lines 10-36 to `src/termFields.ts`: `termName` and `fieldOfTerm`. The brief named 11-62; lines 38-62 (`attributeDocs`, `attributeDoc`) are in `term-slots` and are not copied again, and line 10 is the doc comment of `termName`.

**Merged units compared and taken or not.** Each declaration was compared with the source (token for token, comments and imports excluded):

- `holder-reference` (`REFERENCE_RULES`, `ReferenceRule`), `stakeholder-field-sets` (`KindFieldSet`, `StakeholderField`, `StakeholderFieldSets`, `readPartyName`) and `stakeholder-kinds` (`StakeholderPredicates`), against `gilb-stakeholders` `0a261488be7c98d1ac5d79887c966a445b8928bd`: every declaration is the same.
- `addressable-slug` (`isAppAddressableSlug`): the same regular expression as the app's `src/lib/base/recordTypes.ts`.
- `lws-records` (the type `RecordFacts`): the same type as the app's `src/lib/base/records.ts`.
- `type-curie` (`typeLocalName`): measured against the app's `recordPlane.typeLocalName` over 3,874 inputs (every type IRI, CURIE and string with `/t/` found in the three frozen sources, 3,815 of them, and 59 constructed cases: empty, whitespace, trailing `/`, `?` or `#`, `t:` and other CURIEs, bad percent codes, upper case, non-ASCII): the same answer, or the same error, for every one. Its locals are named differently from the app's, so it is not a diff-equal copy; the measurement is the proof.
- `plan-stakeholders-model` (the type `StakeholderTypeSet`): the same interface as the app's `stakeholderKinds.ts`.
- `stakeholder-card-vocabulary` (the type `StakeholderCardVocabulary`): this batch's own unit.
- **Not taken, and why.** `record-cache-kit` exports a `PARTY_NAME_FLOOR` whose `source` text differs from the app's, so it was not treated as equal; the app's constant is copied here (with the one change below, which makes the two the same text). An app that installs both has two equal objects; keep the one it uses. The app's `STAKEHOLDER_TYPE_SET_QUERY`, `STAKEHOLDER_TYPE_SET_QUERY_KEY` and `masterKindReader` are not used here; the three cache calls that used them are host members.

Named changes, and only these:

1. the imports are peers (see above), plus `./partyName` and `./termFields`; the app's imports of `./stakeholderKinds`, `./records`, `./recordTypes`, `./recordPlane`, `./termSlots`, `./config`, `./dpop` and `@tanstack/react-query` are gone (the last three were used only by the `platformFetch` and `addReferenceFromCard` part, which is not taken);
2. `sessionKindNames(qc: QueryClient)` is `sessionKindNames(host: SessionKindsHost)` and `sessionKindNamesSettled(qc: QueryClient, timeoutMs = 2500)` is `sessionKindNamesSettled(host: SessionKindsHost, timeoutMs = 2500)`; in them:
   - `qc.getQueryData<StakeholderCardVocabulary>(STAKEHOLDER_CARD_VOCABULARY_QUERY_KEY)` is `host.cardVocabulary()`;
   - `qc.getQueryData<StakeholderTypeSet>(STAKEHOLDER_TYPE_SET_QUERY_KEY)` is `host.typeSet()`;
   - `qc.fetchQuery(STAKEHOLDER_TYPE_SET_QUERY)` is `host.fetchTypeSet()`;
   - `sessionKindNames(qc)` is `sessionKindNames(host)`; the order of the calls and the awaits are the source's;
3. the interface `SessionKindsHost` is added and exported;
4. in `partyName.ts`, the import of `gilb-stakeholders` is two imports of the peers, and the string literal `PARTY_NAME_FLOOR.source`: `"veda.gilb.com /base/a/name, /base/a/label, /base/a/title (control /base/a/zzqqnotanattr 404); Cycle214-GAPP214.30-D1-PartyNameSpelling-BVedanta-2026-10-04 §1"` is `"the ontology host's /base/a/name, /base/a/label and /base/a/title (control /base/a/zzqqnotanattr 404); the party-name ruling §1"`. The first names a host and a ticket, and the host-agnostic check refuses a host in any line. Nothing in the app reads `.source`. This is the text `record-cache-kit` holds;
5. comments that name a cycle, a ticket, an agent, a person, a ruling or the host app are reworded, and the host in two comments is `https://ontology.example.test`; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/support.ts` and `test/fixtureReference.ts` are the same files as in `holder-reference`. Ported from GilbApp `src/lib/base/` at the same commit: the card-state test file `stakeholderCard.*.test.ts` of the same commit 5 of 8 (`stakeholderCardModel.test.ts`), the `partyName.*.test.ts` file 12 of 15 (`partyName.test.ts`). New: `stakeholderCardModelPinned.test.ts` (52: the export list; every function with hand-made fields, states and facts; the host against a fake host, with fake timers for the wait). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons:

- from the card-state test file `stakeholderCard.*.test.ts` of the same commit: "held for the session, and every read checks back" (1: it runs the app's query options in a `QueryClient`; the options are in `stakeholder-card-vocabulary`, whose own tests pin them) and the two "vault named to a reference write" tests (`holdingVaultOf` is the app's memory and is not taken);
- from the `partyName.*.test.ts` file: the list-name test for a non-party record (`entityDisplayName` is not in this unit), the snapshot-key test (`recordHooks` is the app's) and the reference-add hook test (a React hook of the app). In the other tests, the lines that asked the list for a name (`entityDisplayName`, `resolveType`) are removed; the party-name assertions beside them stay. `factsAfterPatch` of `recordHooks.ts` (lines 2139-2147) is copied into `partyName.test.ts` as a test helper.
