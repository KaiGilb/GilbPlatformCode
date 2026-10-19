# web feature-grid

A grid of equal bordered tiles, one per point an offering makes: a short title, a line or two and an optional icon. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/FeatureGrid.vue` (website-engine-a 80ad391).

## What this is

`<FeatureGrid :heading :features>` draws a `<section>` with an optional centred `<h2>` and one tile per feature: its optional icon (a short text such as an emoji, hidden from screen readers), its title as an `<h3>` and its line. One column on a phone, two from 640 px, three from 1024 px. Static: it needs no script in the browser.

## What this is not

- Not a pricing table: take `web-units/pricing`.
- Not a list of links: a tile is not a link.

## How to take it

Package: `@kaigilb/gilbwebsitecode-feature-grid`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-feature-grid
cd web-units/feature-grid && npm pack --pack-destination <site>/vendor/gilbwebsitecode-feature-grid
echo <commit> > <site>/vendor/gilbwebsitecode-feature-grid/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-feature-grid/kaigilb-gilbwebsitecode-feature-grid-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-feature-grid/kaigilb-gilbwebsitecode-feature-grid-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-feature-grid'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/feature-grid`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-feature-grid'] },
```

Then:

```vue
<script setup lang="ts">
import { FeatureGrid, type Feature } from '@kaigilb/gilbwebsitecode-feature-grid'
const features: Feature[] = [
  { title: 'Fast', description: 'Static pages.', icon: '⚡' },
  { title: 'Found', description: 'Sitemap and schema.' },
]
</script>

<template>
  <FeatureGrid heading="Why us" :features="features" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `heading?` | the section's `<h2>` |
| `features` | `{ title, description, icon? }[]`; titles are the list's keys, so keep them distinct |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text
- `--site-block-muted` secondary text and borders
- `--site-block-radius-lg` card and picture corners (default `0.5rem`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

n/a: every tile is text in the server's HTML, and nothing loads later.

## Do not

- Do not put long paragraphs in a tile; it is a summary.
- Do not use the icon for meaning a reader needs: screen readers do not read it.

## Source

The website starter's `components/catalog/FeatureGrid.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes, colours and breakpoints.
