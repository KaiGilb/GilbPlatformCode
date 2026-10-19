# web cta-section

A full-width band in the site's accent colour, with one heading, an optional line and one link to the step the site wants the visitor to take next. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/CTASection.vue` (website-engine-a 80ad391).

## What this is

`<CtaSection :title :subtitle :cta-label :cta-to>` draws a `<section>` filled with the accent, centred: the title as an `<h2>` in the on-accent colour, the line when given, and one link drawn as a light button, to `ctaTo` (default `/contact`). Static: it needs no script in the browser.

One change from the starter's band: the line under the heading is the full on-accent colour. The starter drew it in white at 85 %, which is 4.2:1 on its `#2563eb` accent (computed from the sRGB mix, and checked in the unit's test), under WCAG AA's 4.5:1 for normal text.

## What this is not

- Not the hero that opens the page: take `web-units/hero`.
- Not a form: the link goes to the page that has one.

## How to take it

Package: `@kaigilb/gilbwebsitecode-cta-section`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-cta-section
cd web-units/cta-section && npm pack --pack-destination <site>/vendor/gilbwebsitecode-cta-section
echo <commit> > <site>/vendor/gilbwebsitecode-cta-section/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-cta-section/kaigilb-gilbwebsitecode-cta-section-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-cta-section/kaigilb-gilbwebsitecode-cta-section-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-cta-section'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/cta-section`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-cta-section'] },
```

Then:

```vue
<script setup lang="ts">
import { CtaSection } from '@kaigilb/gilbwebsitecode-cta-section'
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <CtaSection title="Ready to start?" subtitle="One call, no obligation." cta-label="Contact us" :link-component="NuxtLink" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `title` | the band's `<h2>` |
| `subtitle?` | the line under it |
| `ctaLabel` | the link's words |
| `ctaTo?` | the link's route, default `/contact` |
| `linkComponent?` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>` |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-accent` the accent (links, buttons, bands)
- `--site-block-on-accent` text on the accent
- `--site-block-on-accent-soft` the line under the heading (default the on-accent colour; keep it at 4.5:1 or more on the accent)
- `--site-block-radius` button and field corners (default `0.375rem`)
- `--site-block-motion` the hover transition (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

n/a: the band is text in the server's HTML, and nothing loads later.

## Do not

- Do not give it a second link; it is one ask.
- Do not pick an accent on which the on-accent colour falls under 4.5:1.

## Source

The website starter's `components/catalog/CTASection.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes and colours except the line's (above), the route link passed in, and the link's hover fade turned off under reduced motion.
