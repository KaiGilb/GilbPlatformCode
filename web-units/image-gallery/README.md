# web image-gallery

A set of pictures as a grid of equal tiles, each with its own text alternative and loaded lazily. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/ImageGallery.vue` (website-engine-a 80ad391).

## What this is

`<ImageGallery :heading :images>` draws a `<section>` with an optional `<h2>` and one picture per image, 10 rem high and cropped to fill its tile, loaded lazily. Two columns on a phone, three from 768 px, four from 1024 px. Static: it needs no script in the browser.

## What this is not

- Not a lightbox or a slideshow: a tile does not open.
- Not one large picture: take `web-units/hero` or the page's own image.

## How to take it

Package: `@kaigilb/gilbwebsitecode-image-gallery`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-image-gallery
cd web-units/image-gallery && npm pack --pack-destination <site>/vendor/gilbwebsitecode-image-gallery
echo <commit> > <site>/vendor/gilbwebsitecode-image-gallery/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-image-gallery/kaigilb-gilbwebsitecode-image-gallery-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-image-gallery/kaigilb-gilbwebsitecode-image-gallery-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-image-gallery'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/image-gallery`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-image-gallery'] },
```

Then:

```vue
<script setup lang="ts">
import { ImageGallery, type GalleryImage } from '@kaigilb/gilbwebsitecode-image-gallery'
const NuxtImg = resolveComponent('NuxtImg')
const images: GalleryImage[] = [{ src: '/kitchen.jpg', alt: 'The finished kitchen' }]
</script>

<template>
  <ImageGallery heading="Our work" :images="images" :image-component="NuxtImg" :image-props="{ format: 'avif,webp' }" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `heading?` | the section's `<h2>` |
| `images` | `{ src, alt }[]`; `src` is the list's key, so keep it distinct; `alt` says what the picture shows |
| `imageComponent?` | the component that draws each picture, given `src` and `alt`; default `<img>` |
| `imageProps?` | extra attributes for every picture, for example `{ format: 'avif,webp' }` |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text
- `--site-block-radius` button and field corners (default `0.375rem`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

Every tile is 10 rem high before its picture loads, so the grid does not move when the pictures arrive.

## Do not

- Do not leave `alt` empty for a picture that carries meaning.
- Do not use it for many hundreds of pictures on one page; it draws them all.

## Source

The website starter's `components/catalog/ImageGallery.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes and breakpoints, and the image component passed in.
