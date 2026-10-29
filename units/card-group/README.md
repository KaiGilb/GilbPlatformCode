# card-group

One framed group of a record card: a titled frame with an optional icon that holds its items, is left out when empty in presentation, and registers with the card's mode so an add chooser can list it.

## What this is

One framed group of a record card: a titled frame with an optional icon that holds its items, is left out when empty in presentation, and registers with the card's mode so an add chooser can list it.

One framed group of a record card. A group is a frame with a title (and a small icon) that holds its items, separated by hairlines, with a gap between frames. The title names what the frame holds. In presentation a group with nothing in it (`empty`) is not drawn at all.

- `CardGroup({ kind, title, icon?, helper?, aside?, empty?, keepInEdit?, addable?, label?, children, className?, testId?, dataAttrs?, addOwn?, inline? })`: a `section` (`data-testid` `card-group`, or `testId`; `data-group` = `kind`; `dataAttrs` spread on it; `aria-labelledby` the title). Not inline: a header (icon, title, aside), an optional helper line (`card-group-helper`), then the items (`card-group-items`). Inline (`data-inline="true"`): icon, title, items and aside on one line, wrapping under the title on a narrow card; no helper and no `addOwn`.
- When it is hidden: `hidden = managed && !showAll && empty && !(editing && (opened || had a value in this edit || keepInEdit))`. A group that had a value during this edit stays when its last value is removed. With no `CardModeProvider` above it, a group is never hidden.
- It registers `{ kind, label, section: chooserSectionOf(kind), shown, addable }` with the mode. `label` is the `label` prop, else the title when it is a string, else `kind`.
- After a pick: when the mode's `focusKind` is this group, it scrolls into view (centred) and `focusAfterPick` runs. The pick presses the group's own `[data-card-add]` control (the constant `CARD_ADD_ATTR`) for the person; a group with no such control gets its first enabled control focused. A control that is not ready (a disabled `[data-card-add]`, or nothing yet) is waited for with a `MutationObserver` for at most `FOCUS_WAIT_MS` (60 s). The wait ends at once when the person presses a key, presses anywhere, or puts the cursor outside the group. Nothing is focused on loading.
- `CardSection({ title, children, testId?, empty?, kinds? })`: an `h2` heading over a set of frames (`card-section`). With `empty`, in presentation, only the children are drawn; in edit the heading stays while a group in `kinds` is open or the section has had a value in this edit.
- `chooserSectionOf(kind)`: the chooser's heading a kind is listed under: `name` is Name; `email`, `phone`, `address`, `social` are Connection points; `employment` is Companies; `skill`, `interest`, `language` are Skills and interests; a `relation-` kind is Relations; a `channel-` kind or `time-zone` is Contact preferences; `attachments` is Attachments; `my-note` and `how-we-met` are Notes; a `plan-` kind is Plan; anything else is Record.
- With a `OneCardProvider` (of `one-card-context`) above it, a group of a linked person's card draws that person's rows of theirs first (`TheirRows`, one block per merged group placed in this `kind`, labelled by the view's `rowLabel` and worded by its `valueText`), then its own `children`, then a `BothKeptLine` when a merged group is both-kept, then `addOwn`. A group with a row of theirs is never empty. While the card is presented, an own side that is empty under rows of theirs draws no `children`. **Outside a `OneCardProvider` (or with a provider given `null`) it draws exactly as 0.1.0 did.**
- `CardTopSlots({ slots? })` and the type `CardSlots` (`myNote`, `howWeMet`, `nameAside`): the very top of the person card. `myNote` then `howWeMet` (this order is fixed here) in a strip (`card-top-slots`) that is hidden unless a slot has something in it. `nameAside` is for the caller to put beside the Name group's title; `CardTopSlots` does not draw it.
- `CardIcon({ name, className? })` and the type `CardIconName` (18 names): a 24x24 stroke SVG, `currentColor`, `aria-hidden`, with `data-card-icon={name}`.

## What this is not

- Not the merge and not the rows of a linked person: the merge is `one-card-merge`, the rows are drawn by `one-card-rows`, and what a group reads of the merged card is `one-card-context`. This unit only calls them.
- Not the mode. Whether the card is being edited, which groups are opened and what the chooser lists is the `card-mode` unit, which this one takes as a peer.
- Not the chooser, and not a form. It draws a frame around what the host puts in it.

## How to take it

Package: `@kaigilb/gilbplatformcode-card-group`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/card-group` prints). Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of React, one mode context, one one-card context):

```
install-links=true
```

```sh
npm install react@^19.0.0 <path-to-the-library>/units/card-mode <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/card-group/src";`.

## Examples

```tsx
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardSection, CARD_ADD_ATTR } from "@kaigilb/gilbplatformcode-card-group";

<CardModeProvider canEdit>
  <CardSection title="Plan" kinds={["plan-function"]}>
    <CardGroup kind="plan-function" title="Function" icon="skill" helper="What it must do" empty={lines.length === 0}>
      {lines.map((l) => <Line key={l.id} line={l} />)}
      <button type="button" {...{ [CARD_ADD_ATTR]: "" }} onClick={addLine}>Add a line</button>
    </CardGroup>
  </CardSection>
</CardModeProvider>;
```

## What the host must supply

- React 19, and the peers `card-mode`, `one-card-rows` and `one-card-context` installed beside this one, with ONE `CardModeProvider` above the card. A `OneCardProvider` above the card is optional: without it the group draws as 0.1.0 did.
- Tailwind v4 with container queries (`@container`, `@md:`), scanning this unit's `src`, so the classes are generated.
- The `editorial-tokens` variables: `--surface`, `--lines`, `--line`, `--accent-ink`, `--ink-soft`, `--ink-faint`, `--serif` (from the `editorial-tokens` unit, or define them yourself); and `--ink` for `CardSection`'s heading.
- The group's own add control, named with `data-card-add`, if you want the pick to press it. The chooser that sets `focusKind` (through the mode's `openGroup`).

## Do not

- Do not list `card-mode` or `one-card-context` under this unit's `dependencies` or give the app a second copy of either: a group reading another copy never sees your provider. For `card-mode` it is always drawn; for `one-card-context` the person's rows are never drawn.
- Do not hide an empty group yourself; pass `empty` and let the mode decide.
- Do not focus the group's field on loading. Only a pick from the chooser (`focusKind`) moves the focus.
- Do not give a control the `data-card-add` name unless pressing it adds the first value.

## Wrong readings

- "`empty` hides the group." Only when the card is managed, `showAll` is off, and the group is not opened, kept (`keepInEdit`) or already holding a value in this edit.
- "A group without a provider is hidden when empty." It is drawn: `managed` is false.
- "A group is empty when `empty` is true." Inside a `OneCardProvider`, a group that holds a row of theirs is not empty, whatever `empty` says.
- "`CardTopSlots` draws `nameAside`." It does not; only `myNote` and `howWeMet`.
- "`focusAfterPick` is exported." It is private to the unit.
- "`addOwn` shows in every layout." It is drawn in the non-inline layout only, last in the items.
- "The border is `--line`." The frame is `color-mix(in srgb, var(--lines) 14%, transparent)`; `--line` is the hairline between items.
- "`CardSection` always draws a heading." With `empty` it draws only its children, in presentation and in edit unless a listed kind is open or it has held a value.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`:

- `src/components/records/CardGroup.tsx` lines 1-317, the whole file, to `src/CardGroup.tsx`. Comments made generic. Code changes, and only these:
  - the imports are the peers': `BothKeptLine` and `TheirRows` from `@kaigilb/gilbplatformcode-one-card-rows` (source: `gilb-stakeholders-ui`), `useOneCard` and `useOneCardGroup` from `@kaigilb/gilbplatformcode-one-card-context` (source: `./oneCard`), `useCardMode` from `@kaigilb/gilbplatformcode-card-mode` (source: `./cardMode`).
- `src/components/records/cardIcons.tsx` lines 1-67 (whole file) to `src/cardIcons.tsx`. Comments made generic; no code change.

`src/index.ts` is new. The pick-then-focus tests follow `src/components/records/CardGroup.s10iter1focus.test.tsx` without the add-information sheet, which is not in this unit. `CardGroupOneCard.test.tsx` is new.

## Changes in 0.2.0

The unit is the app's `CardGroup.tsx` again, with the one-card branches that 0.1.0 had cut. Re-copied from 9a602ea7 (the 0.1.0 ranges were token-equal there, so the re-copy changes only what follows).

Restored:

- the imports of `BothKeptLine` and `TheirRows` and of `useOneCard` and `useOneCardGroup` (source lines 14 and 17);
- `const one = useOneCardGroup(kind);`, `const view = useOneCard();`, `const ownEmpty = empty;` and `const groupEmpty = empty && !one?.theirs;` (lines 166-169);
- in the non-inline return: the rows of theirs, `{one?.theirs && ownEmpty && mode.managed && mode.presentation ? null : children}` and the both-kept line (lines 239-255);
- `CardSlots` and `CardTopSlots` (lines 301-317), exported from the library entry;
- the `addOwn` comment says again that it is drawn after the both-kept line and when the own side is empty under rows of theirs.

Added peers: `one-card-context` and `one-card-rows` (^0.1.0). `one-card-context` holds a module context, so two installed copies break the merged card.

Not changed: outside a `OneCardProvider` the group draws as 0.1.0 did (`useOneCardGroup` and `useOneCard` answer `null`, so every added branch is off). Every 0.1.0 test passes unchanged, and every Plan card passes unchanged.

The 0.1.0 named changes (the one-card branches removed, `ownEmpty` merged into `groupEmpty`, the `{children}` simplification) are gone; the one that stays is the `useCardMode` import from the peer.
