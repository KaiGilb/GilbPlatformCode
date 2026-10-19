# web blog-post-card

One post of a site's blog in a list: a bordered card that is a link to the post, with an optional cover picture, an optional date, the title and an optional excerpt. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/BlogPostCard.vue` (website-engine-a 80ad391).

## What this is

`<BlogPostCard :title :to :excerpt :date :image>` draws one link (the whole card) with: the cover, 10 rem high and cropped to fill, loaded lazily, its text alternative the title; the date, small; the title as an `<h3>` in the accent; the excerpt. On hover the border turns the accent and the title is underlined. It does not lay out a list: place cards in the page's own grid. Static: it needs no script in the browser.

## What this is not

- Not the post page itself.
- Not a list or a grid of posts: the page lays the cards out.

## How to take it

Package: `@kaigilb/gilbwebsitecode-blog-post-card`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-blog-post-card
cd web-units/blog-post-card && npm pack --pack-destination <site>/vendor/gilbwebsitecode-blog-post-card
echo <commit> > <site>/vendor/gilbwebsitecode-blog-post-card/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-blog-post-card/kaigilb-gilbwebsitecode-blog-post-card-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-blog-post-card/kaigilb-gilbwebsitecode-blog-post-card-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-blog-post-card'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/blog-post-card`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-blog-post-card'] },
```

Then:

```vue
<script setup lang="ts">
import { BlogPostCard } from '@kaigilb/gilbwebsitecode-blog-post-card'
const NuxtLink = resolveComponent('NuxtLink')
const NuxtImg = resolveComponent('NuxtImg')
</script>

<template>
  <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <BlogPostCard title="A sample post" excerpt="Short excerpt here." date="2026-05-28" to="/blog/hello-world"
      :link-component="NuxtLink" :image-component="NuxtImg" :image-props="{ format: 'avif,webp' }" />
  </div>
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `title` | the post's title; also the cover's text alternative |
| `to` | the post's route |
| `excerpt?` | a line or two about the post |
| `date?` | any date string `Date` reads, such as `2026-05-28` |
| `image?` | the cover's address |
| `formatDate?` | how the date is written; default `new Date(date).toLocaleDateString()` |
| `linkComponent?` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>` |
| `imageComponent?` | the component that draws the cover, given `src` and `alt`; default `<img>` |
| `imageProps?` | extra attributes for the cover |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-muted` secondary text and borders
- `--site-block-accent` the accent (links, buttons, bands)
- `--site-block-radius-lg` card and picture corners (default `0.5rem`)
- `--site-block-motion` the hover transition (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

The cover's box is 10 rem high before the picture loads, so the card does not grow when it arrives. Gotcha: the default date is written in the locale of whatever renders it, so a prerendered page and the visitor's browser can write it differently; pass `formatDate` with a fixed locale where that matters.

## Do not

- Do not put another link or a button inside the card: the whole card is one link.
- Do not link a post that is not published (Rule_Code_gilb-app-nav-truth: no unbuilt destination).

## Source

The website starter's `components/catalog/BlogPostCard.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes and colours, the route link and image component passed in, `formatDate` added with the starter's own default, and the hover transition turned off under reduced motion.
