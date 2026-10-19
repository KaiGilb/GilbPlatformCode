# web hero

The hero section that opens a web page: the headline in large type, an optional line under it, an optional picture beside it and an optional button to the page's one main next step. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/Hero.vue` (Engine A, `website-engine-a` at 80ad391).

## What this is

`<Hero :title :subtitle :cta-label :cta-to :image :image-alt>` draws a `<section>` on a 5 % accent tint:

- the title as the page's `<h1>`, 2.25 rem, 3 rem from 640 px;
- the line under it, when given;
- the button, when `ctaLabel` is given, linking to `ctaTo` (default `/contact`);
- the picture, when `image` is given, loaded eagerly (it is near the top of the page), its text alternative `imageAlt` or else the title. From 1024 px the text and the picture sit side by side; without a picture the text is centred.

It needs no script in the browser.

## What this is not

- Not the page's call-to-action band further down: take `web-units/cta-section`.
- Not the site's header or menu: take `web-units/section-menu`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-hero`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-hero
cd web-units/hero && npm pack --pack-destination <site>/vendor/gilbwebsitecode-hero
echo <commit> > <site>/vendor/gilbwebsitecode-hero/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-hero/kaigilb-gilbwebsitecode-hero-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-hero/kaigilb-gilbwebsitecode-hero-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-hero'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/hero`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-hero'] },
```

Then:

```vue
<script setup lang="ts">
import { Hero } from '@kaigilb/gilbwebsitecode-hero'
const NuxtLink = resolveComponent('NuxtLink')
const NuxtImg = resolveComponent('NuxtImg')
</script>

<template>
  <Hero title="Leaks fixed today" subtitle="Same day, all of Oslo." cta-label="Book a visit" cta-to="/book"
    image="/van.jpg" image-alt="Our van" :link-component="NuxtLink" :image-component="NuxtImg"
    :image-props="{ format: 'avif,webp' }" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `title` | the headline |
| `subtitle?` | the line under it |
| `ctaLabel?` | the button's words; no label, no button |
| `ctaTo?` | the button's route, default `/contact` |
| `image?`, `imageAlt?` | the picture and its text alternative (default the title) |
| `linkComponent?` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>` |
| `imageComponent?` | the component that draws the picture, given `src` and `alt` (Nuxt: `resolveComponent('NuxtImg')`); default `<img>` |
| `imageProps?` | extra attributes for the picture, for example `{ format: 'avif,webp' }` or `{ width: 1200, height: 800 }` |

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

The text has no late parts. The picture is drawn at full column width with its height from the file, so until it loads it takes no height and the page moves when it arrives. Pass its size in `imageProps` (`{ width, height }`) so the browser reserves the space. The starter's gallery page shows the hero without a picture.

## Do not

- Do not use a second `<h1>` on the same page: the title is the page's heading.
- Do not put the menu or the logo in it; the site's header keeps them.

## Source

The website starter's `components/catalog/Hero.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes, colours and breakpoints, the route link and image component passed in, and the button's hover fade turned off under reduced motion.
