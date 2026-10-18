# web section-menu

A website's section menu: a header button that says where you are, and a large panel that opens at once on hover or tap, with the sections on the left and the hovered section's pages on the right. One column on a phone. The site passes its menu as data. Vue 3 / Nuxt 3.

This is the default header menu of a website built by Agent.Website when the person asking for the site describes no menu of their own. The website starter (Engine A, `website-engine-a`) uses it. The app counterpart, in React, is `units/section-menu`; both behave the same.

## What this is

`<SectionMenu :menu :current-path :link-component>` draws:

- **a header button** with the current section's name (a page in no section reads "Menu") and a ▾. It opens the panel on pointer enter where the pointer can hover finely, and on click or tap everywhere. A click right after a hover-open (within 600 ms) keeps it open; a later click closes it.
- **a dimmed edge** below the site's header; a click on it closes the menu.
- **the panel**, always in the page and in the server's HTML, so opening it is a class change. While closed it is `inert` and `aria-hidden`.
  - Left: the sections, each a link to its page. The one you are on is marked "You are here". A sub-page counts as its section (`/blog/post` is in Blog).
  - Next, where the site has sub-pages: "In <section>", the previewed section's pages. Resting the pointer on a section for 120 ms, or focusing it, previews it; a quick pass does not. Each opening starts from the section you are on. Every section's pages are in the HTML, only the shown list is visible, so a crawler finds them all.
  - Right: "Also useful here", places a section names (for example another site).
  - Footer: "Press Esc to close" and the site's call to action.
- **four ways to close**: Close, Esc, the dimmed edge, or any link (and a route change). Esc, Close and the edge give focus back to the button.
- **keyboard**: focus lands on the section you are on. Tab stays inside the panel: Close, every section, each followed (when previewed) by its pages and places, then the call to action, and wraps. Up, Down, Home and End move between sections; Right goes into the pages; Left comes back.
- **phone** (under 600 px): one column; no hover preview; the pages shown are those of the section you are on. 600 to 839 px: two columns.
- Reduced motion: no transitions.

Also: `currentSectionId(menu, path)`, `placesFor(section, places)`, `normalisePath(path)`, and the words (`DEFAULT_WEB_LABELS`).

## What this is not

- Not the site's pages or copy. The sections, pages, places and call to action are the site's data.
- Not the logo, the language switch or other header controls. The site's header keeps them, beside the button.
- Not the app menu. An app on GilbPlatform takes `units/section-menu` (React).

## How to take it

Package: `@kaigilb/gilbwebsitecode-section-menu`

With pnpm (9 or later), from this repository at a commit, without a clone:

```json
"@kaigilb/gilbwebsitecode-section-menu": "git+https://github.com/KaiGilb/GilbPlatformCode.git#<commit>&path:/web-units/section-menu"
```

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
| `menu` | `{ sections, places?, cta? }`. A section: `id`, `label`, `description?`, `to` (a route) or `href` (an address), `links?` (its pages), `also?` (place ids), `coming?` |
| `currentPath` | the current route's path; it decides "You are here" and closes the menu when it changes |
| `linkComponent` | the component that links a route, given `to` (Nuxt: `resolveComponent('NuxtLink')`); default a plain `<a href>` |
| `labels` | optional: every word the menu draws |

Events: `navigate` (a link was chosen) and `open-change`. Exposed: `show()` and `close()`.

## Host must supply

The theme, as CSS variables on `:root` or the header (neutral fallbacks otherwise): `--section-menu-surface`, `--section-menu-fg`, `--section-menu-muted`, `--section-menu-accent`, `--section-menu-on-accent`, `--section-menu-line`, `--section-menu-soft`, `--section-menu-radius`, `--section-menu-shadow`. Map them from the site's own tokens. `--section-menu-top` is the header's height (default `4rem`); `--section-menu-z-scrim` and `--section-menu-z-panel` the paint order (default 100 and 101, the `overlay-layers` unit's menu layers). No Tailwind is needed: the styles ship in the component.

## Do not

- Do not list a page that is not built (Rule_Code_gilb-app-nav-truth). `coming` is only for one the owner names as coming.
- Do not hard-code the menu in the component; it is data.

## Wrong readings

- The panel is in the page while closed: test "closed" by `data-open`, `aria-hidden` or `inert`, not by its absence.
- Every section's pages are in the HTML; only one list is visible at a time.
- On a phone a section is a link to its page; it does not preview.

## Source

myjackfruit-web `components/MegaMenu.vue` and `SiteHeader.vue` (Nuxt 3): the hover intent, the focus trap, Esc and the phone sheet. Brought to the behaviour of the app menu (GilbApp `src/components/menu/SectionMenu.tsx` at `0f0f1b7`): the panel always mounted, sections on the left with a previewed column, the four ways to close, the Tab order. myjackfruit-web itself has not moved to this unit.
