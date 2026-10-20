# web app-store-button

A "Get the app" store link that draws nothing without an address and tells the host when it is clicked. Vue 3 / Nuxt 3. Moved from the Skalden site (KaiGilb/skalden-web, `components/AppStoreButton.vue`, branch `ws7-website-fork` d8a416328d69c404f44082453a2ed000eebe18e3); the same file is also in the website starter and in myjackfruit-web.

## What this is

`<AppStoreButton href label>` draws an accent-coloured link with an Apple-style glyph and the words, at least 44 px high (a comfortable tap target). It opens the store in a new tab. A click is emitted as an event with the address, the words and where the button is, so the host can connect its own analytics. With no `href` it draws nothing, so a page for a product with no app yet never shows a dead button.

## What this is not

- Not an official store badge: Apple and Google have rules for their badges; this is a plain button with a glyph. A host that needs the badge uses the store's artwork.
- Not analytics: it names no analytics tool and reads no global. The host listens to `click`.
- Not a smart banner or a redirect by device: one address, one link.

## How to take it

Package: `@kaigilb/gilbwebsitecode-app-store-button`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-app-store-button
cd web-units/app-store-button && npm pack --pack-destination <site>/vendor/gilbwebsitecode-app-store-button
echo <commit> > <site>/vendor/gilbwebsitecode-app-store-button/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-app-store-button/kaigilb-gilbwebsitecode-app-store-button-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-app-store-button/kaigilb-gilbwebsitecode-app-store-button-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-app-store-button'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/app-store-button`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-app-store-button'] },
```

Then:

```vue
<script setup lang="ts">
import { AppStoreButton, type AppStoreClick } from '@kaigilb/gilbwebsitecode-app-store-button'
function onClick(e: AppStoreClick) { /* send e to your analytics */ }
</script>

<template>
  <AppStoreButton href="https://apps.example.test/app/id1" label="Get the app" @click="onClick" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `href?` | the store address; empty or missing draws nothing |
| `label?` | the visible words (default "Get the app") |
| `ariaLabel?` | a longer name for screen readers, e.g. "Get the app: Example on the App Store". Keep the visible words inside it. Left out, the visible words are the name |
| `variant?` | `header` (default, compact) or `inline` (a little larger, for a place in the text) |
| `location?` | where on the page the button is (default "header"); sent with the event |

Event `click({ href, label, location })`. The unit never stops or delays the link.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-accent` the button's background and focus outline
- `--site-block-on-accent` the words and glyph on it (default white). Check the pair reaches 4.5 : 1; the Skalden site's dark-on-gold pair was chosen for 7.8 : 1
- `--site-block-radius` the corner (default `1rem`)
- `--site-block-motion` the hover fade's time (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The button is in the server's HTML at its final size: a 44 px minimum height, an inline SVG glyph and no web font of its own. With no address it takes no space at all.

## Do not

- Do not pass a value for `href` that is not a store address you control; the button opens it in a new tab.
- Do not put a counter or a price in `label`; keep it a plain call to action.
- Do not rely on the event for anything the visitor must not lose: it is for measuring, and a visitor with a blocker still follows the link.

## Wrong readings

- The Skalden file read the address from the site's config, the words and the screen-reader name from its i18n catalogue, and called `window.posthog`. None of that is in the unit: the host passes `href`, `label` and `ariaLabel`, and listens to `click`. A site that sent `appstore_click` to PostHog does so in its own handler with `location` and `label`.
- The Skalden file always set an `aria-label` (the name of the site), which hid the visible words from the name. Here the visible words are the name unless `ariaLabel` is passed, so "label in name" holds. This is a deliberate change.
- The unit's event is named `click`, as the old component's native one was, but it carries an object, not the mouse event.

## Source

Provenance, a one-time exception ("not a precedent"): Kai allowed, in his own word on 2026-10-20, taking code from the Skalden site's branch `ws7-website-fork` at commit `d8a416328d69c404f44082453a2ed000eebe18e3` (KaiGilb/skalden-web), which the site's owner has not merged to a main branch (the site has no `main`; production is built from this branch), for this one run. The library rule `RuleGwcunitShareTest` part 1 and the process entry `ProcSwcEnSource` say shared code is on the site's main; parts 2 and 3 and the Agent.Tester PASS still hold. Steps that could not be done for that reason are listed in the run's record (STATE-AgentCoder.md in 7.Project/Active/GilbPlatformCode/04Other/2026-10-20-SkaldenUnits-instruments/). A later version of this unit is taken from the site's main once the branch is merged.

Code: `KaiGilb/skalden-web`, `components/AppStoreButton.vue` at `d8a416328d69c404f44082453a2ed000eebe18e3`. Written out without Tailwind, `@apply`, `theme()`, `useAppConfig`, `useI18n` or PostHog: the same size, weight, glyph path, padding and hover. Changed on purpose: see "Wrong readings". The unit's tests are new.
