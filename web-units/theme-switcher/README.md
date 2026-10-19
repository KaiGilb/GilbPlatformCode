# web theme-switcher

A header control for the visitor's colour theme (light, dark, colour-blind safe, or their own accent), with an accent that is kept above WCAG AA, a head script that stops a flash of the wrong theme, and a saved choice. Vue 3 / Nuxt 3. Moved from the Gilb Websites site (Jairam-Gilb/gilb-websites-web, `components/ThemeSwitcher.vue` and `composables/useTheme.ts` on branch `redesign-scrollcraft` b78b1f9; the head script from the snapshot 3b0fe2a, see "Source").

## What this is

`<ThemeSwitcher :modes :backgroundHex :defaultAccent>` draws a disclosure button that opens a panel with one native button per theme (`aria-pressed`, and a check mark on the active one so the choice does not rest on colour). One theme (default id `custom`) opens a colour input; the pick is moved to the nearest shade that has at least 4.5:1 contrast on `backgroundHex`, and the panel says so. A choice is put on `<html>` (default attribute `data-theme`), saved in `localStorage`, and restored when the control mounts. `themeHeadScript(ids, options)` returns the small script that restores it before the first paint.

## What this is not

- Not the colours: the unit holds no theme palette. The host writes the CSS for each theme id (see "Host must supply").
- Not a dark-mode-by-system-setting switch: it does not read `prefers-color-scheme`. A host can choose its default theme from that.
- Not a Nuxt module or a composable: no Nuxt, no `useState`, no design-token file. State lives in the component and in `localStorage`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-theme-switcher`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-theme-switcher
cd web-units/theme-switcher && npm pack --pack-destination <site>/vendor/gilbwebsitecode-theme-switcher
echo <commit> > <site>/vendor/gilbwebsitecode-theme-switcher/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-theme-switcher/kaigilb-gilbwebsitecode-theme-switcher-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-theme-switcher/kaigilb-gilbwebsitecode-theme-switcher-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-theme-switcher'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/theme-switcher`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-theme-switcher'] },
```

Then:

```ts
// nuxt.config.ts: the same options object for the script and the component
import { themeHeadScript } from '@kaigilb/gilbwebsitecode-theme-switcher'
export const THEME_OPTIONS = { storageKey: 'my-theme', accentKey: 'my-accent' }
export default defineNuxtConfig({
  app: { head: { script: [{ tagPosition: 'head', innerHTML: themeHeadScript(['light', 'dark', 'custom'], THEME_OPTIONS) }] } },
})
```

```vue
<script setup lang="ts">
import { ThemeSwitcher } from '@kaigilb/gilbwebsitecode-theme-switcher'
const modes = [
  { id: 'light', label: 'Light', blurb: 'The default.' },
  { id: 'dark', label: 'Dark' },
  { id: 'custom', label: 'Custom accent', blurb: 'Pick your own; kept readable.' },
]
</script>

<template>
  <ThemeSwitcher :modes="modes" background-hex="#ffffff" default-accent="#0c6e78" :options="{ storageKey: 'my-theme', accentKey: 'my-accent' }" />
</template>
```

A site with a Content-Security-Policy hashes the script text into it; the text is fixed for a given list of ids and options.

## What you pass

| Prop | Meaning |
|---|---|
| `modes` | `{ id, label, blurb? }[]`. The ids are the values stored and put on the theme attribute. Built-in icons exist for `light`, `dark`, `colorblind` and `custom`; any other id gets the drop icon |
| `backgroundHex` | the background the custom accent must be readable on, "#rrggbb" (the custom theme's own background) |
| `defaultAccent` | the accent first shown and used by "reset", "#rrggbb" |
| `defaultTheme?` | the theme before a saved choice is read (default: the first mode) |
| `options?` | `{ storageKey, accentKey, themeAttr, accentVar, accentFormat, customId }`. Defaults: `site-theme`, `site-accent`, `data-theme`, `--site-block-accent`, `hex`, `custom`. `accentFormat: 'channels'` writes "R G B" for `rgb(var(--x) / a)` styles. Give the same object to `themeHeadScript` |
| `labels?` | the words on the control (trigger, current, panel, accentTitle, contrast, adjusted, pickAny, reset); default English |

Also exported: `contrastRatio(a, b)`, `nudgeToAA(hex, bgHex, min?, fallbackHex?)`, `AA_MIN`, `hexToRgb`, `rgbToHex`, and `themeOptions`, `applyToRoot`, `persist`, `readStored`, `accentCssValue`.

## Host must supply

- **The themes.** CSS for each id on the theme attribute, setting the host's own variables, e.g. `[data-theme="dark"] { --site-block-bg: #0f1419; --site-block-fg: #eaeef3; ... }` and `color-scheme`. The custom theme should inherit the light set; the unit sets only the accent variable inline. If a theme's CSS is missing, choosing it changes nothing on the page.
- The unit's own look reads the same `--site-block-*` set as every block: `--site-block-fg`, `-muted`, `-bg` (the panel), `-accent` (focus ring, check, active outline), `-success` (the AA tick), `-shadow` (the panel, a whole box-shadow), `-motion` (default `150ms`). It paints itself from the *current* theme, so it previews the theme it offers.
- The custom accent is written to `options.accentVar` (default `--site-block-accent`), so the host's accent usage must read that variable.
- Contrast is measured only against `backgroundHex`. If the custom theme also sets text on the accent, the host checks that pair.

No Tailwind is needed: the styles ship in the component, scoped to it, with their own box sizing.

## Layout stability

The trigger is a fixed 44 px tall button; the panel is absolutely positioned and does not move the page. The server draws the default theme as active and the saved one is shown after hydration, so there is no hydration mismatch; the page's own colours come from the head script and never wait for the component.

## Do not

- Do not skip the head script and expect no flash: the component runs after hydration.
- Do not put a theme's colours in the unit's props; a theme is a whole CSS block per id in the host.
- Do not use an accent below AA on purpose: the guard is the point. A host that must allow it should not use this unit.
- Do not give the head script and the component different `options`; the saved choice would not be found.

## Wrong readings

- "Nudged" means the visitor's pick was moved toward black or white until it cleared 4.5:1 against `backgroundHex`; it is shown with the new ratio. On a mid-grey background no colour may reach 4.5:1; the nearest the maths can get is used and the ratio shown is true.
- The old site animated the colour change for 350 ms with a class on `<html>`. The unit does not; the host can add a class itself.
- Dark and colour-blind-safe palettes from the old site's `design-tokens.json` are not shipped; they are the old site's own.
- Everything saved is the theme id and the accent only. Nothing else is stored, nothing is sent anywhere.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web` `components/ThemeSwitcher.vue` and `composables/useTheme.ts` at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. The synchronous head script was removed from `nuxt.config.ts` on that branch; its last form is in the snapshot `3b0fe2a` (`nuxt.config.ts`, `app.head.script`), which is on the site's main. **The control is not on the live page**: on b78b1f9 it is rendered only by `layouts/default.vue`, the one page uses `layouts/landing.vue`, the head script and the plugin are gone, and `design-tokens.json` has no `themes`, so the site has no dark or colour-blind palette. So RuleGwcunitShareTest part 2 (built and used today) is not met by any site; this unit was built on Kai's instruction (2026-10-20, "build everything") and the gap is stated here. Changed on purpose: no Nuxt `useState`/plugin; no design-token import (the host passes the background and accent); keys, labels, attribute, accent variable and format are props; icons and words are the unit's, the palettes are the host's; the head script is built from the options instead of hand-written; ids are `useId` instead of fixed; the colour maths is the same, with the fallback colour as a parameter. The tests are new.
