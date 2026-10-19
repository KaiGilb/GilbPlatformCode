# web section-heading

A section heading: a pill label, a two-line headline whose second line brightens on scroll, and a paragraph offset to the right. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (`components/scrollcraft/SectionHeader.vue`, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<SectionHeading line1 line2 body pill>` draws a section's opening: a small pill label with a dot, a headline in two lines where line 2 starts dim and brightens as it scrolls into place, and a paragraph offset to the right on screens from 768 px. The dim line is the served state, in the muted colour; a bright copy (hidden from screen readers) lies over it and fades in by opacity with the scroll. With no script or under reduced motion it is the static two-tone look, fully legible.

## What this is not

- Not a page title or hero: it has no image, button or form, and its level is yours to set.
- Not the reveal-on-scroll of the blocks: pass your own marker through `blockAttrs` (see `scroll-frame`).
- Not for a sentence that must be read in one colour: line 2 is dim until reached.

## How to take it

Package: `@kaigilb/gilbwebsitecode-section-heading`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-section-heading
cd web-units/section-heading && npm pack --pack-destination <site>/vendor/gilbwebsitecode-section-heading
echo <commit> > <site>/vendor/gilbwebsitecode-section-heading/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-section-heading/kaigilb-gilbwebsitecode-section-heading-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-section-heading/kaigilb-gilbwebsitecode-section-heading-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-section-heading'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/section-heading`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-section-heading'] },
```

```vue
<script setup lang="ts">
import { SectionHeading } from '@kaigilb/gilbwebsitecode-section-heading'
</script>

<template>
  <SectionHeading pill="Why us" line1="Why choose us." line2="Built around you." body="We start with your goals." :level="2" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `line1` | headline line 1, bright |
| `line2?` | headline line 2, dim then scroll-brightened; empty gives a one-line headline |
| `pill?` | the label; empty draws no pill |
| `body?` | the paragraph, offset right from 768 px; empty draws none |
| `level?` | the headline's level, 2 to 6 (default 2) |
| `blockAttrs?` | attributes put on the pill, the headline and the paragraph, e.g. `{ 'data-reveal': '' }` |

`brightness(top, vh, startAt?, window?)` is exported (0.78 and 0.13 by default).

## Host must supply

- `--site-block-fg` headline, bright copy, and the pill's tint (a few percent)
- `--site-block-muted` the dim line, the paragraph and the pill's text
- `--site-block-accent` the pill's dot

No Tailwind is needed: the styles ship in the component, scoped, with their own `border-box`. Text inherits the page's font; the headline sets weight 650 and tight tracking, which suit a variable font that has 650.

## Layout stability

Both copies of line 2 are in the same box (the bright one sits over the dim one), and only opacity changes, so nothing moves. Final size is the server's HTML.

## Do not

- Do not make the dim colour (`--site-block-muted`) lower in contrast than the 3:1 large-text bar on your background: it is the resting state a visitor can stop on.
- Do not add a CSS transition to the bright copy: its opacity is written every frame from the scroll.
- Do not use two of these in a row with the same `line1`; the heading outline would repeat.

## Wrong readings

- The brightening is a short snap, not a slow fade: full brightness over 13 % of the viewport once the line passes 78 % of its height. The original page narrowed it from 34 % on purpose because a long crawl read as "barely visible".
- The pill, headline and paragraph are three separate blocks so the host can reveal them one after another; the unit does no reveal itself.
- The scroll feed is inlined (`src/useScrollFrame.ts`, the same file as in `scroll-frame`) because a packed copy cannot depend on another unit.
- The pill, display type and tints were the site's `sc-pill`, `sc-display` and `sc-line-dim` classes; they are written out here with `--site-block-*` colours.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `components/scrollcraft/SectionHeader.vue`, the `sc-pill`, `sc-display` and `sc-line-dim` rules in `assets/css/main.css`, and `composables/useScrollFrame.ts`, at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Changed on purpose: the `data-reveal` marker is passed in (`blockAttrs`) rather than fixed; the level may be 2 to 6 (was h2 or h3); Tailwind and `sc-` classes written out. The unit's tests are new.
