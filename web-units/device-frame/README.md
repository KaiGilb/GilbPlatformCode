# web device-frame

A browser-window frame or a phone frame around a real screenshot, optionally a link. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (Jairam-Gilb/gilb-websites-web, `components/scrollcraft/BrowserFrame.vue`, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<DeviceFrame :image :alt :domain>` draws a Mac-style window (three dots and an address pill) over the picture, or with `device="iphone"` a phone bezel with a locked 390 by 844 screen and an island or a plain top. With `url` the whole frame is a link that opens in a new tab and lifts a little on hover. It needs no script.

## What this is not

- Not an image component: it does not resize, convert or crop a picture (no `@nuxt/image`). Give it the file you want served.
- Not a mock-up of a page made from boxes: the picture is the proof, so it must be a real capture.
- Not a carousel or a lightbox: one frame, one picture.

## How to take it

Package: `@kaigilb/gilbwebsitecode-device-frame`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-device-frame
cd web-units/device-frame && npm pack --pack-destination <site>/vendor/gilbwebsitecode-device-frame
echo <commit> > <site>/vendor/gilbwebsitecode-device-frame/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-device-frame/kaigilb-gilbwebsitecode-device-frame-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-device-frame/kaigilb-gilbwebsitecode-device-frame-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-device-frame'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/device-frame`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-device-frame'] },
```

Then:

```vue
<script setup lang="ts">
import { DeviceFrame } from '@kaigilb/gilbwebsitecode-device-frame'
</script>

<template>
  <DeviceFrame image="/shots/home.png" alt="The Example studio's home page" domain="example.test" url="https://example.test/" />
  <DeviceFrame device="iphone" image="/shots/app.png" alt="The Example app's home screen" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `image`, `alt` | the capture and what it shows, in words (RuleA11yAltText). The alt is all a screen reader gets for the picture; the bar and the island are hidden from it |
| `domain?` | text in the address pill (browser frame only) |
| `imagePhone?` | a smaller copy of `image` for screens under 640 px (browser frame only) |
| `url?` | makes the whole frame a link (`target="_blank"`, `rel="noopener"`) |
| `eager?` | load the picture at once; the default is lazy. Use it for the first picture on the page only |
| `device?` | `browser` (default) or `iphone` |
| `chrome?` | `island` (default: an island on a status bar, the picture starts below it) or `bezel` (a plain rounded phone). Phone only |
| `imageWidth?`, `imageHeight?` | the browser capture's own pixel size. Give both so the frame holds its final size before the picture loads |
| `phoneWidth?`, `phoneHeight?` | the phone capture's own pixel size (default 780 by 1688) |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` the bar's tint, the dots and the pill (a few percent of it)
- `--site-block-muted` the address pill's text
- `--site-block-bg` the base under the browser picture (default white)
- `--site-block-motion` the hover lift's time (default `150ms`)

The phone's hardware colours have their own optional variables and fallbacks: `--site-block-device-body` (#1c1c1e), `-edge` (#0b0b0c), `-button` (#2a2a2c), `-screen` (#f6f1e8, behind the picture), `-statusbar` (#e8e6e2), `-island` (#000), `-rim`, `-shadow`, and `--site-block-device-lift` (#ffffff, mixed into the browser base).

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The phone's screen is a locked 390 by 844 box, so it holds its size whatever the picture. The browser frame sizes to the picture: give `imageWidth` and `imageHeight` (the picture's own pixels) and the frame reserves its final height before the picture loads; without them the page can move when it loads.

## Do not

- Do not use a picture that is not a real capture of the thing the alt text names.
- Do not put text that matters only in the picture; say it in the alt text or the page.
- Do not mark every frame `eager`; only the first picture, or it competes with the page's main content for bandwidth.

## Wrong readings

- `imagePhone` is not a phone *frame*; it is a smaller file for narrow screens. For a phone frame use `device="iphone"`.
- The old component had `sizes` and `quality` props for `@nuxt/image`; they were not used any more and are not in the unit.
- The old component's phone picture was a fixed 780 by 1688; that is now the default of `phoneWidth` and `phoneHeight`.
- The old component's hover lift took its time from the site's Tailwind setting; it now reads `--site-block-motion`.
- The link opens a new tab and says nothing about it to a screen reader; put that in the `alt` if it matters on your page.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `components/scrollcraft/BrowserFrame.vue` at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Written out without Tailwind or `theme()`: the same sizes and shapes. Changed on purpose: the address pill is optional, the dead `sizes` and `quality` props are gone, the capture sizes are props, and the phone hardware colours are `--site-block-device-*` variables. The unit's tests are new.
