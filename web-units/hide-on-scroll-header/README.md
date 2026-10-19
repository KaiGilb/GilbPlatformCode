# web hide-on-scroll-header

A fixed site header that is clear over the top of the page, solid after it, slides away while the visitor scrolls down but keeps its call-to-action in place, and comes back on any scroll up. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing layout (Jairam-Gilb/gilb-websites-web, `layouts/landing.vue`, header part, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<HideOnScrollHeader>` draws a "skip to content" link, a sentinel strip at the page's top, and a fixed `<header>` with three slots: `logo`, `nav` and `cta`. While the visitor scrolls down, the bar's background, the logo and the nav slide and fade away and only the call-to-action stays where it is; a scroll up brings the whole bar back. Leaving the top goes straight from the clear bar to hidden, never through a dark frame. Before the page's script runs the bar is the plain clear bar, so it works as HTML. A menu in the `nav` slot (the library's `section-menu`) works inside it.

The scroll rules are also exported as a controller with no DOM, `createHeaderController(env, onChange, config?)`, and `isSolid(view)`.

## What this is not

- Not the page layout: the footer, the main area and the page's scroll effects are the host's.
- Not a menu: put `section-menu` or your own links in the `nav` slot.
- Not a smooth-scroll library: it only reads the scroll position, so any smooth scroll that moves the real scroll position works.
- Not a sticky header that stays: if you want a bar that never hides, you do not need it.

## How to take it

Package: `@kaigilb/gilbwebsitecode-hide-on-scroll-header`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-hide-on-scroll-header
cd web-units/hide-on-scroll-header && npm pack --pack-destination <site>/vendor/gilbwebsitecode-hide-on-scroll-header
echo <commit> > <site>/vendor/gilbwebsitecode-hide-on-scroll-header/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-hide-on-scroll-header/kaigilb-gilbwebsitecode-hide-on-scroll-header-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-hide-on-scroll-header/kaigilb-gilbwebsitecode-hide-on-scroll-header-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-hide-on-scroll-header'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/hide-on-scroll-header`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-hide-on-scroll-header'] },
```

Then:

```vue
<script setup lang="ts">
import { HideOnScrollHeader } from '@kaigilb/gilbwebsitecode-hide-on-scroll-header'
</script>

<template>
  <HideOnScrollHeader cta-label="Book a meeting" cta-href="#meeting">
    <template #logo><a href="/">Example</a></template>
    <template #nav>
      <nav aria-label="Sections"><a href="#work">Work</a> <a href="#faq">Questions</a></nav>
    </template>
  </HideOnScrollHeader>
  <main id="main">...</main>
</template>
```

## What you pass

| Prop or slot | Meaning |
|---|---|
| slot `logo` | the logo or wordmark. Fades with the bar |
| slot `nav` | links or a section menu; give it your own `<nav aria-label>`. Fades with the bar. The unit adds no gap before the call-to-action and does not hide the nav on phones: do both in your own markup |
| slot `cta` | the call-to-action. It never hides. Default: a link from `ctaHref` and `ctaLabel` (drawn only when `ctaLabel` is given) |
| `skipTarget?`, `skipLabel?` | the skip link's target (default `#main`) and text (default "Skip to content"). The host's main area needs that id |
| `ctaHref?`, `ctaLabel?` | for the default call-to-action |
| `thresholds?` | `{ hideAfterPx: 96, deadZonePx: 8, topPx: 48, settleMs: 150, inputWindowMs: 1000 }`: change a value only with a measured reason |

The root is `display: contents`, so the skip link and the sentinel are positioned against the host's nearest positioned ancestor (or the page). Put the header where the page's first positioned ancestor starts at the page top.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-bg` the solid bar's colour (92 % opaque, 78 % with a blur where the browser can)
- `--site-block-fg` the bar's bottom hairline (a few percent of it)
- `--site-block-accent` and `--site-block-on-accent` the skip link and the default call-to-action
- `--site-block-header-z` the stacking order (default 40), `--site-block-header-lift` the dark shadow under the floating button (default a 70 % black)

No Tailwind is needed: the styles ship in the component, scoped to it. The bar is 4rem high and as wide as 72rem.

## Layout stability

The bar is fixed and does not take space in the page: nothing below it moves when it hides or returns. It is 4rem high from the first draw. The host pads the top of its first section for the bar (the page's hero does that today).

## Do not

- Do not put the page's only link to something important in the nav slot alone: it is hidden while the visitor scrolls down.
- Do not put two of these on a page.
- Do not change `thresholds` to make it feel livelier without watching it on a phone: each value fixed a fault found in QA (see "Wrong readings").
- Do not set `opacity` or `filter` on the host's own ancestors of cards that rely on a backdrop blur; this unit does not either.

## Wrong readings

- A solid bar hides only after the visitor's own wheel, touch, key or pointer input within the last second. A page that shifts under the visitor (a widget growing after load) must not paint the bar solid and hide it. This is deliberate, not a missed event.
- The bar stays clear, not solid, between the top and the first hide: it goes clear to hidden. It turns solid on the first scroll up, or after the page has been still for 150 ms when it was opened past the hero (a reload, a link to a section).
- A browser's own moves before the page settles (scroll restoration, anchoring) can hide the still-clear bar first. Then only the button shows until the visitor scrolls up. Never a dark frame.
- Keyboard focus inside the bar shows the whole bar (Shift+Tab up from the page). A mouse click on the button does not, on purpose.
- **Added in this unit, not on the Gilb Websites page:** while a button inside the bar has `aria-expanded="true"` (an open section menu), the bar stays shown. The page had no menu there; without this a menu's panel would be hidden with the bar.
- The nav and logo are wrapped in a `div` so they can fade. On the page the nav element itself faded and was hidden below 768 px; here the host does that in its own markup.
- The skip link is part of the unit; a layout that also draws one has two.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `layouts/landing.vue` (the script's scroll logic and the header's styles) at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. The scroll logic is `headerState.ts`, moved line for line into a controller that takes the browser as a parameter; a test copies the former code and checks that both give the same view after every step of 360 000 random scroll, input and timer steps. Written out without Tailwind. The site-specific parts stay in the site: the logo, the nav links, the label, the footer, the Lenis scroll-to-top and the content query. The unit's tests are new.
