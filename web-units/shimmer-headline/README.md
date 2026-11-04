# web shimmer-headline

A headline that a single gold highlight sweeps across once, when it first scrolls into view; plain text before, after, with no script and with reduced motion. Vue 3 / Nuxt 3. Moved from KaiGilb/myjackfruit-web `components/motion/ShimmerHeadline.vue` at `9dc8c8d3d12c6e6327e77484fe45753011669d99`.

## What this is

A shimmer headline for a website: a single highlight band sweeps across the heading once, when it first scrolls into view, and then it is plain text again. The server HTML, the no-script page, reduced motion and the settled state are all the same plain heading in the page's own colour; the pass is 3.2s, starts 220ms after the heading enters the view, runs once per page view; it works across wrapped lines; the text stays selectable and is read normally by a screen reader.

## What this is not

- Not a text colour (nothing rests in the highlight colour).
- Not a loop.
- Not a fade or rise (see `scroll-frame`'s ScrollReveal, which it composes with: the 220ms delay lets the rise and the sweep read as one move).

## How to take it

Package: `@kaigilb/gilbwebsitecode-shimmer-headline`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-shimmer-headline
cd web-units/shimmer-headline && npm pack --pack-destination <site>/vendor/gilbwebsitecode-shimmer-headline
echo <commit> > <site>/vendor/gilbwebsitecode-shimmer-headline/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-shimmer-headline/kaigilb-gilbwebsitecode-shimmer-headline-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-shimmer-headline/kaigilb-gilbwebsitecode-shimmer-headline-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-shimmer-headline'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/shimmer-headline`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-shimmer-headline'] },
```

```vue
<script setup lang="ts">
import { ShimmerHeadline } from '@kaigilb/gilbwebsitecode-shimmer-headline'
</script>

<template>
  <ShimmerHeadline tag="h2" class="…">Build applications you can keep.</ShimmerHeadline>
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `tag?` | The heading element, default `h2`. |
| `onDark?` | On a dark section: the band sweeps over the page colour instead of the text colour. Default `false`. |
| default slot | The heading's text. |

## Host must supply

`--site-block-fg` (the band's ground on a light section), `--site-block-bg` (on a dark section), `--site-block-shimmer` (the highlight, fallback the source's gold `#e7b339`). The heading's own font, size and colour come from the host's classes.

No Tailwind is needed: the styles ship in the component, scoped to it.

## Layout stability

Nothing changes size or place: only the paint of the glyphs changes during the pass.

## Do not

- Do not use it on body text or on more than one heading per view.
- Do not set a highlight colour that is the text's own colour (the band then disappears).
- Do not leave a `background` on the heading itself (the pass replaces it for 3.2s).

## Wrong readings

- The site's `--brand-fg`, `--brand-bg` and `--palette-goldBright` are the library's `--site-block-fg`, `--site-block-bg` and the new `--site-block-shimmer` (fallback the source's `#e7b339`).
- Classes and keyframes are `sh`, `sh--dark`, `sh--sweeping` and `sh-sweep` (the source: `mj-shimmer`, `is-dark`, `is-sweeping`, `mj-shimmer-sweep`); the `animationend` filter matches `sh-sweep` by part, as the source did for its name.
- Props are declared inline with `withDefaults` (same names and defaults).

## Source

`KaiGilb/myjackfruit-web`, `components/motion/ShimmerHeadline.vue`, commit `9dc8c8d3d12c6e6327e77484fe45753011669d99`. `brand.palette.goldBright` in `design-tokens.json` at the same commit is `#e7b339`. The unit's tests are new.
