# stakeholder-ui-kit

Gives the colour tokens, the name face, the chain-link badge, the image-shape rule and the two name-state words that the stakeholder screens share.

## What this is

Gives the colour tokens, the name face, the chain-link badge, the image-shape rule and the two name-state words that the stakeholder screens share.

Four small files that the stakeholder screens draw with. Nothing here fetches or stores anything.

- `W`: the colour tokens, each a CSS variable chain as a string (`base`, `ink`, `muted`, `brand`, `brandLighter`, `line`, `lineSubtle`, `sheet`, `relBg`, `relBorder`, `ownText`, `addText`, `link`). Read-only (`as const`).
- `NAME_FONT`: the name face, a CSS `font-family` value with its own fallbacks.
- `LinkGlyph({ size? })`: the chain-link glyph as inline SVG (default 14 px), hidden from assistive technology.
- `LinkBadge({ size?, offset?, testId? })`: the live-link badge. A white circle (default 28 px) placed absolutely at the lower left of the picture it sits in, `offset` px past the picture's corner (default -4, so outside), holding the glyph at half the badge's size in the live-link colour. Its `title` and one visually hidden text are `LINK_NOTE`. It takes no pointer events. The picture's box must be `position: relative`.
- `LINK_NOTE`: the badge's words, `Live link to their account — not a copy`.
- `imageShapeOf(type)`: `"circle"` for a person type (`t:Person`, `Person`, or a term address ending in `/t/Person` on any host, after trimming), `"rounded-square"` for any other type, a missing type, or a non-string. The shape is decided by the type the data carries, never by a name.
- `NAME_NOT_READ` (`Name could not be read`) and `NAME_NOT_YET` (`Name not read yet`): the two words a list row shows in place of a name that could not be read, or has not been asked yet.
- Types: `ImageShape`, `LinkBadgeProps`.

## What this is not

- Not a list or a header. The unit has the pieces a row draws with, not the rows.
- Not a theme. It reads the host's variables and falls back to a literal; it defines none.
- Not a name reader. `NAME_NOT_READ` and `NAME_NOT_YET` are only words; deciding which one applies is the list's work.
- Not an icon set. `LinkGlyph` is the one drawing.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-ui-kit`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/stakeholder-ui-kit
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. The unit draws with inline styles only, so no Tailwind scan is needed.

## Examples

```tsx
import { LinkBadge, W, NAME_FONT, imageShapeOf, NAME_NOT_READ } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";

function Row({ type, online, name }: { type: string | null; online: boolean; name: string | null }) {
  const round = imageShapeOf(type) === "circle";
  return (
    <div style={{ background: W.base, color: W.ink }}>
      <div style={{ position: "relative", width: 56, height: 56, borderRadius: round ? "50%" : 10 }}>
        {online && <LinkBadge size={22} offset={-2} testId="row-link" />}
      </div>
      <span style={{ fontFamily: NAME_FONT }}>{name ?? NAME_NOT_READ}</span>
    </div>
  );
}
```

## What the host must supply

- React 19.
- Nothing else is required. Every colour is a variable chain that ends in a literal, so a host with none of the variables still draws. The CSS contract is below.

### CSS contract

Each token in `W` is the chain `var(--host, var(--second, literal))`: the host's variable first, a second app's variable second, a literal last. A host's theme (light, dark, high-contrast) changes the screens by changing its own variables; do not pick a raw colour per screen.

| Host variable | Second variable | Literal fallback | Used by |
|---|---|---|---|
| `--paper` | `--color-base` | `#f4f1ea` | `base`, `brandLighter`, `ownText` |
| `--ink` | `--color-ink` | `#2a2622` | `ink`, `line` (20%), `lineSubtle` (9%), `relBg`, `relBorder` (28%), `ownText` (66%), `addText`, `link` |
| `--ink-faint` | `--color-ink-muted` | `#6f6a63` | `muted` |
| `--accent` | `--color-brand` | `#a85c3b` | `brand`, `brandLighter` (9%), `addText` (95%) |
| `--surface` | `--color-sheet` | `#ffffff` | `sheet`, `relBg` (90%) |
| `--live-link` | none | `color-mix(in srgb,#7B3FE4 75%,<the ink chain>)` | `link` |
| `--font-name` | none | `"Arial Narrow","Helvetica Neue","Roboto Condensed",Arial,sans-serif` | `NAME_FONT` |

`LinkBadge` uses `W.sheet` (the badge), `W.link` (the glyph) and `W.line` (its outline), and a fixed `box-shadow: 0 1px 2px rgba(0,0,0,.08)`. `color-mix` needs a browser that supports it.

## Do not

- Do not copy these tokens into a screen. Import `W`, so a theme changes every screen at once.
- Do not decide an image's shape from a name. Pass the type the data carries.
- Do not draw `LinkBadge` outside a `position: relative` box; it is placed absolutely.
- Do not install a second copy to share the words; `NAME_NOT_READ` and `NAME_NOT_YET` are plain strings and may be compared by value.

## Wrong readings

- "`imageShapeOf` answers circle for any word with Person in it." Only the whole type: `t:Person2` and `/t/Person/extra` are squares.
- "`LinkBadge` is the glyph." The glyph is `LinkGlyph`; the badge is the circle that holds it, with its words.
- "The tokens are colours." They are CSS strings (`var(...)`, `color-mix(...)`); use them as style values, not to compute with.
- "`NAME_NOT_READ` means the name is empty." It means the name could not be read; an empty name is another case.

## Where it came from

`KaiGilb/gilb-stakeholders-ui` (private repo), commit `69015111d0f8dc98406acb1579dba10f9ae471bb`, copied by script:

- `src/tokens.ts` lines 1-34 (whole file) to `src/tokens.ts`.
- `src/linkGlyph.tsx` lines 1-71 (whole file) to `src/linkGlyph.tsx`.
- `src/imageShape.ts` lines 1-28 (whole file) to `src/imageShape.ts`.
- `src/StakeholderList.tsx` lines 265-269 (`NAME_NOT_READ` and `NAME_NOT_YET` with their doc comments) to `src/nameWords.ts`. Nothing else from that file.

Comments made generic (person names, cycle tags, agent names and rulings removed). One import changed: `linkGlyph.tsx` imports `./tokens`, where the source wrote `./tokens.ts`, because this unit's `tsconfig.json` does not allow the `.ts` extension in an import. The two constants moved into their own file, `nameWords.ts` (a split: the list component is not taken).

`src/index.ts` is new: it re-exports the four files. The tests: the source's chain-link badge test (3) and image-shape test (4) ported (hosts renamed to `example.test`, the badge test cleans up after each test), and a file that pins every export, the token values and the two words.
