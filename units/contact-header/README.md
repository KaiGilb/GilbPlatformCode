# contact-header

Draws a stakeholder's header: the holder's vault joined to the person, with circle chips, photo and link badge, in a wide or narrow layout.

## What this is

Draws a stakeholder's header: the holder's vault joined to the person, with circle chips, photo and link badge, in a wide or narrow layout.

Plain React over props. It reads nothing and writes nothing; the app hands in the contact, the holder and the pieces it draws itself (as slots and render props), and the header arranges them. It ships its own style sheet, so an app needs no Tailwind scan of this unit and no icon font.

- `ContactHeader(props)`: the header block (`data-testid="contact-shell-header"`). One DOM for every layout; only the style sheet differs.
  - `layout`: `"narrow"` (default; the two-row phone header), `"wide"` (one row on a PC: holder far left with its name and kind, the connection between, the contact's name right-justified, the contact image far right) or `"auto"` (narrow, and wide from 56rem of the header's own width, by a CSS container query; no JS measure).
  - `contact`: `{ displayName, unnamed, photoUrl, origin, originLoading, placements, placementOpen, kind? }`. `placements` are shown through `displayPlacements` (Inner Circle covers the 1st connection of the same context). `kind: "group"` changes only the words of the empty chip ("Set access" for a group, "Set connection type" for a person).
  - `linked`: the chain-link badge on the contact's photo shows only when true.
  - `holder`: the holder's image, a node or a function of `{ shape, size, cssSize }` (draw at `cssSize`; in `auto` it is a CSS variable the sheet sets per width). `holderInfo`: `{ name, caption, type }`, the holder's name, its kind in words and its type (a person is a circle, any other type a rounded square). `contactType` and `contactCaption`: the same for the contact.
  - `nav`: the app's navigation, drawn in row 1 right after the holder's image (narrow only). `framed` (default true): false when the app's own header already draws the band.
  - `renderPlacementChip(placement)`: draws one chip. `onTogglePlacement`: the chips become ONE button that opens the placement panel; without it, in wide, the chips are read-only and an empty placement draws nothing.
  - `renderPhoto({ src, alt, className, testId })`: draws the contact's photo. `onPhoto`: the photo is a button that calls it. `photoEditor`: drawn instead of the photo (a node or a function of `{ shape, size, cssSize }`). `after`: drawn after the row.
  - `relations`: the relation chips, in order (`{ key, text, kind: "predicate" | "term-name" | "own", curie, title }`), at most 4 lines; with more, the 4th is "+N more", which expands the stack in place ("Show fewer" folds it back). `onAddRelation`: draws "+ Relation" last and calls it. The unit holds no word of the ontology: every chip's text comes from the app.
  - The Where / How we met line (`contact.origin`) is a button: in narrow it is one line with an ellipsis and a tap shows the whole text; in wide it is two lines. `originLoading` shows "Loading where you met…" while there is no text.
- `contactInitials({ displayName, unnamed })`: two letters of one word, or the first letters of the first and last word, upper-cased; `"?"` when unnamed or blank.
- Types: `ContactHeaderLayout`, `ContactHeaderSlotImage`, `ContactHeaderHolder`, `ContactHeaderContact`, `ContactHeaderRelation`, `ContactHeaderImage`, `ContactHeaderProps`.

## What this is not

- Not navigation, search, routing, a QR sheet or a favourite star. The app keeps those around the component (`nav` and `after` are the places for them).
- Not an image loader. The holder's image, the contact's photo and the chips are drawn by the app (`holder`, `renderPhoto`, `renderPlacementChip`).
- Not a writer. Placing a person, adding a relation and changing a photo are the app's, behind `onTogglePlacement`, `onAddRelation` and `photoEditor`.
- Not a word list for the ontology. A relation chip's words come in from the app.
- Not themable by props. It reads the host's CSS variables and falls back to a literal.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-header`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/contact-header` prints):

```sh
npm install react@^19.0.0 <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19, `person-connections` (`^0.1.0`, for `displayPlacements` and the type `AtomicPlacement`) and `stakeholder-ui-kit` (`^0.1.0`, for the tokens, the badge glyph and the image-shape rule) are peers. `person-connections` in turn needs `record-sync` and `online-card-link`, which is why they come first; this unit calls no network.

## Examples

```tsx
import { ContactHeader } from "@kaigilb/gilbplatformcode-contact-header";

function Header({ person, holder, openPanel }: Props) {
  return (
    <ContactHeader
      layout="auto"
      linked={person.hasOnlineCard}
      contact={{
        displayName: person.name,
        unnamed: !person.name,
        photoUrl: person.photoUrl,
        origin: person.metAt,
        originLoading: false,
        placements: person.placements,
        placementOpen: false,
      }}
      holderInfo={{ name: holder.name, caption: "Me", type: "t:Person" }}
      contactType="t:Person"
      contactCaption="Person · online card"
      holder={(image) => <Avatar vault={holder} size={image.cssSize} shape={image.shape} />} // yours
      renderPlacementChip={(p) => <Chip placement={p} />}                                     // yours
      onTogglePlacement={openPanel}
      renderPhoto={(img) => <img src={img.src} alt={img.alt} className={img.className} data-testid={img.testId} />}
    />
  );
}
```

## What the host must supply

- React 19, `person-connections` and `stakeholder-ui-kit`.
- `contact` and `linked`, the `holder` image and `renderPlacementChip`, `renderPhoto`. Everything else is optional.
- Nothing else is required. The CSS contract is below.

### CSS contract

The header injects its own `<style>` (the same text for every header). Two headers on a page ship two sheets: the rules are doubled, which is harmless but wasteful.

- Class prefix: `gsh-` (and the root `.gsh`). The sheet styles 29 `gsh-*` names: `gsh-add`, `gsh-arrow`, `gsh-arrow-end`, `gsh-badge`, `gsh-caption`, `gsh-chips`, `gsh-conn`, `gsh-cpic`, `gsh-hname`, `gsh-hname-name`, `gsh-hpic`, `gsh-ident`, `gsh-img`, `gsh-initials`, `gsh-loading`, `gsh-more`, `gsh-name`, `gsh-nav`, `gsh-origin`, `gsh-q`, `gsh-rel`, `gsh-rel-name`, `gsh-rel-own`, `gsh-rel-text`, `gsh-rels`, `gsh-row`, `gsh-sr`, `gsh-sub`, `gsh-word`. Do not use these names in your own CSS.
- Container: the OUTER box (`.gsh-q`) is the size container, named `gsh` (`container-type: inline-size`). The INNER `.gsh` carries the layout (`data-layout`) and the size variables, because a container query styles only the container's descendants. The queries are `@container gsh (min-width: 56rem)` (wide, for `auto`), `(max-width: 340px)` and `(max-width: 29rem)` (name and origin go under the photo).
- Variables the sheet sets (on `.gsh`, by layout): `--gsh-badge`, `--gsh-badge-at`, `--gsh-cont`, `--gsh-hold`, `--gsh-name` (five). The sizes: narrow 60 px holder, 80 px contact, 28 px badge, 18 px name; wide 128 px both, 32 px badge, 22 px name; `auto` follows the container.
- Variables the sheet reads, from `stakeholder-ui-kit`'s tokens, each a chain `var(--host, var(--second, literal))`:

| Host variable | Second variable | Literal fallback |
|---|---|---|
| `--paper` | `--color-base` | `#f4f1ea` |
| `--ink` | `--color-ink` | `#2a2622` |
| `--ink-faint` | `--color-ink-muted` | `#6f6a63` |
| `--accent` | `--color-brand` | `#a85c3b` |
| `--surface` | `--color-sheet` | `#ffffff` |
| `--live-link` | none | `color-mix(in srgb,#7B3FE4 75%,<the ink chain>)` |
| `--font-name` | none | `"Arial Narrow","Helvetica Neue","Roboto Condensed",Arial,sans-serif` |

`color-mix` and container queries need a modern browser. No Tailwind is used or needed.

## Module state

None. The sheet text is a constant built when the module loads; each header holds its own React state (whether the origin line is open, whether the relation stack is expanded).

## Do not

- Do not draw a second header with a different arrangement of the same DOM by CSS of your own: switch `layout`.
- Do not measure the width in JavaScript to choose `wide`; use `auto`, which follows the header's own width by container query.
- Do not pass `onTogglePlacement` unless the app can place: with it, an empty placement draws "Set connection type" as a button.
- Do not put words of the ontology in this unit; pass `relations` with the text the app read.
- Do not give `holder` or `photoEditor` a fixed pixel size in `auto`; draw at `cssSize`, which is a CSS variable the sheet sets per width.

## Wrong readings

- "`wide` is chosen by the screen width." It is chosen by `layout`; only `auto` follows the header's own width.
- "The chips show what is stored." `displayPlacements` shows only Inner Circle when both depths of one context are stored.
- "Without `onTogglePlacement` an unplaced person shows 'Set connection type'." In every layout it then draws nothing: a chip that cannot be pressed is not drawn. (With `onTogglePlacement` the empty chip is drawn in every layout.)
- "The origin line is always short." It is one line with an ellipsis in narrow and two lines in wide; a tap (or click) on the button shows the whole text, and a new text closes it again.
- "`+ Relation` shows when there are relations." It shows only when `onAddRelation` is given.
- "A header has no stylesheet of its own." It does: the sheet text is inside the component (a `<style>` element in each header).
- "The photo is always a button." It is a button only when `onPhoto` is given; otherwise a plain box.

## Where it came from

`KaiGilb/gilb-stakeholders-ui` (private repo), commit `69015111d0f8dc98406acb1579dba10f9ae471bb`: `src/ContactHeader.tsx` lines 1-571 (whole file) to `src/ContactHeader.tsx`, copied by script.

**Merged units compared and taken.** `person-connections` (0.1.0) holds `displayPlacements` and the type `AtomicPlacement` (and `ATOMIC_PLACEMENTS`, which `displayPlacements` uses); their declarations were compared with the pinned `gilb-stakeholders` `src/connections/placements.ts` at `0a261488be7c98d1ac5d79887c966a445b8928bd` token by token (comments excluded) and are equal. `stakeholder-ui-kit` (0.1.0) holds `W`, `NAME_FONT`, `imageShapeOf`, the type `ImageShape`, `LINK_NOTE` and `LinkGlyph`; they were compared with the pinned `tokens.ts`, `imageShape.ts` and `linkGlyph.tsx` and are equal.

Named changes, and only these:

1. the import of `displayPlacements` and `AtomicPlacement` from `gilb-stakeholders` is the peer `@kaigilb/gilbplatformcode-person-connections`;
2. the imports of `./imageShape.ts`, `./linkGlyph.tsx` and `./tokens.ts` are one import from the peer `@kaigilb/gilbplatformcode-stakeholder-ui-kit`;
3. comments made generic (person names, cycle and ticket tags, agent names, app names, a mockup path and a design-note reference removed). Checked token by token with comments and imports left out: the code is the source's.

Two things in the source carry a work tag and were left, because they are code and not comments: the function name `s46Rules`, and two CSS comments inside the template strings of the style sheet (they ship in the `<style>` text). A change to either would be a change of behaviour or of the sheet's text, and is for the owner.

`src/index.ts` is new. Tests (`src/*.test.tsx`; jsdom, no network, no wall clock): ported from `gilb-stakeholders-ui` `test/ContactHeader*.test.tsx` (8 files, 81 tests, which run as 84 because three of them are in loops): `contactHeader.test.tsx` 15, `contactHeaderWide.test.tsx` 18, `contactHeaderAuto.test.tsx` 10 (9 declared), `contactHeaderRelations.test.tsx` 23 (21 declared), `contactHeaderNav.test.tsx` 9, `contactHeaderNarrowFix.test.tsx` 7, `contactHeaderAutoQuery.test.tsx` 1, `contactHeaderWideOrder.test.tsx` 1. Person names became Ann and Ben, hosts `example.test`, and tags in names and comments were removed. New: `contactHeaderPinned.test.tsx` (43: the exports, `contactInitials`, every layout's slot sizes, the slots, the connection, the relation stack, the origin line and the sheet's class names, variables, sizes and queries). Left out, by file: none of the 8 `ContactHeader*.test.tsx` files. Not ported: the two `StakeholderList` test files that draw the header inside the list (they belong to the list's unit), the Playwright specs under `e2e/` and the two harness files under `harness/` (they go through a whole page and need Chromium for layout). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
