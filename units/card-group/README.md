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
- `CardIcon({ name, className? })` and the type `CardIconName` (18 names): a 24x24 stroke SVG, `currentColor`, `aria-hidden`, with `data-card-icon={name}`.

## What this is not

- Not the person card's one-card rows: those branches are not in this unit. The source file also holds a linked person's read-only rows and a both-kept line; they are cut. `CardGroup` here only draws `children`.
- Not `CardSlots` and `CardTopSlots` (the person card's top slots for My Note and Where / How we met): not taken.
- Not the mode. Whether the card is being edited, which groups are opened and what the chooser lists is the `card-mode` unit, which this one takes as a peer.
- Not the chooser, and not a form. It draws a frame around what the host puts in it.

## How to take it

Package: `@kaigilb/gilbplatformcode-card-group`

Take it together with its peer `card-mode`. Put this line in your app's own `.npmrc` so both are installed as copies and not links (one copy of React, one mode context):

```
install-links=true
```

Then install both:

```sh
npm install <path-to-the-library>/units/card-mode <path-to-the-library>/units/card-group
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

- React 19, and the `card-mode` unit installed beside this one, with ONE `CardModeProvider` above the card.
- Tailwind v4 with container queries (`@container`, `@md:`), scanning this unit's `src`, so the classes are generated.
- The `editorial-tokens` variables: `--surface`, `--lines`, `--line`, `--accent-ink`, `--ink-soft`, `--ink-faint`, `--serif` (from the `editorial-tokens` unit, or define them yourself); and `--ink` for `CardSection`'s heading.
- The group's own add control, named with `data-card-add`, if you want the pick to press it. The chooser that sets `focusKind` (through the mode's `openGroup`).

## Do not

- Do not list `card-mode` under this unit's `dependencies` or give the app a second copy of it: a group reading another copy never sees your provider and is always drawn.
- Do not hide an empty group yourself; pass `empty` and let the mode decide.
- Do not focus the group's field on loading. Only a pick from the chooser (`focusKind`) moves the focus.
- Do not give a control the `data-card-add` name unless pressing it adds the first value.

## Wrong readings

- "`empty` hides the group." Only when the card is managed, `showAll` is off, and the group is not opened, kept (`keepInEdit`) or already holding a value in this edit.
- "A group without a provider is hidden when empty." It is drawn: `managed` is false.
- "`focusAfterPick` is exported." It is private to the unit.
- "`addOwn` shows in every layout." It is drawn in the non-inline layout only, last in the items.
- "The border is `--line`." The frame is `color-mix(in srgb, var(--lines) 14%, transparent)`; `--line` is the hairline between items.
- "`CardSection` always draws a heading." With `empty` it draws only its children, in presentation and in edit unless a listed kind is open or it has held a value.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`:

- `src/components/records/CardGroup.tsx` lines 1-293 (everything but `CardSlots` and `CardTopSlots`, lines 295-317, which are not taken) to `src/CardGroup.tsx`. Comments made generic. Code changes (the one-card branches are removed; the plan card never mounts the person card's one-card provider, so in the source `one` and `view` are null for every plan group):
  - the imports of `gilb-stakeholders-ui` (`BothKeptLine`, `TheirRows`) and of `./oneCard` are deleted;
  - `const one = useOneCardGroup(kind);` and `const view = useOneCard();` are deleted;
  - `const ownEmpty = empty;` and `const groupEmpty = empty && !one?.theirs;` became the single line `const groupEmpty = empty;`;
  - in the non-inline return, the `{one && view ? one.groups.map(... TheirRows ...) : null}` block and the `{one?.bothKept ? <BothKeptLine /> : null}` line are deleted, and `{one?.theirs && ownEmpty && mode.managed && mode.presentation ? null : children}` became `{children}`;
  - the `useCardMode` import is from `@kaigilb/gilbplatformcode-card-mode` (the peer) and not `./cardMode`.
  - The `addOwn` prop is kept: no `Plan*` component of the app passes it, but it is harmless and keeps the API.
- `src/components/records/cardIcons.tsx` lines 1-67 (whole file) to `src/cardIcons.tsx`. Comments made generic; no code change.

`src/index.ts` is new. The pick-then-focus tests follow `src/components/records/CardGroup.s10iter1focus.test.tsx` without the add-information sheet, which is not in this unit.
