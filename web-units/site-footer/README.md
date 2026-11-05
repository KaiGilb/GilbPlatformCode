# web site-footer

The site's footer: the brand, an optional tagline, an optional list of links, and a copyright line. Vue 3 / Nuxt 3. Moved from two production sites; see Source.

## What this is

The site footer for a website: brand, optional tagline, a row of footer links and the copyright line.

`<SiteFooter>` draws the site's footer as a `<footer data-site-footer>`: the brand, an optional tagline, an optional list of links, and a copyright line. It is in the server's HTML before any script runs, and it needs no script at all. In detail:

- a top band with the brand name and, when given, a tagline at most 48 characters wide. From 768 px the brand sits on the left and the links on the right; below that, one column;
- a list of links, when `links` is not empty, in a `<nav>` whose name is `navLabel` (default "Footer");
- a bottom band under a 1 px line: `© {year} {copyrightName}.` on the left, and an optional link on the right (`endLink`).

The `brand` slot replaces the brand-name paragraph, so a site can put its logo lockup there. The tagline stays. Links are plain anchors unless the host passes `linkComponent` (Nuxt: `NuxtLink`). A link marked external stays a plain anchor. Every word is a prop. It needs no script in the browser.

## What this is not

- Not a sitemap or a mega footer: one short list of links, not columns of groups.
- Not a newsletter block: it takes no address and sends nothing. Take `web-units/newsletter-signup` for that.
- Not a locale strip: it has no language switcher. Take `web-units/language-switcher` for that.

## How to take it

Package: `@kaigilb/gilbwebsitecode-site-footer`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-site-footer
cd web-units/site-footer && npm pack --pack-destination <site>/vendor/gilbwebsitecode-site-footer
echo <commit> > <site>/vendor/gilbwebsitecode-site-footer/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-site-footer/kaigilb-gilbwebsitecode-site-footer-0.1.1.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-site-footer/kaigilb-gilbwebsitecode-site-footer-0.1.1.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-site-footer'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/site-footer`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-site-footer'] },
```

Then:

```vue
<script setup lang="ts">
import { SiteFooter } from '@kaigilb/gilbwebsitecode-site-footer'
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <SiteFooter
    brand-name="Acme"
    tagline="One line about the site."
    :links="[
      { label: 'About', href: '/about' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Docs', href: 'https://example.test/docs', external: true },
    ]"
    :end-link="{ label: 'Built on Gilb', href: 'https://example.test' }"
    :link-component="NuxtLink"
  />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `brandName` | the brand name. Required. Also the copyright name when `copyrightName` is left out |
| `tagline?` | the line under the brand (default `''`, which draws no paragraph). At most 48ch wide |
| `links?` | `FooterLink[]`: `{ label, href, external? }`. Default `[]`, which draws no nav. `external: true` is always a plain `<a href rel="noopener">`, and no `target` is set |
| `navLabel?` | the nav's accessible name (default `"Footer"`) |
| `copyrightName?` | the name in the copyright line. When left out, `brandName` |
| `year?` | the year in the copyright line. When left out, the calendar year read once when the component is set up |
| `endLink?` | `{ label, href }` or `null` (default `null`). Drawn on the right of the bottom band. Always a plain `<a href>`, not `linkComponent` |
| `linkComponent?` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>`. Does not apply to a link with `external: true`, or to `endLink` |
| `maxWidth?` | the inner width, a CSS length (default `1400px`) |

Slot `brand`: replaces the brand-name paragraph, so a site can put its logo lockup there. The tagline is not part of the slot. The default content of the slot is the brand name.

```vue
<SiteFooter brand-name="Acme" tagline="One line about the site.">
  <template #brand>
    <img src="/logo.svg" alt="Acme" width="120" height="32" />
  </template>
</SiteFooter>
```

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` the brand name, and a link when the pointer or keyboard is on it
- `--site-block-muted` the tagline, the links, the copyright line, and the borders (10 % of it)
- `--site-block-bg` the footer's background (fallback `transparent`)
- `--site-block-accent` the focus outline, 2 px with a 2 px offset
- `--site-block-motion` the colour transition's time (fallback `150ms`), and only when the visitor has not asked for reduced motion

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The footer is in the server's HTML at its final size: no image and no web font of its own, and no script. The two bands do not move after load. A logo put in the `brand` slot is the host's picture; give it a width and a height or the page moves when it arrives. The link list wraps, and the copyright line wraps on a narrow screen. Nothing else moves.

## Do not

- Do not put a newsletter form or a language switcher in it. Those are other units.
- Do not hard-code the site's name, the year, or the links: they are props.
- Do not expect an external link to open a new tab. `external: true` sets `rel="noopener"` and does not set `target`.
- Do not pass `linkComponent` and expect `endLink` to use it. That link is always a plain anchor.

## Wrong readings

- Words come from props. The gilb-web file read the brand from `useAppConfig`, the tagline and the nav from `data/site`, and the link words from `useI18n`. This unit imports none of those.
- The links are a `<ul>` of `<li>`, not the bare links the gilb-web file drew. A screen reader can say how many there are.
- Each link is at least 44 px tall (`inline-flex`, items centred), from the myjackfruit footer's tap-target rule. The gilb-web links were the height of the text only.
- `endLink` is the right-hand link from the mynet-web footer ("Built on Gilb" there). The gilb-web footer has no such link. Here it is a prop, and it is left out unless the host passes it. The mynet file has no nav; pass `links` as `[]` for that shape.
- Top and bottom padding are gilb-web's (3.5rem on the top band, 1.5rem on the bottom); mynet-web's 3rem and 1.25rem are not used. The right-hand link is mynet-web's `text-xs`: 0.75rem on a 1rem line (and still 44 px tall).
- The `brand` slot is new. Both source files wrote the brand name in a paragraph and had no slot.

## Source

Both on the site's main. Primary: `KaiGilb/gilb-web`, `components/site/SiteFooter.vue` at `a3be1bce783d9b34c4c2f40c2cbc0886c28c5daa`. The right-hand link: `KaiGilb/mynet-web`, `components/site/SiteFooter.vue` at `ca601b9f188343e5075057907678dad64324269e`. Written out without Tailwind, `@apply`, `theme()`, `useI18n`, `useAppConfig` or a `data/site` import: the same bands (brand and tagline, then the copyright line), the same 1400 px inner width, the same 768 px two-column top, and the borders at 10 % of the muted colour. The 44 px link target is the myjackfruit footer's rule, not a third copy of a file. The unit's tests are new.
