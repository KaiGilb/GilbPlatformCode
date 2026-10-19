# web entry-after-paint

Moves a Nuxt page's entry script to after the first paint (or the first interaction) and holds a form submit made before the page's script is ready. Strings in, strings out: no component, no Nitro import. Moved from the Gilb Websites site (Jairam-Gilb/gilb-websites-web, `server/lib/entry-after-paint.mjs` and `server/plugins/entry-after-paint.ts`, branch `redesign-scrollcraft` b78b1f9).

## What this is

`rewriteEntry(html)` replaces the page's `<script type="module" src="/_nuxt/….js" crossorigin>` tag with one small inline script that adds the same script once the page has loaded, at the visitor's first pointer, touch, key, focus, scroll, wheel, mouse or click event, or after 3 s at the latest, and never before DOMContentLoaded. The same inline script holds a submit of any form marked `data-sc-guard` that is made before the page's script owns it: no navigation, nothing typed is lost, the form gets `data-sc-pending` and `aria-busy`, and the download starts at once. `claimGuardedForm(form)` is the form's side. `entryStatus(html)` and `scripts/check-rendered-entry.mjs` say whether a built page was really rewritten.

## What this is not

- Not a Vue component and not a Nitro plugin: the plugin is three lines in the site (below). The unit has no `.vue` file, so it does not fully fit the library's usual shape (see "Source").
- Not a hydration delay: it does not decide when Vue hydrates. Pair it with one if you want that.
- Not the form: the form's fields, validation and sending are the site's. Only the hold-and-replay handshake is here.
- Not for a page without JavaScript: with JavaScript off none of this runs and the form behaves as before.

## How to take it

Package: `@kaigilb/gilbwebsitecode-entry-after-paint`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-entry-after-paint
cd web-units/entry-after-paint && npm pack --pack-destination <site>/vendor/gilbwebsitecode-entry-after-paint
echo <commit> > <site>/vendor/gilbwebsitecode-entry-after-paint/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-entry-after-paint/kaigilb-gilbwebsitecode-entry-after-paint-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-entry-after-paint/kaigilb-gilbwebsitecode-entry-after-paint-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-entry-after-paint'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/entry-after-paint`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.
Then the Nitro plugin, in the site (`server/plugins/entry-after-paint.ts`):

```ts
import { rewriteRenderParts } from '@kaigilb/gilbwebsitecode-entry-after-paint'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html) => rewriteRenderParts(html))
})
```

The package's server code is plain JavaScript (`lib/*.mjs`, generated from `src/*.ts` by `npm run build:lib`; a test fails if it is stale), because Nitro does not compile TypeScript inside `node_modules` (Agent.Tester R1 D2: `RollupError ... Expected '{', got 'type'`). Add the package to `build.transpile` in `nuxt.config.ts` (`build: { transpile: ['@kaigilb/gilbwebsitecode-entry-after-paint'] }`); the proving build had it, and a build without it was not run.

Proved with a real build: website-engine-a 81362f4, the packed copy taken as above, the plugin file above, `pnpm exec nuxt generate` exit 0, then `node node_modules/@kaigilb/gilbwebsitecode-entry-after-paint/scripts/check-rendered-entry.mjs dist` exit 0 ("17 page(s) rewritten, none left unmoved"). The same build without the plugin file: exit 1 ("17 page(s) still load the entry in <head>, 0 rewritten"). Fresh-install check: PASS.

In the form's own code, when it mounts: `if (claimGuardedForm(formEl)) submit()`. Mark the form `data-sc-guard`. Read what was typed before hydration yourself (the old site read each field before its `v-model` mounted).

After every build, run the check and make it fail the build:

```sh
node node_modules/@kaigilb/gilbwebsitecode-entry-after-paint/scripts/check-rendered-entry.mjs dist
```

## What you pass

| Export | Meaning |
|---|---|
| `rewriteEntry(html)` | one HTML chunk in, the chunk out; unchanged when there is no matching tag |
| `rewriteRenderParts({ head, bodyAppend })` | the Nitro `render:html` hook's arrays, rewritten in place |
| `loaderScript(src)` | the inline script's text for one entry URL (no `<script>` tags) |
| `entryStatus(html)` | `moved`, `unmoved` (a `/_nuxt/` module script is still in the page) or `none` |
| `claimGuardedForm(form)` | the form's mounted-hook helper; returns true when a held submit must be replayed |
| `ENTRY_TAG`, `FALLBACK_MS` (3000), `TRIGGER_EVENTS`, `GUARD`, `LOADER_MARK` | the constants |

## Host must supply

- A Nuxt site whose entry tag is exactly `<script type="module" src="/_nuxt/NAME.js" crossorigin></script>` (Nuxt 3.21 renders this; see "Wrong readings").
- If the site has a Content-Security-Policy, the inline script is hashed into it like any other inline script (it adds one inline script per page; its text differs only in the entry URL).
- Nothing in CSS: the unit has no styles.

## Layout stability

n/a: it draws nothing. It moves a script, not content. A guarded form that is held shows `aria-busy`; style that if you want a visible state.

## Do not

- Do not use it on a page whose first paint needs the script (client-only content): the content would wait for the first interaction or the 3 s timer.
- Do not rely on the rewrite silently: run `check-rendered-entry.mjs` in the build.
- Do not mark a form `data-sc-guard` without calling `claimGuardedForm` when it mounts, or a submit made early is held for ever.

## Wrong readings

- The package's `exports` point at `lib/*.mjs` (what Nitro and Node load); `src/*.ts` is the source and the types (`types` export). Edit `src/`, then run `npm run build:lib` and commit `lib/`.

- **It matches one exact tag.** If a Nuxt upgrade changes the tag (another attribute order, `crossorigin=""`, a `nonce`, an `async`), nothing matches and the page ships as before, just slower. That is safe and silent; the build check is what makes it loud (tests plant five such changes). The tag was written for Nuxt 3.21 (the website starter locks 3.21.6); this unit's tests use a hand-written page, not a Nuxt build, because no Nuxt was installed here (see "Source").
- "After first paint" is a measured gain on the old site (phone Lighthouse 88 to 98); it is not promised for another site.
- The held submit is replayed by the form, not by this unit.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `server/lib/entry-after-paint.mjs`, `server/plugins/entry-after-paint.ts` and the 8 tests in `server/__tests__/entry-after-paint.test.mjs` at `b78b1f9e247d23823ddf75c41c46d252adc393e8`; the form side from `components/ContactForm.vue` at the same commit. Changed on purpose: TypeScript; the loader starts with a mark comment (so a built page can be read back, and its CSP hash differs from the old site's); `"<"` is escaped in the entry URL; `entryStatus`, the build check and `claimGuardedForm` are new; the Nitro plugin is left to the site (the unit imports nothing); the 8 tests are ported and extended. **Shape gaps:** the library's shape rule expects a `.vue` file and `vue` as a peer dependency; this unit has neither, and its `typecheck` runs `vue-tsc` only because that is the frame's script. The proposal asked whether this belongs in the website starter instead of `web-units/`: it is a server plugin, not a block, so a starter-side home may fit better; this unit is the piece a starter would import either way.
