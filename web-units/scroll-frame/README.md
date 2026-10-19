# web scroll-frame

Scroll helpers: a rAF-throttled scroll and resize feed, and a fade-up reveal for elements entering the view. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (`composables/useScrollFrame.ts`, `useReveal.ts`, branch `redesign-scrollcraft` b78b1f9).

## What this is

Two scroll helpers and the CSS one of them needs. `useScrollFrame()` gives a rAF-throttled scroll and resize feed: one passive listener pair, every subscriber called on the next animation frame, removed when the component unmounts. `useReveal(rootRef)` fades up each `[data-reveal]` element inside a container as it scrolls into view. `<ScrollReveal>` is `useReveal` on a wrapper element, with the reveal CSS. Nothing is hidden in the server's HTML, with JavaScript off, under reduced motion, or for an element already on screen.

## What this is not

- Not a smooth-scroll library (the Gilb Websites page adds Lenis itself; that is not here).
- Not an animation library: it fades up and stops. Effects that follow the scroll (brightening text, pinned cards) are `scrub-text`, `section-heading` and `sticky-card-deck`.
- Not scroll-jacking: it never moves the page or changes the scroll speed.

## How to take it

Package: `@kaigilb/gilbwebsitecode-scroll-frame`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-scroll-frame
cd web-units/scroll-frame && npm pack --pack-destination <site>/vendor/gilbwebsitecode-scroll-frame
echo <commit> > <site>/vendor/gilbwebsitecode-scroll-frame/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-scroll-frame/kaigilb-gilbwebsitecode-scroll-frame-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-scroll-frame/kaigilb-gilbwebsitecode-scroll-frame-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-scroll-frame'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/scroll-frame`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-scroll-frame'] },
```

```vue
<script setup lang="ts">
import { ScrollReveal } from '@kaigilb/gilbwebsitecode-scroll-frame'
</script>

<template>
  <ScrollReveal tag="section">
    <h2 data-reveal>Our work</h2>
    <p data-reveal>Glides in when it scrolls into view.</p>
  </ScrollReveal>
</template>
```

Or the helpers alone:

```ts
import { useScrollFrame, useReveal } from '@kaigilb/gilbwebsitecode-scroll-frame'
const { subscribe, reduced } = useScrollFrame()
if (!reduced) subscribe(() => { /* read layout, write transform or opacity */ })
```

`useReveal` alone has no CSS: the rules live in `ScrollReveal.vue` (an unscoped style). A host that uses `useReveal` without the component must import `ScrollReveal` once, or copy those rules.

## What you pass

| Item | Meaning |
|---|---|
| `<ScrollReveal tag?>` | the wrapper's element (default `div`); the slot holds the `[data-reveal]` elements |
| `useScrollFrame()` | returns `{ subscribe(fn) => unsubscribe, reduced }`. Call it in a component's `setup`. When `reduced` is true, `subscribe` registers nothing: skip the effect |
| `useReveal(rootRef)` | `rootRef` is a `Ref<HTMLElement \| null>`; call it in `setup`; it arms on mount |

Each call of `useScrollFrame` has its own subscriber list and its own listener pair, as on the original page (the "one bus" is one per component, removed on unmount).

## Host must supply

Nothing: the reveal uses no colour. It adds the class `sf-motion` to `<html>` after mount (when motion is allowed), `sf-hidden` and `sf-shown` to the revealed elements, and sets `--sf-delay` on them. Do not use those names for anything else.

## Layout stability

The reveal moves an element 24 px with a transform, never its size or place in the flow, so it causes no layout shift. Only elements below the fold are hidden, and only after mount.

## Do not

- Do not put `data-reveal` on the largest contentful element above the fold; it is left visible, but a later change of layout could arm it.
- Do not read layout inside a subscriber and then write in the same loop for many elements without caching; the unit gives you one frame, not a batching of reads and writes.
- Do not write `transform` on an element that also has `data-reveal`: the `sf-shown` rule sets `transform: none` and will stomp yours. Put the reveal on an inner element.

## Wrong readings

- It is a **composable** unit. `RuleGwcunitShape` asks for `.vue` files in every unit and is silent on a unit that is mostly composables; this one ships `ScrollReveal.vue` (a real wrapper that also carries the reveal CSS) so the shape holds. The two composables are the main thing.
- The original page's classes were `sc-motion`, `sc-hidden`, `sc-shown` and `--sc-delay`, with the rules in the site's `main.css`. They are `sf-` here, and the rules ship in the unit: a site that switches must rename them in any CSS of its own.
- The scroll feed is per component, not per page. Three effects on a page mean three listener pairs.
- `reduced` is read once when the helper is created; a visitor who changes the setting while on the page gets it at the next page.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `composables/useScrollFrame.ts`, `composables/useReveal.ts` and the `sc-hidden` / `sc-shown` rules in `assets/css/main.css`, at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Changed on purpose: class and variable names prefixed `sf-`; the CSS ships in the unit; no Nuxt auto-imports (explicit `vue` imports); `ScrollReveal.vue` added. The unit's tests are new.
