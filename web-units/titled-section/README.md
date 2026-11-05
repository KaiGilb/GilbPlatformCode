# web titled-section

A section band: an optional ornament, a heading, a short rule under it, then the band's content. Vue 3 / Nuxt 3. Moved from KaiGilb/triangula-web `components/PageShell.vue` at `a01a155af3b9550b5f5d2f8b5d9d69fd3675a486` (`main`).

## What this is

A titled section band for a website page: optional ornament, heading, short rule, then the section's content.

`<TitledSection :title>` draws a `<section>` band with an optional ornament, a heading, a short rule under it, and the band's content. It is static HTML in the server's page, so it is complete before any script runs and with no script at all. In detail:

- an ornament image, only when `ornamentSrc` is set;
- a heading at `headingLevel` (default `h2`) whose text is `title`;
- a short rule under the heading (a `<div>`, not an `<hr>`), unless `rule` is false;
- the default slot, in a wrapper with `3rem` of space above it. That wrapper is rendered only when the slot is given, so a title-only band has no empty margin under the rule.

The section is labelled by the heading (`aria-labelledby`). The ornament is decorative (`alt=""`, `aria-hidden="true"`) and carries `width` and `height`. The band is static.

## What this is not

- Not a hero. It is not the page opener: no picture beside the title, no button, no background image.
- Not `web-units/section-heading`. That unit is a pill and a two-line headline whose second line brightens on scroll. This one does not scroll, and it does not reuse that component.
- Not a background image, a video, or a band that moves as the page scrolls.

## How to take it

Package: `@kaigilb/gilbwebsitecode-titled-section`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-titled-section
cd web-units/titled-section && npm pack --pack-destination <site>/vendor/gilbwebsitecode-titled-section
echo <commit> > <site>/vendor/gilbwebsitecode-titled-section/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-titled-section/kaigilb-gilbwebsitecode-titled-section-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-titled-section/kaigilb-gilbwebsitecode-titled-section-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-titled-section'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/titled-section`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-titled-section'] },
```

Then:

```vue
<script setup lang="ts">
import { TitledSection } from '@kaigilb/gilbwebsitecode-titled-section'
</script>

<template>
  <TitledSection id="about" title="About" ornament-src="/icon-mark.svg">
    <p>A short paragraph.</p>
  </TitledSection>
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `title` | the heading text (required) |
| `headingLevel?` | `'h1'`, `'h2'` or `'h3'` (default `'h2'`) |
| `tone?` | `'bg'` or `'alt'` (default `'bg'`) |
| `padding?` | `'lg'` or `'sm'` (default `'lg'`). `lg` is 50px, and 100px from 768px. `sm` is 70px at every width |
| `ornamentSrc?` | the ornament's address (default `''`, which draws none). The host serves the file |
| `ornamentWidth?`, `ornamentHeight?` | the image's `width` and `height` attributes, in px (default `25` and `29`). The rendered width is the same number of px; CSS height stays `auto` |
| `rule?` | draw the short rule (default `true`) |
| `align?` | `'center'` or `'start'` (default `'center'`), for the ornament, the heading and the rule |
| `maxWidth?` | the inner max width (default `'1140px'`), set as the CSS variable `--_max` |
| `id?` | set on the `<section>`. The heading's id is this plus `-title`, and `aria-labelledby` points at the heading. With no id, the heading id comes from Vue's `useId()`, and two bands on one page get different ids |

`TitledSectionProps`, `TitledSectionHeadingLevel`, `TitledSectionTone`, `TitledSectionPadding` and `TitledSectionAlign` are exported.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-bg` — background of a `bg` band (fallback `transparent`, so the page shows through)
- `--site-block-surface-alt` — background of an `alt` band (fallback `#e5e5e5`, the source's alternating grey)
- `--site-block-fg` — the heading's colour (fallback `#1a1a1a`)
- `--site-block-accent` — the rule's colour (fallback `#0c447c`). That navy is the source's section rule, not the hero's bright blue. On the alternating band `#e5e5e5`, `#0c447c` is 7.81:1 and the hero blue `#2494ec` is 2.56:1, under the 3:1 floor for a graphic. The hero draws its own rule; this band does not
- `--site-block-section-title-size` — the heading's font size at every breakpoint (fallback `39px`)
- `--site-block-section-title-weight` — the heading's font weight (fallback `400`)
- `--site-block-display-font` — the heading's font family (fallback `inherit`). Everything else inherits the page's font

The ornament file, if you want one. Pass its address as `ornamentSrc` (the source used `/icon-mark.svg`). This package does not ship the image.

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own padding, margins, font size and box sizing (`border-box`) instead of relying on a CSS reset.

## Layout stability

The ornament's `width` and `height` attributes (25 and 29 unless you pass others) reserve the mark's box before the file loads. The CSS width is that same pixel width (`--_ow`) and the CSS height is `auto`, so the ratio holds. The heading is `--site-block-section-title-size` (fallback 39px) at every breakpoint: it does not step down on a narrow screen. The rule is a fixed 3px by 100px. The inner column is at most `--_max` (fallback 1140px). Nothing here moves on scroll.

## Do not

- Do not use this as the page hero, and do not swap in `web-units/section-heading` for this band.
- Do not set `headingLevel="h1"` on every band of a page that already has one h1. Pass `h1` only when this band's title is the page title.
- Do not expect an ornament without `ornamentSrc`. An empty address draws none; the package has no built-in mark.
- Do not drop `ornamentWidth` and `ornamentHeight` when you change the mark's size. The attributes are what reserve the box.
- Do not shrink the heading in a phone stylesheet if you want the measured page. The source has no mobile step-down; an earlier port that went from 39px to 25px was wrong.

## Wrong readings

- Renamed from `PageShell`. The source file is this band (ornament, heading, rule, body), not a page shell.
- The default heading level is `h2`, not the source's `h1`. A reusable band usually sits under a page h1. Standalone pages that are one band pass `headingLevel="h1"`. The source allowed only `h1` or `h2`; this unit also allows `h3`.
- The ornament address is the `ornamentSrc` prop, default empty. The source hard-coded `/icon-mark.svg` behind an `ornament` boolean that defaulted to true.
- Tailwind is written out as scoped CSS. No `@apply`, no `theme()`, no utility classes. Colours and the heading's type go through `--site-block-*`.
- The measured numbers are kept as the defaults: ornament gap 6px (the live net of a 20px widget gap and a −14px pull, not the −14px alone), heading line-height 1.3, heading size 39px at every breakpoint, rule 3px by 100px, padding `lg` 50px and 100px from 768px, padding `sm` 70px always, inner width 1140px, ornament 25 by 29, slot wrapper top margin 3rem (the source's `mt-12`) and only when the default slot is used. `rule`, `align`, `maxWidth` and the ornament sizes are props whose defaults are those hard-coded values. Heading weight is `--site-block-section-title-weight` with fallback 400, because the source relied on Tailwind's preflight (headings inherit) and a bare `h2` would otherwise be bold.
- The `<section>` is labelled by its heading (`aria-labelledby`), so it is a region landmark; the source had no label.

## Source

KaiGilb/triangula-web, `components/PageShell.vue`, commit `a01a155af3b9550b5f5d2f8b5d9d69fd3675a486` on `main`. Written out without Tailwind. The differences are in Wrong readings. The unit's tests are new.
