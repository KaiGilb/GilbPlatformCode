# web scrub-text

Lines of text that brighten one after another as the page scrolls; fully lit with no script or reduced motion. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (`components/scrollcraft/ScrubLines.vue`, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<ScrubText :lines>` draws one paragraph per line, large display type. As the page scrolls, each line brightens from a dim to a full opacity as its top rises through a zone of the viewport (85 % to 55 % of its height by default), eased, one line after another, so the block fills top to bottom as the visitor reads. Scrolling back up un-fills them. The served HTML, a visitor with no script and one who prefers reduced motion all see every line fully opaque.

## What this is not

- Not a typewriter or a word-by-word reveal: whole lines, by opacity only.
- Not a spotlight that moves and re-dims lines already read: a line that has been lit stays lit while the visitor scrolls down.
- Not a heading: the lines are paragraphs. A section's heading is `section-heading`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-scrub-text`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-scrub-text
cd web-units/scrub-text && npm pack --pack-destination <site>/vendor/gilbwebsitecode-scrub-text
echo <commit> > <site>/vendor/gilbwebsitecode-scrub-text/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-scrub-text/kaigilb-gilbwebsitecode-scrub-text-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-scrub-text/kaigilb-gilbwebsitecode-scrub-text-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-scrub-text'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/scrub-text`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-scrub-text'] },
```

```vue
<script setup lang="ts">
import { ScrubText } from '@kaigilb/gilbwebsitecode-scrub-text'
</script>

<template>
  <ScrubText :lines="['We start with your goals.', 'Then we design every page to reach them.']" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `lines` | the sentences, one per rendered line; plain text. Keys are the indexes |
| `dim?` | opacity of a line not yet reached (default `0.38`, see "Wrong readings") |
| `lit?` | opacity of a line reached (default `1`) |
| `fadeStart?`, `fadeEnd?` | fractions of the viewport height where a line starts to brighten and is fully lit (defaults `0.85` and `0.55`); `fadeStart` must be larger |

`lineOpacity(top, vh, dim, lit, fadeStart, fadeEnd)` is exported for hosts and tests.

## Host must supply

- `--site-block-fg` the text colour (neutral fallback `#1a1a1a`)

The measurement behind `dim` is for light text on a black page (see below). A site with a light page, or other colours, must check its own: the dim state is a resting state a visitor can stop on.

No Tailwind is needed: the styles ship in the component, scoped to it, with their own `border-box`. Text inherits the page's font.

## Layout stability

Only opacity changes, so the block never moves or changes size. Lines are in the server's HTML at their final size (type is `clamp(1.6rem, 3.6vw, 2.75rem)`).

## Do not

- Do not set `dim` lower without measuring the contrast of the dim state on your page (see below).
- Do not put the block where it is above the fold on load and expect the dim-in: it is armed only when fully below the fold at mount, so a reload mid-page never dims what is being read.
- Do not add a CSS transition on the lines: opacity is written every frame from the scroll position; a transition only lags.

## Wrong readings

- **The default `dim` of 0.38 is an accessibility value, not taste.** Measured on the Gilb Websites page (text `#EDEFF5` on `#000000`): at opacity 0.38 the text composites to rgb(90,91,93), 3.09:1 against the 3:1 bar for large text (QA 2026-10-05: 3.08 by arithmetic, 3.12 to 3.16 in pixels). The margin is under 0.1: a darker dim or a lighter background fails (0.34 gives 2.65:1). The type is 25.6 px at its smallest, so the large-text bar applies. A visitor who stops mid-block holds the unlit lines at that resting state. A test in this unit repeats the arithmetic.
- 0.38 is not the value of the site this effect copies (0.25, which gives 1.90:1 on black and fails). The trade is a softer change (2.6x between dim and lit instead of 4x) for a resting state that passes. Putting `dim` back to 0.25 "for parity" buys contrast of motion at the price of an AA failure.
- The no-script state, the served HTML and reduced motion are fully opaque. That is the designed state, not a missing effect.
- The scroll feed is inlined in this unit (`src/useScrollFrame.ts`), the same file as in `scroll-frame`, because a packed copy cannot depend on another unit. It listens on its own, as the original did.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `components/scrollcraft/ScrubLines.vue` and `composables/useScrollFrame.ts` at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Changed on purpose: `dim`, `lit` and the zone are props with the old values as defaults; the Tailwind and `sc-display` classes are written out, text colour from `--site-block-fg`; the opacity maths is an exported function. Same behaviour otherwise. The unit's tests are new.
