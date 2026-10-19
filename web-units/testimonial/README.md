# web testimonial

One quoted statement by a named person, with the person's name, an optional role and an optional small round picture beside the name. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/Testimonial.vue` (website-engine-a 80ad391).

## What this is

`<Testimonial :quote :author :role :avatar>` draws a centred `<section>`: the quote in a `<blockquote>` between curly quotes, then the picture (40 × 40, its text alternative the author's name), the name and the role. Static: it needs no script in the browser.

## What this is not

- Not a star rating or a review list.
- Not a carousel of many quotes: place several, one after another.

## How to take it

Package: `@kaigilb/gilbwebsitecode-testimonial`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-testimonial
cd web-units/testimonial && npm pack --pack-destination <site>/vendor/gilbwebsitecode-testimonial
echo <commit> > <site>/vendor/gilbwebsitecode-testimonial/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-testimonial/kaigilb-gilbwebsitecode-testimonial-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-testimonial/kaigilb-gilbwebsitecode-testimonial-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-testimonial'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/testimonial`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-testimonial'] },
```

Then:

```vue
<script setup lang="ts">
import { Testimonial } from '@kaigilb/gilbwebsitecode-testimonial'
const NuxtImg = resolveComponent('NuxtImg')
</script>

<template>
  <Testimonial quote="They had our site live in a week." author="Ana Silva" role="Founder"
    avatar="/ana.jpg" :image-component="NuxtImg" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `quote` | the statement, without quote marks |
| `author` | who said it; also the picture's text alternative |
| `role?` | their role, under the name |
| `avatar?` | the picture's address |
| `imageComponent?` | the component that draws the picture, given `src` and `alt`; default `<img>` |
| `imageProps?` | extra attributes for the picture |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text
- `--site-block-muted` secondary text and borders

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

The picture is always 40 × 40 (its `width` and `height` are set), so it takes its space before it loads. Everything else is text in the server's HTML.

## Do not

- Do not quote someone who has not agreed to it.
- Do not put the quote marks in `quote`; the unit draws them.

## Source

The website starter's `components/catalog/Testimonial.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes, colours and breakpoints, and the image component passed in.
