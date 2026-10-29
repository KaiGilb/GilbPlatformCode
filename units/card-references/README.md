# card-references

Adds or removes a reference from a card field to another record, and finds the records a field may point to.

## What this is

Adds or removes a reference from a card field to another record, and finds the records a field may point to.

The pieces of a card field that points at another record (a group a record belongs to, the party it acts for, its preferred channel):

- `linkTargets.ts`, what the picker of a link field offers. No kind is named: the reference reading of the ontology master says which records a link may point at.
  - `admittedTargetNames(reading, rule, carrierKind)`: the bare type names a record target of that rule may have for a carrier of that kind (`membership`: the groups of the role relations the carrier's kind plays; `party`: the party kinds; any other rule: none).
  - `findLinkTargets(fieldSets, vaultId, admitted, fetchImpl?)`: the candidates in the carrier's own vault, kept to the admitted types, with the find's `complete` flag (false means a floor, never "no such record"). With no admitted type it answers an empty complete list and asks nobody.
  - `matchingTargets(candidates, text)`: the candidates whose label holds the typed text, ignoring case.
  - `channelChoices(reading, kind, facts)` and `channelLabelOf(kind, target)`: the choices for the preferred-channel link (the carrier's contact fields that hold a value, as attribute addresses on the master) and the label of a stored one. Types: `ChannelChoice`.
- `cardReferences.ts`: `addReferenceFromCard(deps, input)` adds one reference ONLY through the checked write of `holder-reference` (`addReference`); a refusal or "not known yet" is the package's error, thrown as it is, and nothing was sent. Types: `CardReferenceInput`.
- `useAddCardReference.ts`: `useAddCardReference(fieldSets)` (a mutation: reads the reference reading once through the query cache, writes, and on success drops every cached record read and records list), `removeCardReference(host, input)` and `useRemoveCardReference(host)` (removes one link under each spelling the field may hold it, through the host's one-key record writer). Type: `CardReferencesHost`.
- `relationCopy.ts`: `relationCopyOf(term)`, the human label and one line a person reads for a relation (`actsOnBehalfOf`, `memberOf`), or null when the master's label stands. Type: `RelationCopy`.
- `edgeItems.ts`: `edgeIdOf(item)` and `withoutEdges(items, uris)`, two pure helpers on the stored items of an edge fact.
- `cardIconName.ts`: the type `CardIconName` (the icon names a relation's copy may carry).

## What this is not

- Not the picker's window or the card's rows: no markup, no CSS. A component receives props, calls these functions and renders.
- Not the reference rules or the checked write: those are `holder-reference` (`REFERENCE_RULES`, `addReference`). This unit calls them.
- Not the record writer. The remove asks the host for it (see "What the host must supply").
- Not which vault holds a record: the caller passes `vaultId` (the app keeps that in its own memory).

## How to take it

Package: `@kaigilb/gilbplatformcode-card-references`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/card-references` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. `@tanstack/react-query` (`^5.101.2`) and `react` (`^19`) are third-party peers: the two hooks call `useQueryClient` and `useMutation`. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess` and `noImplicitOverride`, as `holder-reference` does, because the peers' source is type-checked with it.

## Examples

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { admittedTargetNames, findLinkTargets, matchingTargets, useAddCardReference, useRemoveCardReference } from "@kaigilb/gilbplatformcode-card-references";

// Once at start-up: the ontology origin (term-origin) and the platform origin (base-origin), plus the session (lws-session-bridge).
setTermOrigin("https://ontology.example.test");
setBaseOrigin("https://platform.example.test");

// In the card (inside <QueryClientProvider>): `fieldSets` and `reading` are the page's readings (stakeholder-card-vocabulary, holder-reference).
const add = useAddCardReference(fieldSets);
const remove = useRemoveCardReference(host); // host: { changeRecordFactItems }

const admitted = admittedTargetNames(reading, "membership", "Person");
const { candidates, complete } = await findLinkTargets(fieldSets, vaultId, admitted);
const shown = matchingTargets(candidates, typedText);
await add.mutateAsync({ vaultId, agent, carrier, field, target: shown[0].record });
```

## What the host must supply

- `CardReferencesHost`, passed as the first argument of `removeCardReference` and `useRemoveCardReference`. Its member replaces one call of the app and is made when the remove runs, never read once at render. A host that cannot write does not take the two remove functions; the rest of the unit does not need it.
  - `changeRecordFactItems(recordId, recordEntityUri, factKey, change, notChanged): Promise<unknown[]>`: the one-key writer of a record's fact. The items AS STORED NOW are handed to `change`, the result is written back as a merge PATCH of that one key, conditional on the read it was built from (`If-Match`); a 412 re-reads and re-applies (up to 3); one write at a time per record; with no usable ETag it sends nothing and rejects. When `change` returns the same items nothing is written. Replaces `changeRecordFactItems(...)` of GilbApp `src/lib/base/recordFactItems.ts` line 55, called at `src/lib/base/useAddCardReference.ts` line 60. In the app it has module state (one queue per record) and its own error class `RecordVersionUnknownError`; the host owns both.
- Settings, set once at start-up by the app: `term-origin` (`setTermOrigin`: `channelChoices` and the master source of `useAddCardReference` read it when they run) and `base-origin` (`setBaseOrigin`: `findLinkTargets` and `addReferenceFromCard` address the vault through `vault-origin-rule`). The session of `lws-session-bridge` signs the default fetch (`platformFetch`) when no `fetchImpl` is passed.
- A `QueryClient` in the tree: through `QueryClientProvider`, as the app has it.

## Module state

None of its own. It reaches the settings of `term-origin` and `base-origin` and the session of `lws-session-bridge`, which must each exist once in an app.

## Do not

- Do not call a hook of this unit conditionally, or behind an early return. `useAddCardReference` and `useRemoveCardReference` call `useQueryClient` and `useMutation` unconditionally, in that order, and a host that wraps them must keep them so.
- Do not write a reference any other way than `addReferenceFromCard`: the checked write checks again and refuses what the picker should not have offered.
- Do not retype the cache keys. The hooks drop the cached reads under `RECORD_QUERY_HEAD` and `RECORDS_QUERY_HEAD` of `record-cache-kit`.
- Do not read an empty candidate list from `findLinkTargets` as "no such record" while `complete` is false.
- Do not install a second copy of `holder-reference`, `term-origin` or `base-origin` beside this unit.

## Wrong readings

- "`relationCopyOf` answers null for any term it does not list." It answers null for names the table does not hold, but the table is a plain object: `relationCopyOf("toString")` is `Object.prototype.toString` and `relationCopyOf("constructor")` is `Object`. Kept as in the app; a card passes the name of a real term.
- "`removeCardReference` removes the link from the field." It removes it under each spelling in `factKeys`, one after the other; the first spelling that fails ends the remove (its error comes out), and a link no spelling holds in a form this app can match is said, never reported as removed.
- "`channelChoices` offers every contact field." It offers the contact fields that hold a value, whose write spelling starts with `a:`.
- "`channelLabelOf` finds a channel by any address." The address must end in `/base/a/<name>`; a trailing `/`, `?` or `#` part makes it null.
- "`matchingTargets` keeps a candidate with no label." Only when the text is blank; with a text it never matches.
- "`useAddCardReference` needs no ontology origin." It builds its master source when it writes, so the ontology origin must have been set.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/linkTargets.ts` (whole, 101 lines) to `src/linkTargets.ts`.
- `src/lib/base/stakeholderCard.ts` lines 659-695 to `src/cardReferences.ts`: `CardReferenceInput` and `addReferenceFromCard`. The brief and the seam map named 659-697; line 696 is blank and 697 is the doc comment of `STAKEHOLDER_REFERENCE_READING_QUERY_KEY`, which is in `stakeholder-card-vocabulary`. Lines 641-657 (`platformFetch`) are in `platform-fetch`.
- `src/lib/base/useAddCardReference.ts` (whole, 84 lines) to `src/useAddCardReference.ts`.
- `src/lib/base/relationCopy.ts` (whole, 40 lines) to `src/relationCopy.ts`.
- `src/components/records/cardIcons.tsx` lines 7-25 (the type `CardIconName`) to `src/cardIconName.ts`.
- `src/lib/mynet/employment/employmentEdges.ts` lines 25-32 (`edgeIdOf`) and 42-49 (`withoutEdges`) to `src/edgeItems.ts`.

**Merged units compared and taken or not.** Each was compared with the source (token for token, comments and imports excluded; or measured):

- `holder-reference` (`addReference`, `CheckedReference`, `ReferenceReading`, `ReferenceRule`), `pick-or-create` (`findCandidates`, `Candidate`, `PickerReading`), `stakeholder-field-sets` (`KindFieldSet`, `StakeholderFieldSets`) and `vocabulary-source` (`VocabularySource`), against `gilb-stakeholders` `0a261488be7c98d1ac5d79887c966a445b8928bd`: every declaration is the same.
- `platform-fetch` (`platformFetch`): the app's `stakeholderCard.ts` lines 641-657, the unit's own source range.
- `vault-origin-rule` (`vaultOriginOf`): the same tokens as the app's `config.ts` function once `baseOrigin()` is read as the app's `BASE_ORIGIN` (6 uses; the setting seam of `base-origin`).
- `type-curie` (`typeLocalName`): measured against the app's `recordPlane.typeLocalName` over 3,874 inputs (3,815 found in the three frozen sources and 59 constructed): the same answer, or the same error, for every one (the measurement of the `stakeholder-card-model` unit, which imports it the same way).
- `term-origin` (`termOrigin()`): the app's `GILBVEDA_MASTER_ORIGIN`, read at call time.
- `record-cache-kit` (`RECORD_QUERY_HEAD`, `RECORDS_QUERY_HEAD`): copied by script from the app's `recordHooks.ts` lines 142-149 (the unit's own source ranges), so the two values, `["base", "record"]` and `["base", "records"]`, are the app's lines 148-149.
- `stakeholder-card-vocabulary` (`cardMasterSource`, `referenceReadingQuery`) and `stakeholder-card-model` (the type `CardField`): the units cut from the same app file.
- **Not a unit, and why.** `changeRecordFactItems` (`recordFactItems.ts`) reaches the platform, holds a queue per record and throws its own error class: a host member, not a pure copy. `edgeIdOf` and `withoutEdges` are pure and are copied here. The type `CardIconName` is a structural copy (the same union as `card-group`'s; this unit installs no component for a type).

Named changes, and only these:

1. the imports are peers (see above) plus `./cardReferences`, `./edgeItems` and `./cardIconName`; `GILBVEDA_MASTER_ORIGIN` in `channelChoices` is `termOrigin()`;
2. `removeCardReference(input)` is `removeCardReference(host: CardReferencesHost, input)`; in it `changeRecordFactItems(` is `host.changeRecordFactItems(`;
3. `useRemoveCardReference()` is `useRemoveCardReference(host: CardReferencesHost)` and `mutationFn: removeCardReference` is `mutationFn: (input: Parameters<typeof removeCardReference>[1]) => removeCardReference(host, input)`;
4. the interface `CardReferencesHost` is added and exported;
5. comments that name a cycle, a ticket, an agent, a person, a ruling or the host app are reworded, and the host in one comment is `https://ontology.example.test`; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/support.ts`, `test/fixtureReference.ts`, `test/fixtureTag.ts` and `test/fixturePlatform.ts` are the same files as in `holder-reference`. Ported from GilbApp at the same commit: `lib/base/linkTargets.c214e8.test.ts` all 4 (`linkTargets.test.ts`), the `relationCopy` test of `components/records/StakeholderSetFields.s8cardlook.test.tsx` 1 of 6 (`relationCopy.test.ts`), the reference-add hook test of `lib/base/partyName.c214b.test.ts` 1 (`useAddCardReference.test.ts`; the app's snapshot key is the head of `record-cache-kit` plus a literal, and the ontology origin is set because the unit reads it when it writes). New: `cardReferencesPinned.test.ts` (31: the export list; every function with hand-made readings; the remove against a fake host; the write and the find over the fixture master and platform) and `cardReferencesHooks.test.ts` (9: the hooks in a jsdom tree). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons:

- from `components/records/StakeholderSetFields.s8cardlook.test.tsx` the 5 tests that render the `StakeholderSetFields` component (a relation in presentation, an empty relation, a term with no human copy, each relation its own frame, edit mode), and from `StakeholderSetFields.s10iter1focus.test.tsx` the 1 test that renders the finder after a pick: they test the component, which belongs to a later unit (`stakeholder-set-fields`);
- from `lib/base/recordFactItems.c214e8fix.test.ts` the test "the employment edges and a link's remove use the same writer": it runs the app's real `changeRecordFactItems` behind mocked records; the writer is the host's, and this unit's remove is pinned against a fake host.
