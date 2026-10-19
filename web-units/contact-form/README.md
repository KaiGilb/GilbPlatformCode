# web contact-form

A contact form: labelled Name, Email and Message fields and a send button, optionally guarded by Cloudflare Turnstile. It sends the message to the site's message address and answers in place. Vue 3 / Nuxt 3. Moved from the website starter's `components/ContactForm.vue` (website-engine-a 80ad391), the one block that was not in `components/catalog/` but was listed in its `catalog.json`.

## What this is

`<ContactForm :action-url :turnstile-site-key>` draws a `<form>` with three required, labelled fields (Name, Email, Message) and the button. With `turnstileSiteKey` it also draws the Cloudflare Turnstile widget's placeholder (`<div class="cf-turnstile" data-sitekey>`); the page loads Turnstile's script, which draws the widget and writes its token into a hidden input inside it. On submit the form sends `{ name, email, message, turnstileToken }` as JSON by POST to `actionUrl` (default `/api/contact`), reading the token only from inside this form. While it sends, the button is disabled and reads "Sending…". As the starter's form did, it shows the sent line only for a 2xx answer whose body is not empty and is not a falsy JSON value (`false`, `0`, `null`, `""`); such an answer, any other status or a network failure shows the error line. Both lines appear in a polite live region that is in the form from the start. The ids come from Vue's `useId`, the same on the server and in the browser and different for each form on a page.

It needs the page's script to send: hydrate it lazily (Nuxt: `defineAsyncComponent`, as the starter's contact page does).

Also: `postJson(url, body)`, the default sender, the words (`DEFAULT_CONTACT_LABELS`) and the `ContactMessage` type.

## What this is not

- Not the server side. The site's own handler receives the message, checks the Turnstile token with its secret and sends the mail; the website starter's is `functions/api/contact.ts` (Resend). The secrets stay there, never in this unit.
- Not Turnstile's script: the page loads it, only where the form is.
- Not a newsletter signup: take `web-units/newsletter-signup`.

## How to take it

Package: `@kaigilb/gilbwebsitecode-contact-form`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-contact-form
cd web-units/contact-form && npm pack --pack-destination <site>/vendor/gilbwebsitecode-contact-form
echo <commit> > <site>/vendor/gilbwebsitecode-contact-form/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-contact-form/kaigilb-gilbwebsitecode-contact-form-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-contact-form/kaigilb-gilbwebsitecode-contact-form-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-contact-form'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/contact-form`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-contact-form'] },
```

Then:

```vue
<script setup lang="ts">
const ContactForm = defineAsyncComponent(() =>
  import('@kaigilb/gilbwebsitecode-contact-form').then((m) => m.ContactForm))
const config = useRuntimeConfig()
useHead({ script: config.public.turnstileSiteKey
  ? [{ src: 'https://challenges.cloudflare.com/turnstile/v0/api.js', async: true, defer: true }] : [] })
</script>

<template>
  <ContactForm :turnstile-site-key="config.public.turnstileSiteKey" />
</template>
```

## What you pass

| Prop | Meaning |
|---|---|
| `actionUrl?` | where the message is sent, default `/api/contact` |
| `turnstileSiteKey?` | the Turnstile site key (public); with it the widget's placeholder is drawn and its token sent |
| `labels?` | every word: `name`, `email`, `message`, `send`, `sending`, `sent`, `failed` |
| `send?` | replaces the default sender: `(body: ContactMessage) => Promise`; it resolves with the answer (a falsy answer is not taken as sent) and throws on failure |

## Host must supply

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-muted` secondary text and borders
- `--site-block-bg` the field background
- `--site-block-accent` the accent (links, buttons, bands)
- `--site-block-on-accent` text on the accent
- `--site-block-success` the success line
- `--site-block-danger` the error line
- `--site-block-radius` button and field corners (default `0.375rem`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset such as Tailwind's preflight; text inherits the page's font. Only the website starter, which has that reset, has been compared before and after.

The website starter maps them in `assets/css/main.css` from its brand tokens.

## Layout stability

Before submit, the fields have their size from the start. With a Turnstile key, the widget is drawn into its placeholder by Turnstile's script after the page loads, and pushes the button down when it appears; without a key there is no widget. The sent or error line appears under the button after the answer comes back.

## Do not

- Do not put the Turnstile secret or a mail key in the site's client code; the server handler holds them.
- Do not point `actionUrl` at another site's address.

## Source

The website starter's `components/ContactForm.vue` (website-engine-a 80ad391), written out without Tailwind: the same sizes and colours. The site key is a prop instead of the starter's runtime config, the Turnstile token is read inside the form instead of the whole page, and its `$fetch` call is now the unit's own `postJson`. Added: the live region, the per-instance ids (the fields' ids are now `cf-name-<useId>` and so on, not the starter's fixed `cf-name`), the replaceable words and sender.
