# web site-logo

One link: an optional logo image and an optional wordmark. Vue 3 / Nuxt 3. Moved from KaiGilb/website-engine-a `components/SiteLogo.vue` at `81362f4fdc0bd59d390e4285855c04c019f1e7b9` and KaiGilb/gilb-websites-web `components/SiteLogo.vue` at `49ce2795ab54a1bda798f5cc745406020e8460d8`.

## What this is

The site logo for a website header or footer: one home link with the logo image, the site name as a wordmark, or both, spoken once.

`<SiteLogo name>` draws one link (to `/` unless `href` says otherwise). Inside it, a logo image when `logoSrc` is set, and the site name as a wordmark unless `wordmark` hides it. The name is spoken once: from the wordmark when it is shown, otherwise from the image's alt. A host that uses a router passes its link component; a host that optimises images passes its image component. `decorative` draws only the image, for a place beside a sibling that is already the link. It is a plain link in the server's HTML, so it works before the script runs and with no script at all.

## What this is not

- Not a full brand lockup system: no stacked mark, no tagline, no icon-only and wordmark-only files managed inside the unit.
- Not a light/dark file switch. The host passes `logoSrc`. The unit does not read the theme and does not swap files.
- Not the site's config, its catalogue of words, or its router. It does not call `useAppConfig`, `useI18n` or `useRoute`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-site-logo`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-site-logo
cd web-units/site-logo && npm pack --pack-destination <site>/vendor/gilbwebsitecode-site-logo
echo <commit> > <site>/vendor/gilbwebsitecode-site-logo/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-site-logo/kaigilb-gilbwebsitecode-site-logo-0.1.1.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-site-logo/kaigilb-gilbwebsitecode-site-logo-0.1.1.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-site-logo'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/site-logo`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-site-logo'] },
```

Then:

```vue
<script setup lang="ts">
import { resolveComponent } from 'vue'
import { SiteLogo } from '@kaigilb/gilbwebsitecode-site-logo'

const NuxtLink = resolveComponent('NuxtLink')
const NuxtImg = resolveComponent('NuxtImg')
</script>

<template>
  <SiteLogo
    name="Example"
    href="/"
    logo-src="/brand/logo.svg"
    :logo-width="32"
    :logo-height="32"
    :link-component="NuxtLink"
    :image-component="NuxtImg"
  />
</template>
```

`NuxtLink` receives `to`. `NuxtImg` receives `src`, `alt`, `width`, `height`, `decoding="async"` and `loading="eager"`. For an address outside the router, set `external` and pass that address as `href`: the link stays a plain `<a>`, even if `link-component` is set.

## What you pass

| Prop | Meaning |
|---|---|
| `name` | the site name. The wordmark, and the image's alt when the wordmark is not shown |
| `href?` | where the logo goes (default `/`) |
| `external?` | the address is outside this site's router (default `false`). Forces a plain `<a href>` even when `linkComponent` is set |
| `logoSrc?` | the logo file's address. Empty (the default) draws no image |
| `logoAlt?` | alt used only when the wordmark is hidden. Empty uses `name` |
| `logoWidth?`, `logoHeight?` | the image's `width` and `height` attributes, in pixels (default 32 and 32). Always set. The image is drawn 2rem high; these two set its aspect ratio (so the layout does not shift), not its drawn size, so pass the logo's own ratio |
| `wordmark?` | `always` (default: the name is always shown), `when-no-logo` (the name is shown only when there is no image), or `never` (the name is hidden when there is an image). `never` with no image still shows the name |
| `linkComponent?` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`). The string `a` (the default) is a plain `<a href>` |
| `imageComponent?` | the component that draws the logo, given `src`, `alt`, `width`, `height`, `decoding` and `loading` (Nuxt: `resolveComponent('NuxtImg')`). Default `<img>` |
| `decorative?` | draw only the image, with `alt=""` and `aria-hidden="true"`, and no link and no wordmark (default `false`). For a sibling that already carries the link and the name |

## Host must supply

The accent, as one CSS variable on `:root` (a blue fallback otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-accent` the link colour and the focus outline (fallback `#2563eb`)

The logo file itself, served at the address passed as `logoSrc`. This package ships no image.

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own font size, weight and box sizing (`border-box`) instead of relying on a CSS reset; the wordmark inherits the page's font.

## Layout stability

The image is in the server's HTML with `width` and `height` attributes (`logoWidth` and `logoHeight`, default 32 and 32), so the browser can reserve the file's ratio before it loads. CSS then draws it at `2rem` tall and `width: auto`. It loads eagerly (`loading="eager"`, `decoding="async"`): the logo is above the fold. The link is at least 44px tall. There is no web font of the unit's own.

## Do not

- Do not put an `aria-label` on this link. It hides the wordmark, and the name is then spoken from the label instead of from the visible text.
- Do not leave `logoWidth` and `logoHeight` at 32 when the file is another size. Those attributes are what keep the layout still.
- Do not use `decorative` as the only logo. It has no link and an empty alt; a sibling must carry the link and the name.
- Do not pass `decorative` with an empty `logoSrc` (the default is empty). Nothing is drawn: no image, no wordmark and no link.
- Do not expect the unit to pick a different file for a dark theme. Pass the `logoSrc` you want.

## Wrong readings

- **Deliberate change — the accessible name.** Both sources set `aria-label` to the site name on the link, and also set the image's alt to the site name (website-engine-a) or to empty while the label still repeats the name (gilb-websites-web). website-engine-a also always draws a visible `<span>` with the site name. A screen reader then hears the name two or three times, and the `aria-label` hides the visible wordmark from the name. This unit sets no `aria-label`. When the wordmark is shown, the image's alt is `""` (the wordmark is the name). When the wordmark is not shown, the image's alt is `logoAlt`, or `name` when `logoAlt` is empty.
- **Props replace `useAppConfig`.** Both sources read `brand` from `useAppConfig()`. The gilb-websites-web file also uses `useI18n`, `useRoute`, and a click handler that scrolls to the top when the visitor is already on the home page. None of that is in the unit. The host passes `name`, `href`, `logoSrc`, `logoAlt` and the rest. website-engine-a's default is a wordmark that is always shown (`wordmark="always"`). gilb-websites-web hides the wordmark when a logo image is set (`wordmark="when-no-logo"`, and that file's image alt is empty). `wordmark="never"` with no image still renders the name, so the link is never empty: an empty link would have no accessible name.
- **Decorative, from triangula's lockup (the idea only, not that component).** A logo that sits beside a control which is already the link should not be a second link and should not add a second name. `decorative` renders only the `<img>`, with `alt=""` and `aria-hidden="true"`, and no wordmark. The sibling carries the link and the name.
- website-engine-a used a raw `<img>` for an SVG and `NuxtImg` for a raster, and rounded the raster. This unit uses one `imageComponent` (default `<img>`) for every file. Pass `NuxtImg` when you want it. The gilb-websites-web file's coded wordmark (a period in a second colour, styles in the site's CSS) is not here: pass the name as text, or a logo image.

## Source

Code, both on `main`:

- `KaiGilb/website-engine-a`, `components/SiteLogo.vue`, commit `81362f4fdc0bd59d390e4285855c04c019f1e7b9`. A `NuxtLink` to `/`, the wordmark always shown, `aria-label` and an image alt of the site name.
- `KaiGilb/gilb-websites-web`, `components/SiteLogo.vue`, commit `49ce2795ab54a1bda798f5cc745406020e8460d8`. A `NuxtLink` to this site's home for the current language (`/` or `/no`). The wordmark is hidden when a logo image is set (the image alt is empty). The file's own comment says the logo must stay on this site and must not send the visitor to an external address in the same tab; an older external target is retired there. The unit's `external` prop is the other way round, and it is a prop: set it when the address you pass is outside the router, and the link stays a plain `<a href>`.

Written out without Tailwind, `@apply`, `theme()`, `useAppConfig`, `useI18n`, `useRoute`, `NuxtLink` or `NuxtImg`. The same inline row: centred, `0.5rem` gap, weight 600, `1.125rem` / `1.75rem`, accent colour, no underline. Added on purpose: a 44px minimum height, `width` and `height` on every image, `decoding="async"`, `loading="eager"` on every image (the source set eager only on its raster), and the focus outline. Changed on purpose: see "Wrong readings". The unit's tests are new.
