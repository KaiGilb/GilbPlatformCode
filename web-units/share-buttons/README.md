# web share-buttons

A row of share links (X, Facebook, WhatsApp, Reddit, email) and a copy-link button with a polite "copied" status. Vue 3 / Nuxt 3. Moved from the Skalden site's blog (KaiGilb/skalden-web, `components/ShareButtons.vue`, branch `ws7-website-fork` d8a416328d69c404f44082453a2ed000eebe18e3).

## What this is

`<ShareButtons :url :title>` draws round icon buttons: one link per share target and a button that copies the page address. The links are plain anchors, so they work with no script. The copy button uses the Clipboard API and says "Link copied" for two seconds in a live region that is always in the page, so a screen reader announces it. Every word, and the list of targets, is a prop.

## What this is not

- Not a counter of shares or likes: it loads no third-party script and asks no network for numbers.
- Not the browser's own share sheet (`navigator.share`): it uses links, so it works on a desktop with no script. A host that wants the share sheet can add it beside this.
- Not a follow-us bar: it shares *this page*, not a profile.

## How to take it

Package: `@kaigilb/gilbwebsitecode-share-buttons`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-share-buttons
cd web-units/share-buttons && npm pack --pack-destination <site>/vendor/gilbwebsitecode-share-buttons
echo <commit> > <site>/vendor/gilbwebsitecode-share-buttons/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-share-buttons/kaigilb-gilbwebsitecode-share-buttons-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-share-buttons/kaigilb-gilbwebsitecode-share-buttons-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-share-buttons'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/share-buttons`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-share-buttons'] },
```

Then:

```vue
<script setup lang="ts">
import { ShareButtons } from '@kaigilb/gilbwebsitecode-share-buttons'
</script>

<template>
  <ShareButtons url="https://example.test/blog/a-post" title="A post" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `url` | the absolute address to share |
| `title` | the page title, used as the share text |
| `heading?` | the short word before the buttons (default "Share"); empty draws none |
| `shareOn?` | the start of each link's name (default "Share on"), so "Share on X" |
| `copyLabel?`, `copiedText?` | the copy button's name (default "Copy link") and what is said after it (default "Link copied") |
| `copyFailedText?`, `copyFallbackLabel?` | said and shown when the clipboard could not take the address (default "Could not copy. Select the link below and copy it."), and the name of the read-only field that then shows the address (default "Link to copy") |
| `newTabText?` | added to the name of a link that opens a new tab (default "(opens in a new tab)") |
| `targets?` | `ShareTarget[]`: `{ id, label, href, icon, newTab? }`. `href` is a template with `{url}`, `{title}` and `{text}` (title and address joined), each URL-encoded; `icon` is an SVG path in a 24 by 24 box; `newTab: false` for `mailto:`. The default is `defaultShareTargets` (X, Facebook, WhatsApp, Reddit, email), exported so a host can filter or extend it |
| `resetMs?` | how long "copied" stays (default 2000) |

Event: `copy(ok)`: the copy button was used, and the clipboard did (`true`) or did not (`false`) take the address. Use it for analytics or to show your own message when it failed. `shareHref(template, url, title)` is exported too.

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-muted` the heading, the button text and the button's border (30 % of it)
- `--site-block-accent` the hover and focus colour, the focus outline and the "copied" text
- `--site-block-motion` the colour transition's time (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The row is in the server's HTML at its final size: fixed 40 px round buttons, no image and no web font. The "copied" words appear in the row's last place and can wrap the row to a new line on a very narrow screen; nothing else moves.

## Do not

- Do not pass an address that is not absolute; the networks need the full address.
- Do not add a network whose link you have not read: a share link sends the page address and title to that network when it is clicked, so choose the list on purpose.
- Do not hide the copy button's words: they are the button's only name (the icon is hidden from screen readers).

## Wrong readings

- The links' names are built from words, not from the icon: "Share on X (opens in a new tab)". The Skalden file named them with a fixed English `aria-label`; here they come from props.
- The "copied" status is always in the page, empty until a copy. The Skalden file drew it only after the copy, which many screen readers do not announce. This is a deliberate change.
- **Deliberate change (tester R1 D5):** if the clipboard is denied or absent (an old browser, a page that is not secure, a permission refused), the live region says `copyFailedText` and a read-only field with the address appears with its text selected and focused, so the visitor can copy it by hand (Ctrl/Cmd+C). `copy(false)` is still emitted. The field stays until the next copy attempt succeeds. Skalden's button did nothing.
- The email link says "Share on email"; Skalden's said "Share via email". Pass `shareOn` and a `targets` entry to word it your way.

## Source

Provenance, a one-time exception ("not a precedent"): Kai allowed, in his own word on 2026-10-20, taking code from the Skalden site's branch `ws7-website-fork` at commit `d8a416328d69c404f44082453a2ed000eebe18e3` (KaiGilb/skalden-web), which the site's owner has not merged to a main branch (the site has no `main`; production is built from this branch), for this one run. The library rule `RuleGwcunitShareTest` part 1 and the process entry `ProcSwcEnSource` say shared code is on the site's main; parts 2 and 3 and the Agent.Tester PASS still hold. Steps that could not be done for that reason are listed in the run's record (STATE-AgentCoder.md in 7.Project/Active/GilbPlatformCode/04Other/2026-10-20-SkaldenUnits-instruments/). A later version of this unit is taken from the site's main once the branch is merged.

Code: `KaiGilb/skalden-web`, `components/ShareButtons.vue` at `d8a416328d69c404f44082453a2ed000eebe18e3`. Written out without Tailwind, `@apply` or `useI18n`: the same button size (40 px), border (30 % of the muted colour), icons and share links. Changed on purpose: words and targets are props, the status region is always present, new-tab cue in the name, a `copy` event, the timer is cleared on unmount. The unit's tests are new.
