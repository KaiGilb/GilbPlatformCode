# web pricing

An offering's plans side by side: each column has the plan's name, its price, an optional period, the list of what it includes and an optional button to choose it; one plan may be featured. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/Pricing.vue` (website-engine-a 80ad391).

## What this is

`<Pricing :heading :plans>` draws a `<section>` with an optional centred `<h2>` and one bordered column per plan: the name as an `<h3>`, the price large with `/<period>` after it, the included items as a list with a check (hidden from screen readers), and the button when `ctaLabel` is given, linking to `ctaTo` (default `/contact`). A `featured` plan has the accent border and a filled button; the others an outlined one. One column on a phone, two from 640 px, three from 1024 px. Static: it needs no script in the browser.

## What this is not

- Not a checkout or a price calculator: the button is a link.
- Not a feature list without prices: take `web-units/feature-grid`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-pricing`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-pricing
cd web-units/pricing && npm pack --pack-destination <site>/vendor/gilbwebsitecode-pricing
echo <commit> > <site>/vendor/gilbwebsitecode-pricing/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-pricing/kaigilb-gilbwebsitecode-pricing-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-pricing/kaigilb-gilbwebsitecode-pricing-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-pricing'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/pricing`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-pricing'] },
```

Then:

```vue
<script setup lang="ts">
import { Pricing, type Plan } from '@kaigilb/gilbwebsitecode-pricing'
const NuxtLink = resolveComponent('NuxtLink')
const plans: Plan[] = [
  { name: 'Starter', price: '$0', period: 'mo', features: ['1 site'], ctaLabel: 'Choose' },
  { name: 'Growth', price: '$29', period: 'mo', features: ['Everything in Starter'], ctaLabel: 'Choose', featured: true },
]
</script>

<template>
  <Pricing heading="Pricing" :plans="plans" :link-component="NuxtLink" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `heading?` | the section's `<h2>` |
| `plans` | `{ name, price, period?, features, ctaLabel?, ctaTo?, featured? }[]`; `price` is shown as written; names are the list's keys, so keep them distinct |
| `linkComponent?` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>` |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text
- `--site-block-muted` secondary text and borders
- `--site-block-accent` the accent (links, buttons, bands)
- `--site-block-on-accent` text on the accent
- `--site-block-radius` button and field corners (default `0.375rem`)
- `--site-block-radius-lg` card and picture corners (default `0.5rem`)
- `--site-block-motion` the hover transition (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

n/a: every column is text in the server's HTML, and nothing loads later. Columns in one row stretch to the tallest, with the buttons at the foot.

## Do not

- Do not mark more than one plan `featured`; the mark is for the one you recommend.
- Do not list a plan the site does not sell (Rule_Code_gilb-app-nav-truth: no unbuilt destination).

## Source

The website starter's `components/catalog/Pricing.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes, colours and breakpoints, the route link passed in, and the button's hover fade turned off under reduced motion.
