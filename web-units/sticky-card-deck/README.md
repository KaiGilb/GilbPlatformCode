# web sticky-card-deck

A deck of cards that pin and stack as the page scrolls, scaling back as the next one covers them, with a step rail; a static list under reduced motion. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (`components/scrollcraft/StickyStack.vue`, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<StickyCardDeck :steps>` draws numbered cards that pin one over another as the page scrolls: every card sticks (each 14 px lower than the one before, so a layered edge stays visible) while the next scrolls up and covers it, and the covered card scales back a little and is dimmed by a veil. From 1280 px a thin rail of numbers marks the active step. The default card shows a tag, a number, a title and a paragraph; the `card` slot replaces that content.

## What this is not

- Not scroll-jacking: pinning is native `position: sticky`, so the scroll speed and the page's length are the browser's.
- Not a carousel or tabs: all cards are in the page, in order, and in the server's HTML.
- Not the site's "process" list: the steps, the card content and the colours come from you.

## How to take it

Package: `@kaigilb/gilbwebsitecode-sticky-card-deck`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-sticky-card-deck
cd web-units/sticky-card-deck && npm pack --pack-destination <site>/vendor/gilbwebsitecode-sticky-card-deck
echo <commit> > <site>/vendor/gilbwebsitecode-sticky-card-deck/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-sticky-card-deck/kaigilb-gilbwebsitecode-sticky-card-deck-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-sticky-card-deck/kaigilb-gilbwebsitecode-sticky-card-deck-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-sticky-card-deck'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/sticky-card-deck`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-sticky-card-deck'] },
```

```vue
<script setup lang="ts">
import { StickyCardDeck, type DeckStep } from '@kaigilb/gilbwebsitecode-sticky-card-deck'
const steps: DeckStep[] = [
  { title: 'We meet', body: 'You tell us your goals.', tag: 'Meeting 1' },
  { title: 'We build', body: 'You watch it take shape.' },
]
</script>

<template>
  <StickyCardDeck :steps="steps" />
  <!-- or your own card content: -->
  <StickyCardDeck :steps="steps">
    <template #card="{ step, number }"><h3>{{ number }} {{ step.title }}</h3></template>
  </StickyCardDeck>
</template>
```

## What you pass

| Prop / slot | Meaning |
|---|---|
| `steps` | `{ title, body?, tag? }[]`; titles are the keys, keep them distinct |
| `scaleBack?` | how much a fully covered card shrinks (default `0.045`, 4.5 %) |
| `veil?` | the veil's opacity at full cover (default `0.5`) |
| `contentAttrs?` | attributes put on the default card's tag row, title row and paragraph, e.g. `{ 'data-reveal': '' }`. Not on the `<article>`: the unit writes `transform` on that, which would stomp a reveal's transform |
| slot `card` | `{ step, index, number }`; replaces the card's content. The veil stays |

`coverProgress(nextTop, vh)` and `activeStep(tops, vh)` are exported.

## Host must supply

- `--site-block-bg` the card's base and the veil. Cards must be opaque (a card is mixed 94 % from `--site-block-bg` and 6 % from `--site-block-fg`) so a covered card does not show through
- `--site-block-fg` text and the card's border and tints
- `--site-block-muted` the paragraph, the tag and the rail numbers
- `--site-block-accent` the number, the keyline, the tag dot and the active rail number

The top offset of the pin (`clamp(84px, 11vh, 120px)`) leaves room for a fixed header of about that height. A site with a taller header must adapt the unit's CSS or wrap it with a negative margin; there is no prop for it yet.

No Tailwind is needed: the styles ship in the component, scoped, with their own `border-box`.

## Layout stability

Each card has a minimum height of `clamp(240px, 34vh, 320px)` and the gap between cards is `44vh` of scroll travel, all from CSS, so the deck's length is known before any script runs. The script writes only `transform` and the veil's `opacity`, so nothing shifts. Under reduced motion the cards are a static list with 2.5rem between them.

## Do not

- Do not put the deck inside an element with `overflow: hidden`, `auto` or `scroll` (or `contain`): `position: sticky` then pins to that element and the deck does not pin.
- Do not put a `transform`, `filter` or `will-change` on an ancestor for the same reason it breaks a fixed header: it does not stop sticky but it moves the pin's reference.
- Do not use it for more steps than a reader will scroll: each card adds a screen of travel.
- Do not rely on the rail: it is hidden from screen readers and under 1280 px; the cards carry the content.

## Wrong readings

- The numbers 14 px (the step between pins), 44vh (the travel), 140 px and 70 % (where the cover starts and ends), 0.045 and 0.5 were tuned on the Gilb Websites page. `scaleBack` and `veil` are props; the rest are fixed. Without a different header height or card height they should be left alone.
- The `card` slot is new in the unit. The original card was fixed to a tag, number, title and paragraph; that is the unit's default card now.
- The original card had a glass look (blur and tint over a painted scene). The unit's card is a solid mix of `--site-block-bg` and `--site-block-fg`, because a covered card must hide the ones under it.
- The scroll feed is inlined (`src/useScrollFrame.ts`, the same file as in `scroll-frame`) because a packed copy cannot depend on another unit.
- One card: nothing covers it, so no frames are subscribed and it is a plain card.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `components/scrollcraft/StickyStack.vue`, the `sc-pill` and `sc-display` rules in `assets/css/main.css`, and `composables/useScrollFrame.ts`, at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Changed on purpose: the `card` slot; `scaleBack`, `veil` and `contentAttrs` props (the fixed `data-reveal` markers are the host's now); a solid card base instead of the glass class; Tailwind and `sc-` classes written out; the progress maths are exported functions. The unit's tests are new.
