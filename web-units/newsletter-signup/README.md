# web newsletter-signup

A newsletter signup band: one labelled email field and a button. It sends the address to the site's subscribe address and answers in place. Vue 3 / Nuxt 3. Moved from the website starter's `components/catalog/NewsletterSignup.vue` (website-engine-a 80ad391).

## What this is

`<NewsletterSignup :heading :subtitle :action-url :button-label>` draws a `<section>` on a 5 % accent tint with an optional `<h2>` and line, and a `<form>`: the email field (its label visually hidden, read by screen readers) and the button. On submit it sends `{ email }` as JSON by POST to `actionUrl` (default `/api/newsletter`). While it sends, the button is disabled. A 2xx answer shows the thanks line and clears the field; any other answer, or a network failure, shows the error line and keeps the address. Both lines appear in a polite live region that is in the page from the start, so a screen reader hears them. The field's id comes from Vue's `useId`, the same on the server and in the browser and different for each signup on a page.

It needs the page's script to send: hydrate it lazily (Nuxt: `defineAsyncComponent`, as the starter's gallery page does).

Also: `postJson(url, body)`, the default sender, and the words (`DEFAULT_NEWSLETTER_LABELS`).

## What this is not

- Not the subscribe address: the site's server, or its mail service, takes the address. This unit only sends it.
- Not a contact form: take `web-units/contact-form`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-newsletter-signup`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-newsletter-signup
cd web-units/newsletter-signup && npm pack --pack-destination <site>/vendor/gilbwebsitecode-newsletter-signup
echo <commit> > <site>/vendor/gilbwebsitecode-newsletter-signup/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-newsletter-signup/kaigilb-gilbwebsitecode-newsletter-signup-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-newsletter-signup/kaigilb-gilbwebsitecode-newsletter-signup-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-newsletter-signup'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/newsletter-signup`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-newsletter-signup'] },
```

Then:

```vue
<script setup lang="ts">
const NewsletterSignup = defineAsyncComponent(() =>
  import('@kaigilb/gilbwebsitecode-newsletter-signup').then((m) => m.NewsletterSignup))
</script>

<template>
  <NewsletterSignup heading="Join the list" subtitle="One email a month." action-url="/api/newsletter" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `heading?`, `subtitle?` | the band's `<h2>` and line |
| `actionUrl?` | where the address is sent, default `/api/newsletter` |
| `buttonLabel?` | the button's words, default "Subscribe" |
| `labels?` | the other words: `email` (the field's label), `placeholder`, `subscribed`, `failed` |
| `send?` | replaces the default sender, for a subscribe address that is not a JSON POST: `(body: { email }) => Promise`; it resolves on success and throws on failure |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-fg` text
- `--site-block-muted` secondary text and borders
- `--site-block-bg` the field background
- `--site-block-accent` the accent (links, buttons, bands)
- `--site-block-on-accent` text on the accent
- `--site-block-success` the success line
- `--site-block-danger` the error line
- `--site-block-radius` button and field corners (default `0.375rem`)
- `--site-block-placeholder` the field's placeholder text (default `#9ca3af`, the gray of Tailwind's reset; pick one that reads on your field background)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

Before submit, nothing loads later. The thanks or error line appears under the form after the answer comes back, and pushes what is below it down by one line.

## Do not

- Do not point `actionUrl` at another site's address; the browser sends from the visitor's page.
- Do not sign anyone up without their press of the button.

## Source

The website starter's `components/catalog/NewsletterSignup.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes and colours. One fix: the starter's version never sent. Its submit read `actionUrl`, which `<script setup>` does not define as a variable, so every press failed before any request and showed the error line (measured 2026-10-19 on a build of 80ad391: no request reached `/api/newsletter`, and the error line showed for a 200 answer). This unit sends `{ email }` and shows the thanks line on a 2xx. Its own `postJson` treats an answer outside 2xx as a failure, as Nuxt's `$fetch` does. Added: the live region, the per-instance id (the field's id is now `nl-email-<useId>`, not the starter's fixed `nl-email`), the replaceable words and sender.
