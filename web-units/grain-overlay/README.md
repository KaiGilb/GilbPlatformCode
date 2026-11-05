# web grain-overlay

A fixed film-grain texture over the whole page: one inert element at 3 % opacity. Vue 3 / Nuxt 3. Moved from a production site; see Source.

## What this is

A film-grain texture for a website: one fixed, inert element that lays a faint paper grain over the whole page. It is static paint, server-rendered, and works the same with no script. It is hidden from assistive tech. It makes no network request and ships no asset: the tile is an inline SVG of about 0.3 KB.

## What this is not

- Not an animated noise.
- Not a filter on a scrolling container (that would repaint on every scroll).
- Not a background for one section.

## How to take it

Package: `@kaigilb/gilbwebsitecode-grain-overlay`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-grain-overlay
cd web-units/grain-overlay && npm pack --pack-destination <site>/vendor/gilbwebsitecode-grain-overlay
echo <commit> > <site>/vendor/gilbwebsitecode-grain-overlay/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-grain-overlay/kaigilb-gilbwebsitecode-grain-overlay-0.1.1.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-grain-overlay/kaigilb-gilbwebsitecode-grain-overlay-0.1.1.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-grain-overlay'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/grain-overlay`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-grain-overlay'] },
```

Place it once, in the site's layout:

```vue
<script setup lang="ts">
import { GrainOverlay } from '@kaigilb/gilbwebsitecode-grain-overlay'
</script>

<template>
  <GrainOverlay />
</template>
```

The default plane is 30. To set it: `<GrainOverlay :z-index="30" />`.

## What you pass

| Prop | Meaning |
|---|---|
| `zIndex?` | stacking order (number, default `30`). Above page content, below a menu overlay and the header |

## Host must supply

No `--site-block-*` variable. The tile does not read the theme.

The host chooses `zIndex` from its own stacking order. The source puts grain at 30, above page content (0–2), below the menu overlay (40) and the header (50).

No Tailwind is needed: the styles ship in the component, scoped to it.

## Layout stability

The element is fixed and out of the flow, so it takes no space and moves nothing. It is in the first HTML.

## Do not

- Do not put it inside a scrolling container or a transformed parent (`position: fixed` then becomes relative to that parent).
- Do not raise its opacity to make a "texture": 3 % is the source's.
- Do not give it pointer events.

## Wrong readings

- The `zIndex` prop (default 30) replaces `Z_PLANES.grain` from the site's `~/utils/zPlanes`. The source imported that constant. This unit does not. Leave `zIndex` unset for 30, or pass your own plane.
- The source's Tailwind classes (`pointer-events-none fixed inset-0`) and its inline opacity and repeat are written as scoped CSS; only `z-index` and the texture stay inline.

## Source

`KaiGilb/myjackfruit-web`, `components/GrainOverlay.vue`, commit `9dc8c8d3d12c6e6327e77484fe45753011669d99`. The z value is `grain: 30` in `utils/zPlanes.ts` at the same commit: above page content (0–2), below the menu overlay (40) and the header (50). Written out without the site import and without Tailwind. The unit's tests are new.
