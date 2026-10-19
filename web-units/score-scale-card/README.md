# web score-scale-card

Stat cards with an optional scale that marks where a typical result and ours sit, in a responsive grid. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (Jairam-Gilb/gilb-websites-web, `pages/index.vue`, section "What we give you", branch `redesign-scrollcraft` b78b1f9).

## What this is

`<ScoreScaleCard :items>` draws a list of cards. Each card has a big figure, a title and a line of text, and a card with a `scale` also has a bar from its `min` to its `max` with a thin tick for the typical result, a dot for ours, a two-line legend under the bar, and one plain sentence that a screen reader hears in place of the bar. The grid picks its columns from the mix of scored and plain cards (2 scored and 3 plain give a 6-column grid on wide screens). It needs no script: the server's HTML holds everything.

The grid rule and the sentence are also exported as plain functions: `statGrid(items)`, `scaleSentence(scale, range?)` and `pct(n)`.

## What this is not

- Not a feature grid of icons and descriptions: that is `feature-grid`. These cards lead with a figure and may carry a scale.
- Not a chart: one bar per card, two markers, no data series, no axis ticks.
- Not an animated counter: nothing counts up or moves. A site that wants a reveal on scroll passes its marker through `cardAttrs`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-score-scale-card`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-score-scale-card
cd web-units/score-scale-card && npm pack --pack-destination <site>/vendor/gilbwebsitecode-score-scale-card
echo <commit> > <site>/vendor/gilbwebsitecode-score-scale-card/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-score-scale-card/kaigilb-gilbwebsitecode-score-scale-card-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-score-scale-card/kaigilb-gilbwebsitecode-score-scale-card-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-score-scale-card'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/score-scale-card`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-score-scale-card'] },
```

Then:

```vue
<script setup lang="ts">
import { ScoreScaleCard, type ScoreStat } from '@kaigilb/gilbwebsitecode-score-scale-card'
const items: ScoreStat[] = [
  { value: '95+', title: 'Speed', what: 'How fast your site loads.',
    scale: { min: '0', max: '100', typical: 'Most sites: under 50', typicalAt: 40, ours: 'Ours: 95+', oursAt: 95 } },
  { value: '€0', title: 'Monthly fee to us', what: 'Running costs go to the providers.' },
]
</script>

<template>
  <ScoreScaleCard :items="items" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `items` | `ScoreStat[]`: `{ value, title?, what?, label?, scale? }`. `label` is a shorter line used when there is no `title` or `what`. Plain text. The key of a card is `value` plus `title`, so two cards must differ in one of them. |
| `items[].scale` | `{ min, max, typical, typicalAt, ours, oursAt }`. `typicalAt` and `oursAt` are percents of the bar; a number outside 0 to 100, or not a number, is held on the bar. |
| `headingLevel?` | the title's level, 2 to 6 (default 3). Pick the level under your section's heading. |
| `cardAttrs?` | attributes put on every card, e.g. `{ 'data-reveal': '' }` for a scroll reveal the site owns |
| `rangeText?` | `(min, max) => string`, the opening words of the screen-reader sentence. Default English: "Scale 0 to 100." Pass your language here |

The sentence a screen reader hears is built from `rangeText`, the `typical` line and the `ours` line, each closed with a full stop if it has none, so it cannot disagree with the visible legend.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text, and the card's tint and border (a few percent of it)
- `--site-block-muted` secondary text and the typical marker
- `--site-block-accent` the big figure and our marker
- `--site-block-radius-lg` the card's corner (default `1.5rem`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. The card is a faint tint of the text colour over whatever is behind it. The Gilb Websites page also blurs the backdrop of its cards; this unit does not, and a site that wants that adds it to the cards (see "Wrong readings").

## Layout stability

The cards are in the server's HTML at their final size: no image, no script and no web font is needed to size them. A scored card puts its bar at the card's foot, so scored cards in one row line their bars up.

## Do not

- Do not put markup in `value`, `title`, `what` or the legend lines; they are drawn as plain text.
- Do not use a scale to hide a claim you cannot source: the figure and the markers are public statements. Keep the source next to your content.
- Do not rely on the markers alone to carry the meaning; the sentence for screen readers is the text alternative.

## Wrong readings

- The unit's card has no backdrop blur. On the Gilb Websites page the cards also carry `backdrop-filter` over a painted scene; that is the page's look, not the unit's. A site that wants it adds the rule to `.ssc-card` from its own CSS (the class names are stable) or wraps the unit.
- The reveal-on-scroll of the page's cards is not in the unit. `cardAttrs` lets the site put its own marker on each card.
- The old page also accepted a different list called `items` (a plain card grid). That stays in the page; this unit has only `items` of stats.
- The unit's list sets its own margin to 0, so a margin class on the unit's root does not take effect. Put the spacing around it on a wrapper element.
- The columns follow the count and the mix of cards, not the container width. A narrow container on a wide screen still gets the wide grid.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `pages/index.vue` (the `statGrid`, `scaleSentence` and `pct` functions and the "What we give you" list) at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Written out without Tailwind: the same sizes, spacing and colours, with the accent, text and muted colours read from `--site-block-*`. The unit's tests are new; one of them holds the old grid code as an oracle and checks all 510 arrangements of up to eight cards give the same columns and spans.
