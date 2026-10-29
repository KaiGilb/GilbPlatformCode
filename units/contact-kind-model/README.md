# contact-kind-model

The pure model of a contact's kind: its chips, its start choices and the relations its header shows.

## What this is

The pure model of a contact's kind: its chips, its start choices and the relations its header shows.

Plain functions and types, no React, no network, no credential, no setting. Nothing names an entry, a type or a kind: every entry is read from the master by the code that fills these shapes.

The chips (`contactKindModel.ts`):

- `orderEntries(entries)`: by `a:labelOrder`; the entries with none after them, by name. Does not change its input.
- `offeredFor(entries, types)`: the entries that fit a record of a type; `types` is the record's type and every type above it (the caller expands it). An entry with no declared type fits every record; with no type known only those are offered, a kind is never guessed to fit.
- `notYetChosen(entries, chosen)`: a label appears at most once on a contact.
- `toneOfCircleLabel(label)` (`personal`, `professional` or `neutral`, a look only) and `chipText(label)` (the middle dot dropped).
- Types: `LabelAxis`, `CatalogueEntry`, `ChipTone`, `ContactChip`, and `KindPredicate` and `KindEntry` (a catalogue entry with `kindPredicate`, `kindForVault` and `defaultTie` on top).
- `placementChip(placement)` (`placementChips.ts`): the chip for a circle the holder placed a person in; its words are `placementLabel` of `person-connections`.

The start choices (`stakeholderStart.ts`): `startShortcuts(vocabulary, available)` fits the master's create shortcuts to what a dialog can create, with the types below each (`steps`); `shortcutOfType`, `orderByShortcuts`, `moreTypeOptions` and `shortcutDisplay` (one typed display word: "System" for "Software System"); the types `StartStep` and `StartShortcut`.

The header's relations (`headerRelations.ts`): `headerRelations(input)` gives the chips of the contact header as data: a kind with a predicate by the ontology term's own label, a relation edge between the record and the vault, a term with no label or an unreadable vocabulary by the term's own name, a kind with no predicate as the holder's own label (dashed); each predicate once; the default tie (`DEFAULT_PARTY_TIE_CURIE`, `t:AssociatedWith`) only while no specific kind is there. `edgesToVault(rows, record, vault, catalog)`, `vaultKindCurie`, `canonicalEntity`, `sameEntity`, `isDefaultPartyTie`, and the type `HeaderRelationsInput`.

## What this is not

- Not the catalogue of kinds or the reads that fill it, and not the writes of a kind: reading the master's entries, the holder's own kinds and the relation writes are other units.
- Not the chip component or the header: that is `contact-header` (this unit only returns the data its relation chips take).
- Not a list of kinds or predicates: a predicate minted tomorrow shows with no release.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-kind-model`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/contact-kind-model` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/direct-shares <path-to-the-library>/units/folder-part <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model
```

Of those, this unit imports from five: `contact-header` (the type `ContactHeaderRelation`), `lws-relations` (the types `LinkPlaneCatalog` and `LinkTerm`), `person-connections` (`placementLabel`, the type `AtomicPlacement`), `relation-role` (the type `RecordRelation`) and `stakeholder-card-vocabulary` (the type `StakeholderCardVocabulary`). Four of them only for types; the install line is long because those units have peers of their own.

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency of its own. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess` and `noImplicitOverride`, as `holder-reference` does, because the peers' source is type-checked with it, and turns on `resolveJsonModule` for the test fixture.

## Examples

```ts
import { headerRelations, edgesToVault } from "@kaigilb/gilbplatformcode-contact-kind-model";

// catalog: the user-plane link catalog (lws-relations); rows: the record's reverse lookup (relation-role's RecordRelation)
const edges = edgesToVault(rows, recordEntity, vaultEntity, catalog);
const chips = headerRelations({ kindChips, entryPredicates, predicateCuries, catalog, catalogFailed: false, edges, contactName: "Ben Lund", holderName: "Ann Berg" });
// pass `chips` to the ContactHeader of contact-header
```

## What the host must supply

Nothing. No host member, no setting, no start-up call. The caller supplies the data: the kind chips and their predicates, the link catalog and the relation rows are arguments.

## Module state

None.

## Do not

- Do not draw a chip that is still being read: `headerRelations` leaves it out until its words, predicate and term have landed, and never shows a placeholder word.
- Do not show the default tie beside a specific kind: it is hidden then, and a holder's own label does not hide it.
- Do not pass `offeredFor` a type without the types above it by is-a, and do not expect a kind to be guessed to fit when no type is known.
- Do not treat a circle chip as a grant: here it is a look; whether it means access is the caller's.

## Wrong readings

- "`canonicalEntity` normalises any text." A text that is not a URL loses only its trailing slashes; a URL is cut to scheme, host (lower-cased) and path (query and fragment dropped); the path's own case is kept.
- "`chipText` drops every middle dot." It drops the first one only.
- "A relation row from the vault to the contact is a tie." Only when the term is symmetric; a directed one the other way round is not drawn.
- "`startShortcuts` lists the master's shortcuts." It keeps those the dialog can create (`available`), and only the steps it can create.
- "`shortcutOfType` finds the first shortcut that contains the type." A shortcut's own type wins over a step of an earlier one.
- "A kind with an unreadable predicate term is dropped." It is drawn as the holder's own label, dashed, titled that the relation term could not be read; never any part of the term's address.
- "`DEFAULT_PARTY_TIE_CURIE` is exported by the app's relation predicates." There it sits among other predicates in a file that is in no unit; here it is the one constant, copied.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/contact/contactKindModel.ts` (whole, 81 lines) to `src/contactKindModel.ts`; then `src/lib/contact/kindRelation.ts` lines 86-102 (`KindPredicate` and `KindEntry`, types only) to the same file. The brief named `KindEntry`; it is defined on `KindPredicate`, so that interface moves with it (lines 86-89). Both moved here to break a type cycle: the catalogue code that reads them imports them from this unit.
- `src/lib/contact/placementChips.ts` (whole, 19 lines) to `src/placementChips.ts`.
- `src/lib/contact/stakeholderStart.ts` (whole, 76 lines) to `src/stakeholderStart.ts`.
- `src/lib/contact/headerRelations.ts` (whole, 176 lines) to `src/headerRelations.ts`; and `src/lib/base/relationPredicates.ts` lines 248-256 (`DEFAULT_PARTY_TIE_CURIE` with its doc comment, a literal with no origin in it) into the same file, placed before the code that uses it.

**Merged units compared and taken.** `person-connections` (`placementLabel`, `AtomicPlacement`) against `gilb-stakeholders` `connections/placements.ts` at `0a261488be7c98d1ac5d79887c966a445b8928bd`: every declaration is the same. `lws-relations` (`LinkPlaneCatalog`, `LinkTerm`, `LinkPlaneName`) against the app's `src/lib/base/linkPlaneCatalog.ts` and `relation-role` (`RecordRelation`) against `src/lib/base/relations.ts`: the same declarations, token for token. `contact-header` (`ContactHeaderRelation`) is the interface of `gilb-stakeholders-ui` `ContactHeader.tsx` (Batch 3a compared it). `stakeholder-card-vocabulary` is this batch's own unit (`StakeholderCardVocabulary`).

Named changes, and only these:

1. the imports: `gilb-stakeholders`, `gilb-stakeholders-ui`, `../base/linkPlaneCatalog`, `../base/relations`, `../base/relationPredicates` and `../base/stakeholderCard` are the five peers above; `./contactKindModel` is the unit's own;
2. `KindPredicate` and `KindEntry` are in `contactKindModel.ts` (from `kindRelation.ts`), and `DEFAULT_PARTY_TIE_CURIE` is in `headerRelations.ts` (exported there; the app exports it from its predicates file);
3. comments that name a cycle, a ticket, an agent, a person, a ruling or the host app are reworded, and the comment of `KindEntry` no longer says that the file is shared with another app; no code changed. No string literal carries a tag.

`src/index.ts` is new. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; the hosts are `example.test` hosts, the people Ann and Ben): `test/support.ts` is the same file as in `holder-reference`; `test/relationsMaster.json` is the app's `__fixtures__/s5cRelations.master.2026-10-19.json` with the ontology host and the person names renamed. Ported from GilbApp `src/lib/contact/` at the same commit: `contactKindModel.*.test.ts` 9 of 9, `stakeholderStart.*.test.ts` 11 of 11 (here `stakeholderStart.test.ts`; the test that reads the vocabulary uses `stakeholder-card-vocabulary` and sets `term-origin`), and the three `headerRelations.*.test.ts` files 23 of 25 (`headerRelations.test.ts`, `headerRelationsDefaultTie.test.ts`, `headerRelationsUnread.test.ts`). New: `contactKindModelPinned.test.ts` (21: the export list, `KindEntry`, `placementChip`, `shortcutDisplay` and the shortcut helpers, `canonicalEntity`, `sameEntity`, `isDefaultPartyTie`, `vaultKindCurie`, `edgesToVault` and the cases of `headerRelations` the ported tests do not reach). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Changed in the port: in `headerRelations.test.ts` the test that no predicate word is written in the code reads this unit's `headerRelations.ts` only (the app's test also read two component files that are not in the unit). In the file that reads the vocabulary, the `stakeholderStart` test sets the `term-origin` setting the app's constant stood for.

Left out, with reasons: from `headerRelations.*.test.ts`, the two tests of "the reads" (`readMasterEntryName`, `readPredicateCurie`): they call `contactKindCatalogue.ts`, which is another unit (the catalogue reads).
