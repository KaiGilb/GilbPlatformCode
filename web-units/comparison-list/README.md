# web comparison-list

A comparison of a typical result against ours, one row per topic, as a semantic list. Vue 3 / Nuxt 3. Moved from the Gilb Websites landing page (Jairam-Gilb/gilb-websites-web, `pages/index.vue`, the "typical agency against us" rows, branch `redesign-scrollcraft` b78b1f9).

## What this is

`<ComparisonList :rows :themLabel :usLabel>` draws a list with one item per row: the topic as a heading, then the typical answer, then ours (marked with a check). From 768 px wide it is three columns under a column header, with the "ours" column tinted and closed at the top and bottom; under that, each row is a card. It needs no script: the server's HTML holds everything, and the layout change is CSS only.

## What this is not

- Not a `<table>`: it is a list on purpose, so it reads the same in a narrow card and never needs table navigation to follow a row.
- Not a feature matrix with ticks and crosses per plan: it compares two answers in words.
- Not a pricing table: that is `pricing`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-comparison-list`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-comparison-list
cd web-units/comparison-list && npm pack --pack-destination <site>/vendor/gilbwebsitecode-comparison-list
echo <commit> > <site>/vendor/gilbwebsitecode-comparison-list/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-comparison-list/kaigilb-gilbwebsitecode-comparison-list-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-comparison-list/kaigilb-gilbwebsitecode-comparison-list-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-comparison-list'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/comparison-list`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository.

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-comparison-list'] },
```

Then:

```vue
<script setup lang="ts">
import { ComparisonList, type ComparisonRow } from '@kaigilb/gilbwebsitecode-comparison-list'
const rows: ComparisonRow[] = [
  { topic: 'Speed', them: 'Heavy themes, often slow on phones', us: 'Fast, measured on your live site before you accept' },
]
</script>

<template>
  <ComparisonList :rows="rows" them-label="Typical web agency" us-label="Example Studio" them-short="Typical:" us-short="Us:" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `rows` | `{ topic, them, us }[]`, plain text. Topics are the list's keys, so keep them distinct. No rows draws nothing |
| `themLabel` | the left column's full name: the column header, and read before each left answer |
| `usLabel` | the right column's full name |
| `themShort?`, `usShort?` | short forms drawn before each answer on phones only (e.g. "Typical:", "Us:"). Left out when not given |
| `headingLevel?` | the topic's level, 2 to 6 (default 3). Pick the level under your section's heading |
| `rowAttrs?` | attributes put on the column header and on every row, e.g. `{ 'data-reveal': '' }` for a scroll reveal the site owns |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text, and the rows' tint and dividers (a few percent of it)
- `--site-block-muted` the typical answers and the typical column header
- `--site-block-accent` the "ours" column's tint, edges, header, check mark and short label

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font.

## Layout stability

Everything is in the server's HTML at its final size: no image, no script and no web font is needed to size it. The wide layout's column widths are fixed (20 % topic, 34 % typical, the rest ours), so a long answer grows its row, not the columns.

## Do not

- Do not put markup in `topic`, `them` or `us`; they are drawn as plain text.
- Do not name a competitor in `themLabel` or the typical answers unless you can show it; say what is typical.
- Do not use more rows than a reader will read; the unit has no "show more".

## Wrong readings

- A screen reader hears the full column names, not the short labels or the column header; those are hidden from it on purpose, so they are not repeated.
- The columns change at 768 px of the *viewport*, not of the unit's container.
- The Gilb Websites page puts a scroll reveal on the header and each row; pass it as `rowAttrs`. The unit has no motion of its own.
- The page's card look (a frosted blur behind the phone cards) is not in the unit.

## Source

Provenance, a one-time exception: this code was taken from the site's branch `redesign-scrollcraft` at commit `b78b1f9e247d23823ddf75c41c46d252adc393e8`, which is what websites.gilb.com serves, and which has not been merged to the site's `main` (`3b0fe2a`). The library rule `RuleGwcunitShareTest` and the process entry condition `ProcSwcEnSource` say shared code is on the site's main. Kai allowed taking this code from the branch for this one run ("1", 2026-10-20). It is not a precedent: when the site's branch is merged, take the merge commit's copy of this file for the next version.

Code: `Jairam-Gilb/gilb-websites-web`, `pages/index.vue` (the comparison block) at `b78b1f9e247d23823ddf75c41c46d252adc393e8`. Written out without Tailwind: the same sizes, spacing, column widths and dividers, with the accent, text and muted colours read from `--site-block-*`. The unit's tests are new.
