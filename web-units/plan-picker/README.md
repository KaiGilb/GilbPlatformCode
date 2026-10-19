# web plan-picker

Plans as cards a visitor picks, with an optional collapsed list of one-off price extras. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (Jairam-Gilb/gilb-websites-web, `pages/index.vue` pricing section and `composables/usePlanPick.ts`, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<PlanPicker :plans :label>` draws a radio group of plan cards: a click, a tap or the arrow keys pick one, and the picked card is lifted and takes the accent colour. The featured plan starts picked. Each card is preceded by a visually hidden radio and the look follows `:checked`, so the pick works before the page's script runs and with JavaScript off. The unit tells the host which plan is picked (`v-model` and a `pick` event) so a form can send it. With `extras`, a collapsed native `<details>` row lists one-off add-ons (name, price, a line) under the cards.

## What this is not

- Not a pricing display: `pricing` shows plans with a link button each and no selection. This is a selection control.
- Not a checkout or a quantity picker: one plan out of several, no sum, no basket.
- Not the form that sends the pick: the host reads `v-model` or `pick` and puts the plan in its own form (a unit that shows and a unit that writes are two units).

## How to take it

Package: `@kaigilb/gilbwebsitecode-plan-picker`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-plan-picker
cd web-units/plan-picker && npm pack --pack-destination <site>/vendor/gilbwebsitecode-plan-picker
echo <commit> > <site>/vendor/gilbwebsitecode-plan-picker/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-plan-picker/kaigilb-gilbwebsitecode-plan-picker-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-plan-picker/kaigilb-gilbwebsitecode-plan-picker-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-plan-picker'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/plan-picker`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-plan-picker'] },
```

Then:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { PlanPicker, type Plan, type PlanPick } from '@kaigilb/gilbwebsitecode-plan-picker'
const plans: Plan[] = [
  { name: 'Start', price: 'From 1 000', features: ['One page'] },
  { name: 'Grow', price: 'From 3 000', features: ['Ten pages'], featured: true, featuredNote: 'Most chosen' },
]
const picked = ref('')
function onPick(p: PlanPick) { /* p.byVisitor is false for the default nobody touched */ }
</script>

<template>
  <PlanPicker v-model="picked" label="Pricing" :plans="plans" @pick="onPick" />
</template>
```

## What you pass

| Prop / event | Meaning |
|---|---|
| `plans` | `{ name, price, features[], featured?, featuredNote? }[]`, plain text. `name` is the pick's value and the key, so keep names distinct |
| `label` | the group's accessible name, e.g. "Pricing" |
| `modelValue?` | the picked plan's name (`v-model`). Without it the featured plan starts picked and the browser holds the pick |
| `name?` | the radios' shared name; one per instance by default |
| `extras?` | `{ heading?, teaser?, fromPrice?, openLabel?, closeLabel?, body?, items: { name, price, body? }[] }`. All texts are yours; none is built in. No items draws nothing |
| `headingLevel?` | the plan names' and the extras heading's level, 2 to 6 (default 3) |
| `itemAttrs?` | attributes put on each card's wrapper and on the extras wrapper, e.g. `{ 'data-reveal': '' }` |
| `update:modelValue` | the plan the visitor picked |
| `pick` | `{ plan, byVisitor }`, on mount and on every change. `byVisitor` is true once the visitor has changed the pick, and for a pick made before the script ran; it is false for the featured default nobody touched |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text, and the cards' tint, border and dividers (a few percent of it)
- `--site-block-muted` the features and the extras' lines
- `--site-block-accent` the picked card's price, border and glow, the featured note, the focus ring and the extras' cue and icon

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font. The cards are three across from 1024 px wide and stacked under that; the lift is wide screens only. Motion (the lift, the colour glide, the plus turning to a minus) is declared only for `prefers-reduced-motion: no-preference`.

## Layout stability

The picked card is taller than the others (more padding) and lifted, and it glides there. That change moves only the cards of this block, on a visitor's own click; nothing moves on its own. The extras open only when asked, and push what is below them down.

## Do not

- Do not put markup in any text; it is drawn as plain text.
- Do not use it for a choice that has a price you owe the moment it is picked: the pick is a preference for a form to carry, nothing is charged or stored.
- Do not give two plans the same `name`.

## Wrong readings

- The pick is the radio's own state, not the unit's: before the script runs the browser holds it. The unit reads it back when it starts (a pre-script pick is reported as the visitor's) and puts it back if hydration would undo it.
- A `modelValue` makes the host the owner: changing it moves the check. Without it the unit is uncontrolled.
- The lifted card's frosted backdrop blur and the scene behind it on the Gilb Websites page are the page's, not the unit's.
- The page's reveal on scroll and the booking prompt under the extras are not in the unit (`itemAttrs` and the host's own markup).
- The old composable `usePlanPick` (Nuxt `useState`) is replaced by `v-model` and `pick`; the unit has no Nuxt import.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web` at `b78b1f9e247d23823ddf75c41c46d252adc393e8`: `pages/index.vue` (pricing: plan cards, extras), `composables/usePlanPick.ts` (`bindPlanPick`), `assets/css/main.css` (`.sc-plan-*`, `.sc-extras*`, `.sc-faq-icon`). Written out without Tailwind. Changed on purpose: the radio ids and name are per instance (`useId`), the pick is reported as an event, the extras' texts all come from props, and the extras' open/close icon and cue are inside the unit instead of the shared FAQ classes. The unit's tests are new.
