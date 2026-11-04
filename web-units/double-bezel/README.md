# web double-bezel

A two-shell frame for a picture, a screenshot or a device frame: a tinted outer shell with a hairline ring, and an inner window with a top highlight. Vue 3 / Nuxt 3. Moved from KaiGilb/myjackfruit-web `components/landing/DoubleBezel.vue` at `9dc8c8d3d12c6e6327e77484fe45753011669d99`.

## What this is

A double-bezel frame for a website picture: a tinted outer shell with a hairline ring around an inner window with a soft top highlight, so a screenshot reads as mounted. Static paint, server-rendered, the same with no script; the slot carries the picture (an `<img>`, a `device-frame`, any visual); a `device-frame` browser frame inside drops its own corner, border and shadow, because the bezel is its mount.

## What this is not

- Not a device frame (see `device-frame`).
- Not a card with text.
- No motion.

## How to take it

Package: `@kaigilb/gilbwebsitecode-double-bezel`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-double-bezel
cd web-units/double-bezel && npm pack --pack-destination <site>/vendor/gilbwebsitecode-double-bezel
echo <commit> > <site>/vendor/gilbwebsitecode-double-bezel/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-double-bezel/kaigilb-gilbwebsitecode-double-bezel-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-double-bezel/kaigilb-gilbwebsitecode-double-bezel-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-double-bezel'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/double-bezel`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-double-bezel'] },
```

A tinted mount around a picture, and a dark mount around a `device-frame`:

```vue
<script setup lang="ts">
import { DoubleBezel } from '@kaigilb/gilbwebsitecode-double-bezel'
import { DeviceFrame } from '@kaigilb/gilbwebsitecode-device-frame'
</script>

<template>
  <DoubleBezel tint="#e5d0b1">
    <img src="/shots/home.png" width="1440" height="900" alt="The home page">
  </DoubleBezel>
  <DoubleBezel on-dark>
    <DeviceFrame image="/shots/home.png" alt="The home page" domain="example.test" />
  </DoubleBezel>
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `tint?` | Any CSS colour laid over the outer shell at `tintAlpha`. Empty (the default) for none. |
| `tintAlpha?` | 0 to 1, default `0.16`. With `onDark` the tint is a fixed 10 %, as in the source, and `tintAlpha` has no effect. |
| `onDark?` | Lines and highlight for a dark section. Default `false`. |
| default slot | The picture: an `<img>`, a `device-frame`, or any visual. |

## Host must supply

`--site-block-bg` (the shell and window faces, mixed with white), `--site-block-fg` (the hairlines and the dark faces), and optionally `--site-block-shadow-lg` (fallback the source's `0 16px 40px -8px rgb(28 28 20 / 0.12)`).

No Tailwind is needed: the styles ship in the component, scoped to it.

## Layout stability

The frame adds a fixed 0.375rem + 1px around the slot; it has no size of its own. Give the picture inside `width` and `height` (or an aspect ratio), so nothing moves when it loads.

## Do not

- Do not put a second bezel inside.
- Do not give the inner picture its own corner (the window clips it).
- Do not set `tintAlpha` above about 0.3: it hides the hairline.

## Wrong readings

- `tint` is any CSS colour, default none (`transparent`); the source took a name from its own palette (validated), default `pith` (`#e5d0b1`).
- The site's `--brand-bg` and `--brand-fg` RGB channels are the library's `--site-block-bg` and `--site-block-fg` colours; `rgb(x / a)` is written `color-mix(in srgb, x a%, transparent)`, the same colour.
- `theme('boxShadow.lg')` is `var(--site-block-shadow-lg, 0 16px 40px -8px rgb(28 28 20 / 0.12))`, the source's token as the fallback.
- The inner frame it neutralises is the library `device-frame` browser frame (`.df-browser`), not the site's `.mj-frame`.
- Classes are `bz`, `bz-core` and `bz--dark` (the source: `mj-bezel`, `mj-bezel-core`, `is-dark`); props are declared inline with `withDefaults`.

## Source

`KaiGilb/myjackfruit-web`, `components/landing/DoubleBezel.vue`, commit `9dc8c8d3d12c6e6327e77484fe45753011669d99`. `brand.shadow.lg` in `design-tokens.json` at the same commit is `0 16px 40px -8px rgb(28 28 20 / 0.12)`. The unit's tests are new.
