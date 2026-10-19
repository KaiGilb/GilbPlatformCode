# web section-menu

A website's section menu: a header button that says where you are, and a large panel that opens at once on hover or tap, with the sections on the left and the hovered section's pages on the right. One column on a phone. The site passes its menu as data. Vue 3 / Nuxt 3.

It is meant to be the default header menu of a website built by Agent.Website when the person asking for the site describes no menu of their own; the rule that makes it so is still to be written (handoff 2026-10-18 §4, held for Kai's go). The website starter (Engine A, `website-engine-a`) already uses it as its header menu. The app counterpart, in React, is `units/section-menu`; both behave the same.

## What this is

**It works before the page's JavaScript runs, and with JavaScript off.** The server's HTML is a `<nav>` landmark (named "Site") holding every section and every page as plain links, inside a native `<details>`. Until the script runs, the button is its `<summary>`: a click, a tap or Enter opens and closes the panel with no script, and the panel shows every section's pages under their names. The menu never writes the address, so a reload or Back never opens it. (A link someone else writes to the panel's own id would make the browser open it, as it does for any `<details>`; after the script, an opening the menu did not make is shut again.) When the script runs it reads `details.open` once and takes over as below: a panel the visitor opened stays open with focus on the section they are on, a menu nobody touched stays closed, and a hover already on the button opens it. The opening, the takeover, reload, Back, the unchanged address and the expanded state are measured in Chromium, Firefox and WebKit by the website starter's `scripts/check-section-menu-browser.mjs` (the hover carry-over is not among its cases). So a site with delayed hydration needs no eager hydration for its header.

Once the script runs:

`<SectionMenu :menu :current-path :link-component>` draws:

- **a header button** with the current section's name (a page in no section reads "Menu") and a ▾. It opens the panel on pointer enter where the pointer can hover finely, and on click or tap everywhere. A click right after a hover-open (within 600 ms) keeps it open; a later click closes it.
- **a dimmed edge** below the site's header; a click on it closes the menu.
- **the panel**, always in the page and in the server's HTML, so opening it is a class change. While closed it is `inert` and `aria-hidden`.
  - Left: the sections, each a link to its page. The one you are on is marked "You are here". A sub-page counts as its section (`/blog/post` is in Blog).
  - Next, where the site has sub-pages: "In <section>", the previewed section's pages. Resting the pointer on a section for 120 ms, or focusing it, previews it; a quick pass does not. Each opening starts from the section you are on. Every section's pages are in the HTML, only the shown list is visible, so a crawler finds them all.
  - Right: "Also useful here", places a section names (for example another site).
  - Footer: "Press Esc to close" and the site's call to action.
- **four ways to close**: Close, Esc, the dimmed edge, or any link (and a route change). Each gives focus back to the button.
- **keyboard**: focus lands on the section you are on. Tab stays inside the panel: Close, every section, each followed (when previewed) by its pages and places, then the call to action, and wraps. Tab skips a coming page or place (before the script too); the arrows land on it, and Tab or Shift+Tab from there goes on to the next or previous usable entry in that order, as in the app unit. Up, Down, Home and End move between sections; Right goes into the pages; Left comes back.
- **phone** (under 600 px): one column; no hover preview; the pages shown are those of the section you are on. A section with pages but no page of its own is a button: tapping it shows its pages. 600 to 839 px: two columns.
- Open and close fade over 90 ms, as in the app menu; reduced motion turns the fades off.

Also: `currentSectionId(menu, path)`, `placesFor(section, places)`, `normalisePath(path)`, and the words (`DEFAULT_WEB_LABELS`).

## What this is not

- Not the site's pages or copy. The sections, pages, places and call to action are the site's data.
- Not the logo, the language switch or other header controls. The site's header keeps them, beside the button.
- Not the app menu. An app on GilbPlatform takes `units/section-menu` (React).

## How to take it

Package: `@kaigilb/gilbwebsitecode-section-menu`

Take it as a copy, the library's one way for every unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-section-menu
cd web-units/section-menu && npm pack --pack-destination <site>/vendor/gilbwebsitecode-section-menu
echo <commit> > <site>/vendor/gilbwebsitecode-section-menu/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-section-menu/kaigilb-gilbwebsitecode-section-menu-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-section-menu/kaigilb-gilbwebsitecode-section-menu-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

pnpm 11 also checks every package's age against the npm registry (`minimumReleaseAge`). This package is not on the registry, so a fresh install refuses it (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`) unless the site's `pnpm-workspace.yaml` names it:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-section-menu'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/section-menu`. pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository and the site does not build (measured 2026-10-18, Agent.Tester round 6). It works only where the store already holds that commit, which is why it looked right on the machine that added it.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-section-menu'] },
```

Then, in the layout:

```vue
<script setup lang="ts">
import { SectionMenu } from '@kaigilb/gilbwebsitecode-section-menu'
const route = useRoute()
const { sectionMenu } = useAppConfig()          // the menu as data
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <header>
    <SiteLogo />
    <SectionMenu :menu="sectionMenu" :current-path="route.path" :link-component="NuxtLink" />
  </header>
</template>
```

The data:

```ts
sectionMenu: {
  sections: [
    { id: 'home', label: 'Home', to: '/' },
    { id: 'services', label: 'Services', description: 'What we do.', to: '/services',
      links: [{ id: 'services.web', label: 'Websites', description: 'Fast sites.', to: '/services/websites' }] },
  ],
  places: [{ id: 'shop', label: 'Shop', href: 'https://shop.example', newTab: true }],
  cta: { label: 'Contact us', to: '/contact' },
}
```

## What you pass

| Prop | Meaning |
|---|---|
| `menu` | `{ sections, places?, cta? }`. A section: `id`, `label`, `description?`, `to` (a route) or `href` (an address), `links?` (its pages), `also?` (place ids). A page or a place may be `coming?`; a section may not (as in the app unit): its type forbids it, and one that arrives with `coming` anyway (untyped data) is left out entirely, with a console warning in development |
| `currentPath` | the current route's path; it decides "You are here" and closes the menu when it changes |
| `linkComponent` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>` |
| `labels` | optional: every word the menu draws |

Events: `navigate` (a link was chosen) and `open-change`. Exposed: `show()` and `close()`.

## Host must supply

The theme, as CSS variables on `:root` or the header (neutral fallbacks otherwise): `--section-menu-surface`, `--section-menu-fg`, `--section-menu-muted`, `--section-menu-accent`, `--section-menu-on-accent`, `--section-menu-accent-text` (accent text on the accent tint; default the accent mixed 75% toward `--section-menu-fg`, which keeps WCAG AA), `--section-menu-line`, `--section-menu-soft`, `--section-menu-radius`, `--section-menu-shadow`. Map them from the site's own tokens. `--section-menu-top` is the header's height (default `4rem`); `--section-menu-z-scrim` and `--section-menu-z-panel` the paint order (default 100 and 101, the `overlay-layers` unit's menu layers). No Tailwind is needed: the styles ship in the component.

## Do not

- Do not list a page that is not built (Rule_Code_gilb-app-nav-truth). `coming` is only for a page or place the owner names as coming; a section is never coming.
- Do not hard-code the menu in the component; it is data.

## Wrong readings

- The panel is in the page while closed: test "closed" by `data-open` (and, after the script, `inert`), not by its absence. Before the script nothing is `inert`, and a closed `<details>` does not render the panel. After it, `<details>` is open exactly while the menu is, so the button's expanded state is true only then (Chromium's accessibility tree measured; Firefox and WebKit not walked).
- Every section's pages are in the HTML. Before the script all lists show; after it, only the shown one.
- On a phone a section is a link to its page; it does not preview.

## Source

myjackfruit-web `components/MegaMenu.vue` and `SiteHeader.vue` (Nuxt 3): the hover intent, the focus trap, Esc and the phone sheet. Brought to the behaviour of the app menu (GilbApp `src/components/menu/SectionMenu.tsx` at `0f0f1b7`): the panel always mounted, sections on the left with a previewed column, the four ways to close, the Tab order. myjackfruit-web itself has not moved to this unit.
