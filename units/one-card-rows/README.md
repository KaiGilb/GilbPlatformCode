# one-card-rows

Draws the rows of a merged person card: their rows shaded and marked, your rows plain, the legend and the foot.

## What this is

Draws the rows of a merged person card: their rows shaded and marked, your rows plain, the legend and the foot.

React components, inline styles, no network, no state beyond the foot's one question. A linked person's card is one card: their online card is the master and the holder adds their own fields to it. The merge (`one-card-merge`) says which row is theirs, which is yours and which values are equal; this unit draws a row of theirs shaded and read-only with the chain link and the words of what they share, leaves a row of yours to the app's own editor, and draws the legend, the "both kept" line and the card's foot with its Unlink question.

- `TheirRows({ rows, label?, valueText?, editing?, marks?, bleed? })`: the theirs rows of one merged group, in the merge's order (`OneCardRow[]`). A row of yours in `rows` is not drawn. `label(row)` gives the label to draw (then the row's own `label`, else none); `valueText(row)` gives the value as the app words it (else the merge's `value`).
- `TheirRow({ label?, value, rungWords?, sameAsTheirs?, notes?, editing?, marks?, bleed? })`: one row of their online card. Shaded with `ONLINE_SHADE`, no control at all, the label above the value, their notes, "Shown to you as: <rungWords>" (and, with `editing`, " · only they can change this"), "You have the same on your card." when `sameAsTheirs`, and the chain link at the end when `marks`. `bleed` (px, default 16) is the group's side padding: the shade runs the group's full width.
- `YourRow({ marks, children })`: one of the app's own editors, drawn as it is. With `marks` (two sources) it is wrapped once in a box with `data-source="yours"` and nothing is drawn beside it; without, only the editor.
- `LinkMark()`: the chain link (`LinkGlyph` of `stakeholder-ui-kit`, 14 px, the live-link colour `W.link`) with its readable name "From their online card" and a hover title. The meaning never rests on the shade or the colour alone.
- `BothKeptLine()`: "Theirs and yours differ. Both are kept; nothing is overwritten." in the warn colour mixed toward the ink so it keeps 4.5:1.
- `OneCardLegend()`: what the shade and the marks mean, with a swatch of each (it draws the Theirs and Yours badges).
- `OneCardFoot({ canUnlink, busy, placed, onUnlink })`: "Connected to their online card." and, when `canUnlink`, a quiet Unlink that asks first ("Removes the link ... Keep / Unlink"). `placed` adds " They stay in your circles and show as their own row." `onUnlink` is called once, after the holder confirms, and the question closes. `busy` disables Unlink and the confirm button and says "Removing...".
- `SourceMark({ source, onShade? })` and `OwnBlockMark()`: the Theirs / Yours · private badges, kept for a caller that wants them. An app that follows "nothing on the non-linked rows" does not draw them.
- `ONE_CARD_WORDS`: the only words this unit has (the marks' and the help sentences'). `ONLINE_SHADE`: the background of every theirs row.
- `TheirRowProps`: the props type of `TheirRow`.

## What this is not

- Not the merge: which row is theirs, which values are equal and what is hidden is `mergeOneCard` of `one-card-merge`. This unit takes its `OneCardRow` and nothing else of it.
- Not a reader and not a writer: Unlink is the caller's act (`onUnlink`); the unit never sends a request.
- Not the app's editors: a row of yours is drawn by the app's own editor and keeps writing as it did.
- Not a vocabulary: no field, label or rung word is typed here. Labels and the chip words come in from the caller and the merge.
- Not the card's layout or its header: see `contact-header` for the header. A group frame, a group title and an "add your own" button are not here.

## How to take it

Package: `@kaigilb/gilbplatformcode-one-card-rows`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/one-card-rows` prints):

```sh
npm install react@^19.0.0 <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19, `one-card-merge` (`^0.1.0`, for the type `OneCardRow`: this unit imports no value from it) and `stakeholder-ui-kit` (`^0.1.0`, for `LinkGlyph` and the tokens `W`) are peers. `one-card-merge` needs `online-card`, `stakeholder-field-sets` and `vocabulary-source` in turn, which is why they come first.

## Examples

```tsx
import { mergeOneCard } from "@kaigilb/gilbplatformcode-one-card-merge";
import { BothKeptLine, OneCardFoot, TheirRows, YourRow } from "@kaigilb/gilbplatformcode-one-card-rows";

function Group({ group, linked, editing, canUnlink, busy, unlink }: Props) {
  const marks = linked; // two sources
  return (
    <section>
      <TheirRows rows={group.rows} label={() => group.label} editing={editing} marks={marks} />
      <YourRow marks={marks}>
        <MyOwnEditor field={group.term} />
      </YourRow>
      {group.bothKept ? <BothKeptLine /> : null}
    </section>
  );
}

// at the foot of a linked card
<OneCardFoot canUnlink={canUnlink} busy={busy} placed={inMyCircles} onUnlink={unlink} />;
```

## What the host must supply

- React 19, `one-card-merge` and `stakeholder-ui-kit`.
- The rows (`OneCardRow[]` from the merge), the labels and the value wording, if the merge's are not what the app shows.
- For `OneCardFoot`: `canUnlink`, `busy`, `placed` and `onUnlink` (the app's own unlink door).
- Define `--online-shade` per theme (see below). Nothing else is required.

### CSS contract

No class names and no stylesheet: every style is inline, built from CSS variables, each a chain `var(--host, var(--second, literal))`. No Tailwind is used or needed. `color-mix` needs a modern browser. The variables the unit reads:

| Host variable | Second variable | Literal fallback | Used for |
|---|---|---|---|
| `--online-shade` | `--color-online-shade` | `#EAE8E3` | the background of every theirs row (`ONLINE_SHADE`), and the legend's swatch |
| `--ink` | `--color-ink` | `#2a2622` | the value text, the Theirs mark on the shade, the Keep button, the both-kept mix |
| `--ink-soft` | `--color-ink-secondary` | `#67635e` | labels, notes, the quiet lines (4.9:1 on the shade in light), the Yours mark, the foot |
| `--line` | `--color-line` | `#d9d4cb` | the dashed line above the foot |
| `--lines` | `--color-ink`, then `#2a2622` | (the ink) | the frame of a mark, a swatch and a button, mixed 14% into transparent |
| `--surface` | `--color-card` | `#ffffff` | the legend's yours swatch and the buttons |
| `--surface-sunken` | `--color-field` | `#f4f1ea` | the legend's background |
| `--accent-ink` | `--color-primary` | `#8f4e33` | the Theirs badge when it is not on the shade |
| `--accent-soft` | `--color-primary-light` | `#f1e4dc` | the Theirs badge's fill |
| `--warn` | `--color-error-dark` | `#9a6a1e` | the both-kept line (mixed 55% with the ink) and the Unlink confirm button |
| `--live-link` | none | `color-mix(in srgb,#7B3FE4 75%,<the ink chain>)` | the chain link (`W.link` of `stakeholder-ui-kit`) |

The host must define `--online-shade` in each theme it has (light, dark, colour-blind): the literal is the light value only. The design's dark value was `#272925`. The unit sets no variable and ships no sheet.

## Module state

None. The only state is the foot's one question (open or closed), in the component. Nothing runs at import.

## Do not

- Do not draw a row of yours with `TheirRows`: it leaves it out on purpose. The app's own editor draws it.
- Do not put an input in a row of theirs. Online content cannot be edited, and the row has no control.
- Do not rely on the shade alone to say a row is theirs: the chain link's words and title say it. Keep the link when you pass `marks`.
- Do not draw the Theirs and Yours badges beside the chain link: they are kept for callers that want them, and a card that wants "nothing on the non-linked rows" does not draw them.
- Do not forget `--online-shade` in a dark theme: the light fallback would draw a pale band on a dark card.

## Wrong readings

- "`OneCardLegend` shows what the card shows." It draws the Theirs and Yours badges, which the rows themselves no longer carry (they carry the chain link). It describes an older card.
- "`T.faint` is used." The `--ink-faint` token is declared in the unit's colour table and no style reads it; the quiet text is `--ink-soft` on purpose (3.2:1 against 4.9:1 on the shade).
- "The frame follows `--line`." The frame of a mark, swatch and button reads `--lines` (with an s), then `--color-ink`, so a host that defines `--lines` colours the frames and one that defines only `--line` gets the ink at 14%.
- "`LinkMark`'s hidden words are tied to the mark." They are `position: absolute` and 1 px, but the mark itself is not `position: relative`, so they sit against the nearest positioned ancestor.
- "Two equal notes draw once." Notes are keyed by their text; two equal notes on one row repeat a React key.
- "The Unlink question closes when `canUnlink` turns false." It does not: the question stays open until Keep or Unlink is pressed.
- "`TheirRows` keeps its rows by identity." Each row is keyed by field, rung, value and index, so a re-ordered list remounts.
- "`marks` on `TheirRows` and on `YourRow` are one switch." They are separate props; pass the same value to both.

## Where it came from

`KaiGilb/gilb-stakeholders-ui` (private repo), commit `69015111d0f8dc98406acb1579dba10f9ae471bb`, copied by script:

- `src/OneCardRows.tsx` to `src/OneCardRows.tsx`: lines 1-396, the whole file.

**Merged units compared and taken or not.** `one-card-merge` (0.1.0) holds the type `OneCardRow` (and `RowSource`); `stakeholder-ui-kit` (0.1.0) holds `LinkGlyph` and `W`. Each declaration was compared with the pinned source file (token by token, comments excluded): `OneCardRow` and `RowSource` against `gilb-stakeholders` `onlineCard/mergeOneCard.ts` at `0a261488be7c98d1ac5d79887c966a445b8928bd` (the commit the UI package is run against), `LinkGlyph` against `linkGlyph.tsx` and `W` against `tokens.ts` of this commit. All are SAME.

Named changes, and only these:

1. the import of the type `OneCardRow` from `gilb-stakeholders` is the same type from the peer `@kaigilb/gilbplatformcode-one-card-merge`;
2. the imports of `LinkGlyph` from `./linkGlyph.tsx` and `W` from `./tokens.ts` are one import from the peer `@kaigilb/gilbplatformcode-stakeholder-ui-kit`;
3. the header comment is a new, shorter one, and comments that name a cycle, a ticket, a tester, a person, an app, a design note or a date are reworded; no code changed. No string literal carries a tag.

`src/index.ts` is new (it exports the eleven values and the props type). Tests (`src/*.test.tsx`; jsdom, no network, no wall clock; the hosts are `example.test` hosts, the people Ann): ported from `gilb-stakeholders-ui` `test/OneCardRows.s5d.test.tsx` 20 of 20 (here `oneCardRows.test.tsx`: the merge and the online-card parser are the peers' own, so the rows are those of a real merge) and `OneCardRows.ui2.test.tsx` 5 of 5 (`oneCardRowsLink.test.tsx`); the person Jairam became Ann and her address `ann@example.test`. Added: `oneCardRowsPinned.test.tsx` (23: the export list, the words, the shade, every part's styles and props, the foot's question). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units. Left out: none of the two files; the page-level tests of the app that draw these rows inside a whole card are not in this library.
