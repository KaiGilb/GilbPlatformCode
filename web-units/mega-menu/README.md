# web mega-menu

An 80dvh sheet across the top of the page, and a transparent band across the rest, for a site menu the host opens and closes. Vue 3 / Nuxt 3. Moved from MyJackfruit (KaiGilb/myjackfruit-web, `components/MegaMenu.vue`, `aafbf4a10613fefee69ff8b12d4f71ffc9807c60` on main).

## What this is

A mega menu for a website: a full-width drop-down sheet of grouped links that the site header opens, with focus kept inside and Esc to close.

`<MegaMenu :open :groups>` draws a full-width sheet (default `80dvh`) and a transparent click-catcher over whatever viewport is left under it (the bottom `20dvh` at that default). The sheet is a dialog. Each group is a heading and a list. An item with an `href` is a link. An item without one is plain text: no link, no tab stop, no hover change, the ordinary cursor. A group's call to action is the last row of that list. While the sheet is open the page body does not scroll, Tab stays on the links and buttons inside it, Escape asks the host to close, and the first link (or the Close button, if there is no link) is focused. The sheet fades in and out (opacity). Rows rise 18px over 0.55s in 40ms steps, and the delay stops growing after the tenth. Reduced motion shows the finished sheet at once, with no fade.

The host owns whether it is open. This component only reports what happened.

Before the script runs, and with no script: when the host renders it with `open` true, the sheet and its links are in the server's HTML and the links work. Closing it, the Tab trap, Escape, the focus move and the scroll lock need the script, and the host's own control is what sets `open`; with no script nothing here can open or close the sheet.

## What this is not

- Not the header, and not the button that opens the sheet. Pair it with `hide-on-scroll-header`, or with your own header. The header owns the open state.
- Not a dropdown on each item. It is one sheet for the whole menu.
- Not hover logic. It emits `pointer-enter` and `pointer-leave`. It does not open or close itself because a pointer moved. The header decides what a hover means, including any delay.

## How to take it

Package: `@kaigilb/gilbwebsitecode-mega-menu`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-mega-menu
cd web-units/mega-menu && npm pack --pack-destination <site>/vendor/gilbwebsitecode-mega-menu
echo <commit> > <site>/vendor/gilbwebsitecode-mega-menu/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-mega-menu/kaigilb-gilbwebsitecode-mega-menu-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-mega-menu/kaigilb-gilbwebsitecode-mega-menu-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-mega-menu'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/mega-menu`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-mega-menu'] },
```

Then, with the header button owning the open state. Pass `panelId` and use that same id on the trigger's `aria-controls`. When `panelId` is omitted, the dialog id comes from `useId()`, so two menus on one page do not share an id. Only Escape puts focus back on that button; a link, the catcher and the Close control do not. The sheet's default z-index is 40. `hide-on-scroll-header` also defaults to 40, so raise the header (the source kept its header at 50) or the sheet covers the button:

```vue
<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { MegaMenu, type MenuGroup } from '@kaigilb/gilbwebsitecode-mega-menu'

const open = ref(false)
const panelId = 'site-menu'
const trigger = ref<HTMLButtonElement | null>(null)
let leaveTimer: ReturnType<typeof setTimeout> | undefined

const groups: MenuGroup[] = [
  {
    heading: 'Product',
    items: [
      { label: 'Pricing', sub: 'Pay for what you keep.', href: '/pricing' },
      { label: 'Founders', sub: 'Ship something you can keep.' },
    ],
    cta: { label: 'Join the list', href: '/waitlist' },
  },
]

function onClose(reason: 'esc' | 'outside' | 'link' | 'button') {
  open.value = false
  if (reason === 'esc') nextTick(() => trigger.value?.focus())
}
function onPointerEnter() {
  clearTimeout(leaveTimer)
}
function onPointerLeave() {
  clearTimeout(leaveTimer)
  leaveTimer = setTimeout(() => { open.value = false }, 200)
}
</script>

<template>
  <header style="position: fixed; z-index: 50">
    <button
      ref="trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >Menu</button>
  </header>
  <MegaMenu
    :open="open"
    :panel-id="panelId"
    :groups="groups"
    @close="onClose"
    @pointer-enter="onPointerEnter"
    @pointer-leave="onPointerLeave"
  />
</template>
```

For a route link instead of a plain anchor, pass the host's component (`linkComponent`). In Nuxt that is `resolveComponent('NuxtLink')`. Internal items then receive `to`. An item or call to action with `external: true` stays `<a href>`, so the router does not swallow it.

## What you pass

| Prop or slot | Meaning |
|---|---|
| `open` | whether the sheet is up. Required. The host owns it. While false, nothing is rendered: no listener, no scroll lock |
| `groups` | `MenuGroup[]`. Required. `{ heading, items, columns?, cta?, span? }` |
| `items[]` | `MenuItem`: `{ label, sub?, href?, external? }`. No `href` means static text |
| `cta?` | `MenuCta`: `{ label, href, external? }`, drawn as the last row of that group, in the same stagger count |
| `columns?` | `1` or `2`. `2` is two columns from 640px up, one column below |
| `span?` | how many of the 12 columns the group takes at ≥1024px. When omitted, `floor(12 / groups.length)` |
| `label?` | accessible name of the dialog (default "Site menu") |
| `navLabel?` | accessible name of the nav inside the dialog (default "Main") |
| `closeLabel?` | the bottom Close control (default "Close") |
| `linkComponent?` | the component that links an internal route, given `to` (Nuxt: `resolveComponent('NuxtLink')`). Default a plain `<a href>`. `external: true` is always `<a href>` |
| `zIndex?` | stacking of the overlay (default `40`) |
| `sheetHeight?` | height of the sheet (default `80dvh`). The catcher fills the viewport below it |
| `maxWidth?` | max width of the group grid inside the full-width sheet (default `80rem`) |
| `panelId?` | id of the dialog. The trigger's `aria-controls` should be this same id. When omitted, the id comes from `useId()` |
| slot `footer` | optional, drawn above the Close button. Links and buttons in it join the Tab cycle |

Events:

- `close(reason)`: `'esc'` (Escape), `'outside'` (the catcher, or a click on the sheet's own padding, the nav or the centring wrapper; a click in the gaps between groups or rows does not close it, as in the source), `'link'` (any link, including a call to action), `'button'` (the Close control). The host sets `open` to false. Restore focus only for `'esc'`.
- `pointer-enter`: the pointer entered the sheet. Cancel the header's close timer.
- `pointer-leave`: the pointer left the sheet. Start that timer, if the header has one.

`nextFocusIndex(list, current, shift)` is exported for the same wrap the sheet uses. `current` is `-1` when focus is outside the list.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-bg` the sheet background (fallback `#ffffff`) and the fade behind Close
- `--site-block-fg` link and static text (fallback `#1a1a1a`). The shadow mixes 25% of it
- `--site-block-muted` the group label, the sub line, and Close
- `--site-block-accent` link hover, the focus outline, and the call-to-action fill
- `--site-block-on-accent` the call-to-action text
- `--site-block-radius` the call-to-action corners and the sheet's bottom corners (fallback `0.5rem`)
- `--site-block-motion` the link colour transition and the fade-out when the sheet closes (fallback `180ms`, the source's fast time). A host value sets both
- `--site-block-motion-rise` each row's rise (fallback `0.55s`, the source's time; the curve is fixed)
- `--site-block-motion-enter` the sheet's fade-in time (fallback `240ms`, written with its unit).

Also:

- **Open state.** Pass `open`, and set it false when `close` fires. This component will not keep that state for you.
- **Focus restore.** On `close('esc')`, put focus back on the button that opened the sheet. Do not do that for `'link'`, `'outside'` or `'button'`.
- **Hover intent.** If the menu opens on hover, start and cancel the close timer from `pointer-leave` and `pointer-enter`. There is no timer in here.
- **A header above the sheet** if the trigger must stay clickable. The overlay defaults to 40, the source's overlay plane (`Z_PLANES.overlay`). The source header sat at 50. `hide-on-scroll-header` defaults to the same 40 (`--site-block-header-z`), so set that variable above 40 or the sheet paints over the button.

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The sheet is `position: fixed`. It is not in the page flow, so opening it does not push the page down. The group grid is one column, two columns from 768px, and twelve columns from 1024px. Side padding is `1.25rem`, `2rem` from 640px, and `2.5rem` from 1024px. The top padding stays `5rem`, which leaves room for a header sitting above the overlay.

While the sheet is open, `document.body.style.overflow` is `hidden`. On close, and on unmount while it is still open, that inline value is put back to whatever it was before (including an empty string, if the host had not set one). Hiding overflow removes the scrollbar, and the page can shift sideways by the scrollbar's width. This unit does not pad the body to cover that shift. If the shift matters, set `scrollbar-gutter: stable` on the root.

## Do not

- Do not keep the open state, the hover timer or the focus return inside a copy of this component. Pass `open` and handle `close`.
- Do not use it as one small dropdown per heading.
- Do not hard-code a site's destinations into a fork. Pass `groups`.
- Do not mark a static row with `href=""`. Leave `href` off. An empty string is not a link, but it is also not how you say "static".
- Do not expect Tailwind, `@apply` or `theme()` to reach into the sheet. The styles are scoped.

## Wrong readings

- The dialog and the nav have separate names (`label` and `navLabel`). The source's `data-menu-panel` attribute, a hook for a site screenshot tool, is dropped.
- When it is mounted with `open` already true, it locks scroll and takes focus at mount, so a server-rendered open sheet behaves like one opened later. The source did so only when `open` changed.
- The words are not in this unit. "Build on MyJackfruit", the audiences, the apps, the use cases and the waiting-list line moved to the `groups` you pass.
- The bottom Close control emits `close('button')`. The source emitted `close('esc')` for that same control. `'esc'` is only the Escape key now, so the host can put focus back for the key and not for the button. `'button'` is the reason added here.
- A row with no `href` stays plain text, as the source's batch 5 left "Who it's for" and the use cases: no `<a>`, no tab stop, no hover change, the default cursor.
- The cream ground and the pith tint are not here. Colour comes from `--site-block-*`.
- The source was Tailwind, `theme()` and `NuxtLink`. Those are written out: scoped CSS, and `linkComponent` (a plain `<a href>` unless the host passes its own link).

## Source

Code: `KaiGilb/myjackfruit-web`, `components/MegaMenu.vue`, commit `aafbf4a10613fefee69ff8b12d4f71ffc9807c60` on `main`. The overlay z-index 40 is `Z_PLANES.overlay` in `utils/zPlanes.ts` at that same commit. The import of that module is not kept; `40` is the default of `zIndex`. The unit's tests are new.
