# web faq

Questions a site's visitors often ask, each opening its answer in place below it, on native `<details>` and `<summary>`. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/FAQ.vue` (website-engine-a 80ad391).

## What this is

`<Faq :heading :items>` draws a `<section>` with an optional `<h2>` and one `<details>` per item, separated by thin lines. The question is the `<summary>`, with a + that turns into × when the answer is open (hidden from screen readers). It needs no script: before the page's script runs, and with JavaScript off, a click, a tap or Enter opens and closes each answer, and every question and answer is in the server's HTML.

## What this is not

- Not a help centre of separate pages: each answer stays on this page.
- Not an accordion that closes the others: each item opens on its own.

## How to take it

Package: `@kaigilb/gilbwebsitecode-faq`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-faq
cd web-units/faq && npm pack --pack-destination <site>/vendor/gilbwebsitecode-faq
echo <commit> > <site>/vendor/gilbwebsitecode-faq/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-faq/kaigilb-gilbwebsitecode-faq-0.2.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-faq/kaigilb-gilbwebsitecode-faq-0.2.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-faq'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/faq`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-faq'] },
```

Then:

```vue
<script setup lang="ts">
import { Faq, type FaqItem } from '@kaigilb/gilbwebsitecode-faq'
const items: FaqItem[] = [
  { q: 'Who maintains the content?', a: 'You do, from your own site.' },
]
</script>

<template>
  <Faq heading="FAQ" :items="items" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `heading?` | the section's `<h2>` |
| `items` | `{ q, a }[]`, plain text; questions are the list's keys, so keep them distinct |
| `icon?` | 0.2.0. `plus-cross` (default: a + that turns into ×) or `plus-minus` (two bars drawn in CSS, − when open; the colour is the text colour, set it on `.faq-bars`' parent or the summary) |
| `scrollMarginTop?` | 0.2.0. A CSS length put on each summary, e.g. `6rem`, so a question reached by Tab or Shift+Tab stops clear of a fixed header. Off by default |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text
- `--site-block-muted` secondary text and borders
- `--site-block-motion` the hover transition (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

An answer opens only when the visitor asks for it, and pushes what is below it down; nothing moves on its own. Everything is in the server's HTML.

## Do not

- Do not put links or markup in `a`; it is drawn as plain text.
- Do not hide an answer a visitor needs to act (a price, a deadline) only here.

## Wrong readings (0.2.0)

- With both new props off the unit draws exactly what 0.1.0 drew. No visible change by default.
- `plus-minus` is not the Gilb Websites page's whole FAQ look: the page's frosted card, per-row reveal and the amber icon colour are the page's own. The unit's bars take `currentColor`.
- `scrollMarginTop` only matters for keyboard focus and in-page links; it moves nothing on load.

## Source

The website starter's `components/catalog/FAQ.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes and colours, and the sign's turn turned off under reduced motion.

Version 0.2.0 (`icon`, `scrollMarginTop`): behaviour read from `Jairam-Gilb/gilb-websites-web`, `pages/index.vue` (FAQ section) and `assets/css/main.css` (`sc-faq*`) at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Tests are new, in `src/v2.test.ts`.

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.
