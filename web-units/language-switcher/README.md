# web language-switcher

A flag button that opens a short list of the other languages. Vue 3 / Nuxt 3. Moved from the Skalden site (KaiGilb/skalden-web, `components/LanguageSwitcher.vue` and `FlagIcon.vue`, branch `ws7-website-fork` d8a416328d69c404f44082453a2ed000eebe18e3).

## What this is

`<LanguageSwitcher :languages :current>` draws a button showing the current language's flag and a small arrow. A click opens a list of the other languages, each with its flag and its own name. Choosing one emits `select(code)` and closes the list. Escape, a press outside, or tabbing out closes it. With `hrefFor` each language is a real link. Flags are inline SVG (flag emoji draw as two letters on Windows).

## What this is not

- Not a router or an i18n library: it names none. The host listens to `select` (or follows the links) and changes the language itself.
- Not a listbox or a menu in the ARIA sense: it is a disclosure, a button that shows and hides a list of ordinary links or buttons.
- Not a translator: it holds no site words; every name and label is a prop.

## How to take it

Package: `@kaigilb/gilbwebsitecode-language-switcher`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-language-switcher
cd web-units/language-switcher && npm pack --pack-destination <site>/vendor/gilbwebsitecode-language-switcher
echo <commit> > <site>/vendor/gilbwebsitecode-language-switcher/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-language-switcher/kaigilb-gilbwebsitecode-language-switcher-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-language-switcher/kaigilb-gilbwebsitecode-language-switcher-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-language-switcher'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/language-switcher`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-language-switcher'] },
```

Then:

```vue
<script setup lang="ts">
import { LanguageSwitcher, type LanguageOption } from '@kaigilb/gilbwebsitecode-language-switcher'
const languages: LanguageOption[] = [
  { code: 'en', name: 'English', flag: 'us' },
  { code: 'nb', name: 'Norsk', flag: 'no' },
]
function onSelect(code: string) { /* the host's own language change */ }
</script>

<template>
  <LanguageSwitcher :languages="languages" current="en" @select="onSelect" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `languages` | `LanguageOption[]`: `{ code, name, flag? }`. `name` is the language's own name. `flag` is data: a built-in key (`us`, `gb`, `no`, `de`, `fr`, `es`; `flagKeys` is exported) or any other text, which is drawn as a badge with its first two letters. With no `flag` the badge shows the code. The unit never maps a language to a flag itself: the same `en` may be `us` on one site and `gb` on another |
| `current` | the code of the language the page is in; a code not in the list falls back to the first language |
| `hrefFor?` | `(code) => address`. Each item becomes a link with that address, `hreflang` and `lang`; `select` is still emitted on click |
| `buttonLabel?` | the button's name; `{name}` is replaced by the current language's name (default "Language: {name}. Change language") |
| `listLabel?` | the list's name (default "Languages") |
| `placement?` | `end` (default) lines the list up with the button's right edge, `start` with its left |

Slot `flag` (scoped `{ language }`) replaces the drawn flag on the button and the items, for a host that has its own flags. Event `select(code)`.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` the flag's hairline and the list's text and shadow
- `--site-block-muted` the button's arrow, the list's border and hover tint
- `--site-block-bg` the list's background (default white)
- `--site-block-accent` the focus outline
- `--site-block-motion` the transitions' time (default `150ms`)
- `--site-block-z-popover` the list's stacking level (default `50`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The closed switcher is one fixed-size button (the flag is 22 by 16 px) in the server's HTML. The open list is out of flow (`position: absolute`), so opening it moves nothing.

## Do not

- Do not use the flag to carry the meaning: a flag stands for a country, not a language. The language's own name is always next to it in the list, and the button's name says it; keep both.
- Do not give two languages the same `code`; codes are the list's keys.
- Do not put the switcher where an ancestor has `overflow: hidden`; the open list would be cut off.

## Wrong readings

- **Deliberate change from Skalden:** the old list was `role="listbox"` made of buttons with `role="option"`, which is not the listbox pattern (options should be reached with arrow keys inside one tab stop). It is now a disclosure: `aria-expanded` and `aria-controls` on the button, a list of ordinary buttons or links reached with Tab. The arrow keys, Home and End also move between the items, and ArrowDown or ArrowUp on the button opens the list and focuses the first or last item. What the visitor does (open, pick, close) is the same.
- **Deliberate change:** the old full-screen invisible click-away button is gone. A press outside, or focus moving outside, closes the list; Escape closes it and returns focus to the button, even when focus was still on the page (Safari does not focus a button on a click).
- **Deliberate change:** English no longer shows the US flag by code. Skalden did that in the component; here `flag` is data, and the Skalden choice is `{ code: 'en', flag: 'us' }`.
- The list is drawn only after the script runs (as Skalden's was). With no script the button does nothing. A host that needs a no-script switcher should also render its own plain links.
- The unit does not change the language: `select` only tells the host.

## Source

Provenance, a one-time exception ("not a precedent"): Kai allowed, in his own word on 2026-10-20, taking code from the Skalden site's branch `ws7-website-fork` at commit `d8a416328d69c404f44082453a2ed000eebe18e3` (KaiGilb/skalden-web), which the site's owner has not merged to a main branch (the site has no `main`; production is built from this branch), for this one run. The library rule `RuleGwcunitShareTest` part 1 and the process entry `ProcSwcEnSource` say shared code is on the site's main; parts 2 and 3 and the Agent.Tester PASS still hold. Steps that could not be done for that reason are listed in the run's record (STATE-AgentCoder.md in 7.Project/Active/GilbPlatformCode/04Other/2026-10-20-SkaldenUnits-instruments/). A later version of this unit is taken from the site's main once the branch is merged.

Code: `KaiGilb/skalden-web`, `components/LanguageSwitcher.vue` and `components/FlagIcon.vue` at `d8a416328d69c404f44082453a2ed000eebe18e3`. Written out without Tailwind or `useI18n`: the same flag drawings for the United States and Norway (more added), the same sizes and the same open and close. Changed on purpose: see "Wrong readings". The unit's tests are new.
