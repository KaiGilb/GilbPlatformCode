# web parallax-layer

A parallax plane: its content drifts at a small rate against the scroll, on requestAnimationFrame, static with reduced motion. Vue 3 / Nuxt 3. Moved from KaiGilb/myjackfruit-web `components/motion/ParallaxLayer.vue` at `9dc8c8d3d12c6e6327e77484fe45753011669d99`.

## What this is

A parallax plane for a website section: its content drifts at a slightly different rate from the scroll, so the page reads with quiet depth. With no script and with reduced motion the content sits in place, static, as server-rendered; with a script it moves on the first frame to its offset for the current scroll (a mid-page reload does not wait for a scroll), then follows the scroll; each layer adds one passive scroll and one passive resize listener (removed on unmount) and does its work in `requestAnimationFrame`, at most once a frame.

## What this is not

- Not a scroll-linked fade or reveal (see `scroll-frame`).
- Not a sticky or pinned section (see `sticky-card-deck`).
- Not for content a reader must read when it is decorative.

## How to take it

Package: `@kaigilb/gilbwebsitecode-parallax-layer`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-parallax-layer
cd web-units/parallax-layer && npm pack --pack-destination <site>/vendor/gilbwebsitecode-parallax-layer
echo <commit> > <site>/vendor/gilbwebsitecode-parallax-layer/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-parallax-layer/kaigilb-gilbwebsitecode-parallax-layer-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-parallax-layer/kaigilb-gilbwebsitecode-parallax-layer-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-parallax-layer'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/parallax-layer`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-parallax-layer'] },
```

A section with `overflow: hidden` holds a decorative plane and a foreground plane whose text a reader must read:

```vue
<script setup lang="ts">
import { ParallaxLayer } from '@kaigilb/gilbwebsitecode-parallax-layer'
</script>

<template>
  <section style="overflow: hidden">
    <ParallaxLayer :rate="0.12" inner-class="...">
      <img … />
    </ParallaxLayer>
    <ParallaxLayer :decorative="false" :rate="0.05">
      <p>Text a reader must read.</p>
    </ParallaxLayer>
  </section>
</template>
```

## What you pass

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `rate` | `number` | `0.12` | positive lags the scroll (reads deeper), negative leads it; keep to 0.05–0.2 |
| `decorative` | `boolean` | `true` | the plane is inert and `aria-hidden`. Pass `false` only when the slot is real content |
| `tag` | `string` | `"div"` | the outer element |
| `innerClass` | `string` | `""` | classes for the moving element: layout that must ride the transform (a height chain, flex alignment) goes here, not on the outer |

The package also exports `useScrollFrame`, the library `scroll-frame` unit's frame bus (the same file), for a host that already imports this unit; a host that needs only the bus takes `scroll-frame`.

## Host must supply

No `--site-block-*` variable. A parent that clips overflow (`overflow: hidden`), so the offset never leaves the section.

No Tailwind is needed: the inert class ships in the component, scoped to it.

## Layout stability

The outer box keeps the content's size; only the inner element is transformed, and a transform moves nothing around it. On the first frame the inner element moves from 0 to its offset (the distance of the layer's centre from the viewport's centre, times `rate`; for a layer far from the centre, or a tall one, that can be more than half the viewport times `rate`); in a clipped parent nothing else moves.

## Do not

- Do not put content a reader needs in a decorative layer (it is `aria-hidden`).
- Do not use rates above 0.2.
- Do not set a transform on the inner element yourself (the component owns it).

## Wrong readings

- `useScrollFrame` is inlined as `src/useScrollFrame.ts`, the library `scroll-frame` unit's file, in place of the site's auto-imported `~/composables/useScrollFrame`; it behaves the same for `subscribe` and `reduced`, and has no `request()`, which this component never called.
- The Tailwind class `pointer-events-none` on a decorative layer is the scoped class `pl-inert`.
- Props are declared inline with `withDefaults` (same names and defaults); the source used runtime `defineProps({ … })`.

## Source

`KaiGilb/myjackfruit-web`, `components/motion/ParallaxLayer.vue` and `composables/useScrollFrame.ts`, commit `9dc8c8d3d12c6e6327e77484fe45753011669d99`. The bus file is the library's `scroll-frame` copy. Tests are new.
