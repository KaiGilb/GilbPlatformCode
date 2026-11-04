# web waitlist-form

A waiting-list form: labelled questions, email required and the rest optional, choice questions as radio groups, an optional collection notice above the button, and a Cloudflare Turnstile check that loads only when it is needed. It posts JSON to the site's own address and answers in place. Vue 3 / Nuxt 3. Moved from KaiGilb/myjackfruit-web `components/WaitlistForm.vue` (main, `aafbf4a10613fefee69ff8b12d4f71ffc9807c60`); the field rules were read from `workers/waitlist-fields.ts` at the same commit.

## What this is

A waitlist signup form for a website: only the email is required, the other questions are optional, and it still posts with no script.

`<WaitlistForm>` draws a `<form method="post">` with no `action` of its own (see `noScriptAction`); the script sends to `actionUrl` (default `/api/waitlist`). Each question comes from `fields` (default `defaultWaitlistFields`): a text, email, tel or textarea control, or a choice drawn as a `<fieldset>` with a `<legend>` and one radio per answer. A choice answer may carry one line of help under its label. Only a field with `required` carries the `required` attribute; every other label ends with the muted `optional` word (default `(optional)`). In the default list that field is email.

The default order puts the personal questions first: name, email and what the person wants to build come before company and team size, so someone on their own is not asked about a company first. That is why the source form was ordered that way. Experience opens on `not-yet` ("Not yet"), so the selected answer is a welcome rather than the bottom of a scale. A host passes `fields` in any order; the component does not reorder them.

Above the button, `notice` (default none) is a sentence, with an optional link. It is not a checkbox. The body's `notice` is the words that were shown: `notice.text`, and when the link is drawn, a space and `notice.linkLabel`.

`page` is sent with the body so the record can say where the person signed up. It is not a field the person types.

On submit the form runs `validate`. A problem marks the control `aria-invalid`, points `aria-describedby` at the error text, and moves focus to the first invalid control. Nothing is sent. A problem clears as soon as that field's answer passes (on every field, that field only). A clean submit posts JSON. While it sends, the button is disabled and reads "Sending…", and the live region holds the same word, so a screen reader hears it. A truthy answer replaces the form with the thank-you block (a heading with `tabindex="-1"`, then one line) and moves focus to that heading. The `sent` slot replaces that block: it should hold a heading (`h1`, `h2`, `h3`, or an element with `tabindex="-1"`), which takes the focus. With none, focus goes to the wrapper around the slot (`tabindex="-1"`), so it never falls to the page body. A throw, or a falsy answer (`false`, `0`, `null`, `""`), shows the error line and keeps every answer. The line sits in an `aria-live="polite"` region that is in the form from the start. `sent(body)` and `failed(error)` fire for those two endings.

With `turnstileSiteKey` the component loads Turnstile itself, and not before it has to: when the form comes within one viewport (an `IntersectionObserver` with `rootMargin` `100% 0px`) or when anything inside the form takes focus, whichever is first. Where there is no `IntersectionObserver`, it loads on mount. The script address is `turnstileScriptUrl` (default `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`). After it loads, the component calls `turnstile.render` on its own box. A send that happens before the token arrives waits up to `tokenWaitMs` (default 8000) and then shows the error line with the answers kept. No key means no script, no box and no token.

With no script the browser posts the named fields, form-encoded (not JSON), to the current page, because the form has no `action`; or to `noScriptAction` when you set it. `page`, `notice` and the token are added by the script. With a Turnstile key set, such a post carries no token, and a server that checks Turnstile will refuse it: a keyed form cannot be submitted without script.

Also exported: `validate(fields, values)`, `buildBody(fields, values, extra)`, `postJson(url, body)` (the default sender: 2xx resolves `true`, anything else throws), `defaultWaitlistFields`, `DEFAULT_WAITLIST_LABELS` and `DEFAULT_TURNSTILE_SCRIPT_URL`.

It needs the page's script to send the JSON: hydrate it lazily (Nuxt: `defineAsyncComponent`).

## What this is not

- Not a newsletter signup. One address and a subscribe button is `web-units/newsletter-signup`.
- Not a contact form. Name, email and a message to the site is `web-units/contact-form`.
- Not a store. This unit keeps nothing: not in the browser, not on a server of its own. The site's endpoint receives the body.
- Not the check that counts. The server must call the exported `validate` again with the same `fields`. The form's check only helps the person fix an answer.

## How to take it

Package: `@kaigilb/gilbwebsitecode-waitlist-form`

Take it as a packed copy, the library's one way for every web unit: from a clone of this repository at a commit, pack the unit and keep the packed file in the site's repository, so every install (a fresh machine, CI, Cloudflare Pages) gets the same bytes with no clone and no network fetch:

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <site>/vendor/gilbwebsitecode-waitlist-form
cd web-units/waitlist-form && npm pack --pack-destination <site>/vendor/gilbwebsitecode-waitlist-form
echo <commit> > <site>/vendor/gilbwebsitecode-waitlist-form/SOURCE
cd <site> && pnpm add ./vendor/gilbwebsitecode-waitlist-form/kaigilb-gilbwebsitecode-waitlist-form-0.1.0.tgz
```

The dependency then reads `"file:vendor/gilbwebsitecode-waitlist-form/kaigilb-gilbwebsitecode-waitlist-form-0.1.0.tgz"`, and the lockfile holds its integrity. To take a newer commit, pack again and run the same `pnpm add ./vendor/…tgz`: a plain `pnpm install` keeps the old integrity in the lockfile (the file name has not changed), and a fresh install then refuses the new bytes.

Under pnpm 11 the site's `pnpm-workspace.yaml` must name it, because this package is not on the npm registry and pnpm's `minimumReleaseAge` check would refuse it on a fresh machine:

```yaml
minimumReleaseAgeExclude:
  - '@kaigilb/gilbwebsitecode-waitlist-form'
```

Check it the way a fresh machine sees it: copy the site's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `vendor/` into an empty folder and run `pnpm install --frozen-lockfile` with a new, empty store (`--store-dir`) and new `XDG_*` folders. The website starter does this for every packed unit as `pnpm check:fresh-install`. `pnpm add` passing on your own machine proves nothing: your store already holds the bytes.

⛔ Not from GitHub by a git URL with `&path:/web-units/waitlist-form`: pnpm 11 writes the lockfile's resolution without the path, so an install into an empty store gets the whole repository (measured for the section menu, 2026-10-18).

Nuxt: the package ships `.vue` and `.ts` source, so add it to `build.transpile` in `nuxt.config.ts`:

```ts
build: { transpile: ['@kaigilb/gilbwebsitecode-waitlist-form'] },
```

Then, with the site's own questions and notice:

```vue
<script setup lang="ts">
import type { WaitlistField } from '@kaigilb/gilbwebsitecode-waitlist-form'

const WaitlistForm = defineAsyncComponent(() =>
  import('@kaigilb/gilbwebsitecode-waitlist-form').then((m) => m.WaitlistForm))

const fields: WaitlistField[] = [
  { name: 'name', kind: 'text', label: 'Name', maxLength: 80, autocomplete: 'name' },
  { name: 'email', kind: 'email', label: 'Email', required: true, maxLength: 254, autocomplete: 'email' },
  {
    name: 'experience',
    kind: 'choice',
    label: 'Experience building apps',
    defaultValue: 'not-yet',
    options: [
      { value: 'not-yet', label: 'Not yet', help: 'A fine place to start.' },
      { value: 'i-code', label: 'I code' },
    ],
  },
]
</script>

<template>
  <WaitlistForm
    page="pricing"
    action-url="/api/waitlist"
    :turnstile-site-key="siteKey"
    :fields="fields"
    :notice="{ text: 'We use these details only to manage your place on the list.', linkLabel: 'Privacy', linkHref: '/privacy' }"
  />
</template>
```

Do not also add Turnstile's script in `useHead`. This component loads it, and only when `turnstileSiteKey` is set.

The server handler calls the same `validate` and refuses a body it does not accept:

```ts
import { validate } from '@kaigilb/gilbwebsitecode-waitlist-form'
// `fields` is the same list the page rendered. `body` is the parsed JSON.
const errors = validate(fields, body)
if (errors.length) return new Response('no', { status: 422 })
```

## What you pass

| Prop | Meaning |
|---|---|
| `fields?` | `WaitlistField[]`. Default `defaultWaitlistFields`: name (text, 80), email (email, required, 254), idea (textarea, 1000), company (text, 120), team size (`just-me`, `2-10`, `11-50`, `50-plus`), experience (`not-yet`, `a-little`, `with-ai`, `i-code`, default `not-yet`) |
| `actionUrl?` | where the script sends the JSON, default `/api/waitlist` |
| `noScriptAction?` | the form's `action` attribute, used only with no script. Default empty: no `action` attribute, so the browser posts to the current page |
| `turnstileSiteKey?` | the Turnstile site key (public). Empty (the default) draws no widget and loads no script |
| `turnstileScriptUrl?` | the script address, default `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` |
| `page?` | sent as `page`, including when it is `""` (the default) |
| `labels?` | any of `submit` (`Join the waiting list`), `sending` (`Sending…`), `optional` (`(optional)`), `sentHeading` (`You're on the list.`), `sentBody` (`We will write when there is room.`), `failed` (`That did not go through. Your answers are kept; please try again.`), `invalidEmail` (`Enter an email address like name@example.com.`), `required` (`This one is needed.`), `tooLong` (`This is longer than {max} characters.`) |
| `notice?` | `{ text, linkLabel?, linkHref? }` or `null` (the default). Not a checkbox. The body's `notice` is the sentence as shown |
| `send?` | replaces the default sender: `(body) => Promise`. A truthy answer is sent. A falsy answer is not sent. A throw is a failure |
| `tokenWaitMs?` | how long a send waits for the Turnstile token, default `8000` |

Slot: `sent` replaces the thank-you block. Its slot prop `body` is the object that was sent. Put a heading in it: that is where focus goes.

Events: `sent(body)` after a truthy answer; `failed(error)` after a throw or a falsy answer.

`validate` returns `{ name, code, max? }[]` in field order. `code` is `required`, `invalidEmail`, `tooLong` (then `max` is the limit) or `invalidChoice`. Empty means the answers pass. Length and the email shape are judged after trimming. `buildBody` trims, omits empty values, and adds `page`, `notice` and `turnstileToken` from its third argument when those are given (`page` even when `""`; `notice` only when it is a non-empty string).

## Host must supply

The endpoint `actionUrl` points at. With script the body is JSON (`content-type: application/json`). Without script it is a normal form post of the named fields to the current page (or `noScriptAction`), so a page that takes it must handle a form-encoded POST; the endpoint should not put those answers in a query string. A server that checks Turnstile refuses the no-script post, which has no token. Either way the server checks the answers with `validate` and the same `fields`, and checks `page`, the notice and the Turnstile token itself. The Turnstile secret stays on the server.

When `turnstileSiteKey` is set, the page's Content-Security-Policy must allow the script and the widget's frame: `script-src` and `frame-src` for `https://challenges.cloudflare.com`. The component loads the script; the host does not add a second tag.

The theme, as CSS variables on `:root` (neutral fallbacks otherwise). Every website block in this library reads the same `--site-block-*` set, so a site maps it once:

- `--site-block-muted` secondary text, the optional word, help, the notice, and field borders (the muted colour at 65%, as the source's `border-brand-muted/65`). Keep that border at 3:1 or better against the field background (`--site-block-bg`), WCAG 1.4.11
- `--site-block-bg` the field background
- `--site-block-fg` the text
- `--site-block-accent` the button, links, the focus ring and the radio accent
- `--site-block-on-accent` text on the accent
- `--site-block-success` the thank-you heading
- `--site-block-danger` the error line and an invalid field's border
- `--site-block-radius` button and field corners (default `0.375rem`)
- `--site-block-motion` the button's hover transition (default `150ms`)

No Tailwind is needed: the styles ship in the component, scoped to it. They set their own margins, font sizes and box sizing (`border-box`) instead of relying on a CSS reset; text inherits the page's font.

## Layout stability

The fields are in the first HTML, at their size. Nothing below the form is held open for a later state. The thank-you block does not keep the form's height: it replaces the form, and it is shorter, so what follows the form moves up. With a Turnstile key, the widget's box is reserved at 65px (`min-height`, the source's reservation) from the first HTML, so when the script draws the widget the notice and the button do not move; without a key there is no box. The error line appears in the live region above the button and pushes the button down by one line. Choice help, when a field has it, is in the first HTML and does not arrive later.

## Do not

- Do not store the signup in this unit, in `localStorage`, or anywhere but the site's own endpoint.
- Do not treat the form's `validate` as enough. The server runs it again. A person can post without the script.
- Do not put the Turnstile secret, or any mail key, in the client.
- Do not point `actionUrl` at another site's address.
- Do not add Turnstile's script yourself as well as passing `turnstileSiteKey`. One load is enough.

## Wrong readings

- Ids are per instance, from Vue's `useId`: `<id>-field-<name>`, `<id>-help-<name>`, `<id>-error-<name>` and `<id>-option-<name>-<value>`. Any character in a name or value other than a letter or digit is written `_<hex>_`, so a field called `email-help` cannot take the id of `email`'s help. The source used fixed `wl-*` ids and said never to put two forms on one page. Two forms on one page do not share ids. The radio `name` is the field name, so a group stays a group; names may repeat across two forms because each is its own form.
- The source's sentences are not in this unit. Labels, help, the options, the notice, the button and the thank-you are `fields`, `labels` and `notice`. The default words are neutral English, not that site's copy.
- The source skipped the request in a dev build (`import.meta.dev`) and showed a preview line. That skip is not here. Pass `send` when a preview should show the thank-you without a request.
- Tailwind is written out as plain CSS. There is no utility class and no `@apply`.
- The source left the button focusable while sending (`aria-disabled`). This unit disables the button, as the other forms in this library do.
- The source waited 15 seconds for a token. This unit waits `tokenWaitMs`, default 8 seconds.
- An error clears when the answer passes, for every field. The source did this for the email only.
- `noScriptAction` is new and empty by default. The source form had `method="post"` and no `action`, so with no script it posted to the current page; so does this one. `actionUrl` is only where the script sends the JSON (the source called `/api/waitlist` itself). With a Turnstile key set, a no-script post has no token, and a server that checks Turnstile refuses it.
- If the `sent` slot has no heading or `tabindex="-1"` element, focus goes to the wrapper (`tabindex="-1"`). The source had no slot.
- When `fields` changes after mount, a new choice opens on its `defaultValue`.
- The source's phone question, "which AI" question and honeypot are not in the default list. Add a `tel` or `choice` field for a question you want. The body contains only declared fields, plus `page`, `notice` and `turnstileToken`.

## Source

KaiGilb/myjackfruit-web, on main, at `aafbf4a10613fefee69ff8b12d4f71ffc9807c60`:

- `components/WaitlistForm.vue` — the form: optional questions, the notice above the button, the late Turnstile load, the token wait, the no-JS `method="post"`, the sent and failed states.
- `workers/waitlist-fields.ts` — the one field-rule module the form and the server both read (lengths, allowed answers, the email shape, the notice stored word for word).

The default fields here are a neutral set (different lengths and different choice values from that site). A host passes the list it wants, and its server validates that same list. The tests in this unit are new.
