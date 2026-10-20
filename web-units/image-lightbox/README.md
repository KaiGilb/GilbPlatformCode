# web image-lightbox

A full-screen picture viewer: click a picture and it opens over the page; one picture, every picture in an article, or a Nuxt Content `ProseImg`. Vue 3 / Nuxt 3. A fresh unit, written after the Skalden blog's `components/LightboxImage.vue` (see "Source").

## What this is

Three ways in, one viewer:

- `<ImageLightbox src alt>` is one picture. It draws the picture as your own image component would (all other attributes reach it) and opens it on a click, or on Enter or Space.
- `<LightboxScope>` wraps an article, or any rendered content. A click on **any** picture inside opens it, with no change to the pictures. All the pictures that open form one set.
- `<ProseImg>` is a drop-in for Nuxt Content's `ProseImg`, so every picture written in Markdown opens (inside a scope, as part of the set).

The viewer is a modal dialog: the page behind is inert and does not scroll, Tab stays inside, Escape closes it from anywhere (also after a click on the picture), focus returns to the picture, arrow keys and buttons move through a set with a "3 of 12" counter, + - 0 zoom, the picture's alt text or figcaption shows under it, a swipe moves between pictures or (down) closes, two fingers pinch, a double tap or double click zooms, and a zoomed picture is dragged. Every gesture has a button or a key. Before the script runs, and if it never does, the pictures are ordinary pictures: the server's HTML has no button role and no tab stop.

## What this is not

- Not a gallery: `image-gallery` draws a grid of tiles and promises "no script"; this opens pictures. Wrap an `image-gallery` in a `LightboxScope` if you want its tiles to open; `image-gallery` is unchanged.
- Not a carousel or slideshow: nothing advances by itself.
- Not an image optimiser: the viewer shows the file you name (`fullSrc`, `data-full`, else the picture's own file) in a plain `img`; it never asks an image service for a size.
- Not a video or embed player.

## How to take it

Package: `@kaigilb/gilbwebsitecode-image-lightbox`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-image-lightbox
cd web-units/image-lightbox && npm pack --pack-destination <site>/vendor/gilbwebsitecode-image-lightbox
echo <commit> > <site>/vendor/gilbwebsitecode-image-lightbox/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-image-lightbox/kaigilb-gilbwebsitecode-image-lightbox-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-image-lightbox/kaigilb-gilbwebsitecode-image-lightbox-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-image-lightbox'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/image-lightbox`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-image-lightbox'] },
```

Then one picture:

```vue
<script setup lang="ts">
import { NuxtImg } from '#components'
import { ImageLightbox } from '@kaigilb/gilbwebsitecode-image-lightbox'
</script>

<template>
  <ImageLightbox src="/blog/hero.jpg" alt="A jackfruit tree in July" :width="1360" :height="768"
    :image-component="NuxtImg" loading="eager" fetchpriority="high" class="rounded-lg" />
</template>
```

Every picture in an article (the pictures stay as they are; the author can still opt one out with `data-no-lightbox`):

```vue
<script setup lang="ts">
import { LightboxScope } from '@kaigilb/gilbwebsitecode-image-lightbox'
</script>

<template>
  <LightboxScope><ContentRenderer :value="post" /></LightboxScope>
</template>
```

Pictures written in Markdown (Nuxt Content): add `components/content/ProseImg.vue` to the site. It replaces the default `ProseImg`; inside a `LightboxScope` the picture is the plain picture and the scope opens it, with `data-full` set to the Markdown path.

```vue
<script setup lang="ts">
import { ProseImg } from '@kaigilb/gilbwebsitecode-image-lightbox'
</script>

<template>
  <ProseImg v-bind="$attrs" />
</template>
```

To opt a Markdown picture out: `![alt](/a.jpg){data-no-lightbox="true"}`.

Browser proof (not part of `npm test`): `scripts/check-lightbox-browser.mjs` drives the unit in real browsers. From this folder, after `npm ci`: `npm i --no-save playwright@1.60`, then `PLAYWRIGHT_BROWSERS_PATH=<browsers folder> BROWSERS=chromium,firefox,webkit node scripts/check-lightbox-browser.mjs`. Exit 0 means every check passed in every browser that ran.

## What you pass

| Component | Prop | Meaning |
|---|---|---|
| `ImageLightbox` | `src`, `alt` | the picture and what it shows. **No alt text means no viewer**: the picture is decoration and stays plain |
| | `width?`, `height?` | the picture's pixel size, passed on to it |
| | `fullSrc?` | a larger original for the viewer; the picture's own `src` when not given |
| | `caption?` | the text under the picture in the viewer; the alt text when not given |
| | `imageComponent?` | your image component (for example Nuxt's); a plain `img` when not given |
| | `disabled?` | keep it a plain picture |
| | other attributes | class, style, loading, fetchpriority, sizes, id ... reach the picture |
| `LightboxScope` | default slot | the content whose pictures should open |
| `ProseImg` | `src`, `alt`, `width?`, `height?`, `imageComponent?` | as Nuxt Content passes them |
| all three | `words?` | any of `dialog`, `close`, `previous`, `next`, `zoomIn`, `zoomOut`, `zoomReset`, `fit`, `count(position, total)`, `loading`, `loadFailed`: English by default; pass your language. `zoomReset` (the button's name) must contain `fit` (the word drawn on it) |
| | `showCaption?` | show the text under the picture (default true) |
| | `maxZoom?` | the largest zoom, as a multiple of the fit-to-screen size (default 4) |

Which pictures open in a scope: those with alt text, not inside a link, drawn at least 24 px on each side, and with no `data-no-lightbox` on them or a parent. A `<figure>`'s `<figcaption>` is shown under its picture. `data-full="/big.jpg"` on a picture names the larger file to show.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the `--site-block-*` set; this unit reads these:

- `--site-block-overlay` the dark behind the picture (default black, 94 % opaque)
- `--site-block-on-overlay` the text and buttons over it (default white)
- `--site-block-accent` the focus ring (default amber)
- `--site-block-radius` the buttons' corner (default `0.5rem`)
- `--site-block-motion` the fade and zoom glide time (default `150ms`)
- `--site-block-z-overlay` the viewer's stacking level (default `1000`)

No Tailwind is needed: the styles ship in the components, scoped to them. The viewer is moved to the end of `<body>` while it is open, so it is not clipped by the page's columns or stacking. Pictures are not restyled (a scope only adds a zoom cursor to the pictures that open); the host keeps its own picture styles.

## Layout stability

n/a for the picture: the unit adds no box (a scope is `display: contents`), changes no size and adds nothing to the picture before the script runs; give `width` and `height` as you would without it. The viewer is `position: fixed`, out of flow, so opening it moves nothing; the page behind is held at its scroll position (the body is fixed there), with the scrollbar's width kept so the page does not shift.

## Do not

- Do not wrap a picture whose attributes you must keep exactly (the page's largest picture) in anything but `ImageLightbox`: it forwards every attribute (class, style, loading, fetchpriority, sizes).
- Do not point `fullSrc` or `data-full` at an image-service address that a static build never made: the viewer shows the file you name.
- Do not put the viewer's words only in English on a site in another language: pass `words`.
- Do not rely on the gestures alone: every one has a key and a button; keep them.
- Do not expect a picture drawn smaller than 24 px to open: it stays a plain picture (a button that small fails WCAG 2.2 target size, 2.5.8). Draw it larger or leave it plain.
- Do not add `data-no-lightbox` to hide a picture a visitor needs to see larger.

## Wrong readings

- **Escape after a click.** The Skalden viewer's Escape listens on its backdrop, which cannot take focus; after a click on the picture, focus falls to the page and Escape does nothing (measured in Chromium, Firefox and WebKit on 2026-10-20). This unit listens on the document while the viewer is open, so Escape works wherever focus is.
- **Safari and Tab.** Safari's default skips buttons when you press Tab. The unit moves Tab by hand inside the dialog, so the trap is the same in every browser (checked in WebKit).
- **A picture in a link does not open.** The link keeps its job. To open it, take it out of the link or use `ImageLightbox` without the link.
- **A picture with empty alt text does not open**, by design: it is decoration.
- **The set is the pictures that open, in page order.** A picture added later (the content changed) joins it, and the scope follows changes to `alt`, `data-no-lightbox`, `src`, `width`, `height`, `class` and `style` on any picture or parent: remove an alt text and the picture stops being a button; add it back and it is one again. A picture with no layout yet (not loaded, hidden) is not counted as small; it is checked again when it loads or changes size. A very small picture that is drawn larger later becomes a button then.
- **A slow or missing original.** While the file named by `data-full` / `fullSrc` loads, the viewer shows a "Loading picture" cue (a status, the figure is `aria-busy`). If it fails, the viewer shows the page's own picture with its alt text; if that fails too it says "The picture could not be loaded". Close, Escape and the arrow keys work throughout. Words: `loading`, `loadFailed`.
- **The viewer shows `data-full`, else the picture's current file** (`currentSrc`, the variant the browser chose from a `srcset`).
- **The starter remounts its page once.** In the website starter (with delayed hydration) the whole page is mounted twice about 40 ms apart; a click in those 40 ms is lost. Not a fault of the unit; a visitor cannot click that fast.
- **Pinch and swipe were proven on real touch events in Chromium and on touch pointer events sent from the page in Chromium, Firefox and WebKit.** Not on a phone: Safari on iOS and Chrome on Android are unproven.
- **Page pinch-zoom still works** outside the viewer: only the viewer's stage takes touches (`touch-action: none`).

## Source

Provenance, a one-time exception ("not a precedent"): Kai allowed, in his own word on 2026-10-20, taking code from the Skalden site's branch `ws7-website-fork` at commit `d8a416328d69c404f44082453a2ed000eebe18e3` (KaiGilb/skalden-web), which the site's owner has not merged to a main branch (the site has no `main`; production is built from this branch), for this one run. The library rule `RuleGwcunitShareTest` part 1 and the process entry `ProcSwcEnSource` say shared code is on the site's main; parts 2 and 3 and the Agent.Tester PASS still hold. Steps that could not be done for that reason are listed in the run's record (STATE-AgentCoder.md in 7.Project/Active/GilbPlatformCode/04Other/2026-10-20-SkaldenUnits-instruments/). A later version of this unit is taken from the site's main once the branch is merged.

Code origin: `KaiGilb/skalden-web`, branch `ws7-website-fork` at `d8a416328d69c404f44082453a2ed000eebe18e3`, `components/LightboxImage.vue`. A fresh build that borrows from it only: the picture is rendered with all its attributes kept (for the largest-contentful-paint picture), a plain `img` in the viewer for the original file, close button below the notch, restore of focus, a fade that is off under reduced motion. Everything else is new: the focus trap, inert background, Escape from anywhere, sets with arrow keys and a counter, swipe, pinch, double tap, zoom keys, alt text and figcaption under the picture, `LightboxScope`, `ProseImg`. All tests are new.
