# one-card-context

Holds the merged person card for the rows below it, so a card group can draw a person's rows beside the holder's.

## What this is

Holds the merged person card for the rows below it, so a card group can draw a person's rows beside the holder's.

React context and pure helpers. A person linked to an online card is one card: their online card is the master and the holder adds their own fields to it. `one-card-merge` says which row is theirs, which is yours and which values are equal; `one-card-rows` draws the rows. This unit is the wiring between them: it puts the merge's output where the card's groups and own editors can read it.

- `OneCardProvider({ view, children })`: puts a `OneCardView` (or `null`) above the card's groups.
- `useOneCard()`: the view, or `null` outside the one card (an organization, any other record, a card with no provider). `null` is the "behave as before" answer.
- `useOneCardGroup(kind)`: for one group of the card, `{ groups, theirs, bothKept, ownMarks, marks }`, or `null` outside the one card. `theirs` is true when a merged group holds a row of theirs; `ownMarks` is `ownMarksOf(kind)`.
- `useOneCardOwn(kind, term?)`: for one own editor, `{ marks, folded(value) }`, or `null` outside the one card. `term` narrows the kind's groups to the field with that term.
- `useAddInPlace(canEdit)`: may this group offer "+ Add your own" in place? True only on a two-source one card, while the card is presented (a `CardModeProvider` is above it and it is not editing), and when `canEdit`.
- `useFoldedClaims(kind)`: the held claims (by entity) the merge folded into a row of theirs in this group; an empty set outside the one card.
- `OwnFieldRow({ kind, term?, value, fold?, children })`: one of the card's own editors in the one card. Outside it, the editor alone. Presented and empty, the editor alone. Presented and folded into a row of theirs (and `fold` not false), nothing. Otherwise the editor inside `YourRow` (a box with `data-source="yours"` when two sources are shown).
- `placeOneCard(card, groupOf, skip?, order?)`: which of the card's own groups each merged group is drawn in; returns `{ byKind, own }`. A group the card draws nowhere gets the kind `theirs:<predicate>`, and only when it has a row of theirs.
- `oneCardOf({ online, servedFacts, fieldOrder, skillPredicate, addressPredicate?, addresses?, theirAddresses? })`: the merge's input from what the card already holds, and `mergeOneCard`'s output. `online` null means one source and no marks. `theirAddresses` is passed through; the merge reads it only when `addressPredicate` is set.
- `ownMarksOf(kind)`: `"rows"` for the groups whose own editors carry a mark each, `"none"` for `my-note` and `how-we-met`, `"block"` for the rest.
- `foldedInto(groups, value)`: is a value of yours folded into a row of theirs?
- Types: `OneCardView`, `PlacedGroup`, `GroupOfTerm`, `OwnMarks`.

## What this is not

- Not the merge (`one-card-merge`), not the rows (`one-card-rows`), not a card group (`card-group` takes this unit as a peer), not a reader and not a writer. No request is made.
- Not the app's own editors: they keep writing as they did. `OwnFieldRow` only marks or hides them.

## How to take it

Package: `@kaigilb/gilbplatformcode-one-card-context`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/one-card-context` prints):

```sh
npm install react@^19.0.0 <path-to-the-library>/units/card-mode <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19, `card-mode`, `one-card-merge`, `one-card-rows` and `online-card` (all `^0.1.0`; the last for the type `OnlineCard`) are peers.

## Examples

```tsx
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { OneCardProvider, oneCardOf, placeOneCard, useOneCardGroup } from "@kaigilb/gilbplatformcode-one-card-context";

const merged = oneCardOf({ online, servedFacts, fieldOrder, skillPredicate: null });
const { byKind, own } = placeOneCard(merged, (g) => kindOfTerm(g.term));
const view = { marks: merged.marks, byKind, own, rowLabel: () => null, valueText: (r) => r.value };

<CardModeProvider canEdit>
  <OneCardProvider view={view}>
    <Groups /> {/* a card group calls useOneCardGroup(kind) */}
  </OneCardProvider>
</CardModeProvider>;
```

## What the host must supply

- React 19 and the four peers.
- The merge's inputs (`online`, `servedFacts`, `fieldOrder`, `skillPredicate`), the `groupOf` that says which of the card's groups holds a merged group, and the `rowLabel` and `valueText` of the view.
- A `CardModeProvider` above the card if `OwnFieldRow` and `useAddInPlace` are to see the card's mode. Without one the card is "always editing": `useAddInPlace` is false and `OwnFieldRow` marks its editor.

## Module state

`OneCardContext` is a module-level React context, created once when this unit loads. The provider and every hook must use the same one. **Two installed copies of this unit break the merged card**: a provider from one copy is invisible to a hook from the other, so every hook answers `null` and the card draws as if no person were linked. Install it once, as a peer of `card-group`, `one-card-rows` and every unit that reads the view. Nothing else runs at import.

## Do not

- Do not compare values here: `foldedInto` reads only the merge's output.
- Do not pass a record's joined facts as `servedFacts`: several values joined with ", " would be one value and never match. Pass the served facts, one value per entry.
- Do not install two copies.

## Wrong readings

- "`useOneCardGroup(kind).theirs` is true for a merged group." It is true when any merged group placed in this kind holds a row whose source is `theirs`; a group with only rows of yours is `false`.
- "`useAddInPlace` is true on any one card." It also needs a `CardModeProvider` above (an unmanaged card is false), the card not editing, `marks` true and `canEdit`.
- "`OwnFieldRow` hides a folded value always." Only while the card is presented; in edit it is drawn so it can be changed.
- "`useOneCardOwn` with an empty `term` narrows." An empty string is no term; every group of the kind is read.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/oneCard.tsx` lines 21-201 (imports and body; the header comment, lines 1-20, is rewritten) to `src/oneCard.tsx`.

**Merged units compared and taken.** `one-card-merge` holds `mergeOneCard` and the types `OneCard`, `OneCardField`, `OneCardGroup`, `OneCardRow` and `OwnAddress`; `online-card` holds the type `OnlineCard`; `one-card-rows` holds `YourRow`; `card-mode` holds `useCardMode`. In the source the first three came from `gilb-stakeholders` and `gilb-stakeholders-ui`, and `useCardMode` from `./cardMode`.

Named changes, and only these:

- The imports are the peers' (as above).
- Comments made generic (cycle, step, tester and design-note tags, dates and person names removed); no code change. No string literal carries a tag.

New files: `src/index.ts`.

No app test file exists for this unit (the app covers it through its one-card and contact-rows suites); the tests here are new.
