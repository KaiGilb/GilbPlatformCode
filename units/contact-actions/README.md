# contact-actions

Up to three quick links for one person: call, text message, email, then a social page. It does not invent a destination.

## What this is

`pickContactActions` builds a short list of links from phone numbers, email addresses, and social values you already hold. The order is fixed:

1. **Call** — the first phone that is not blank.
2. **SMS** — the same phone, and only if a phone was found.
3. **Email** — the first email that is not blank.
4. **Social** — each following social value that parses as `http` or `https`.

The default length is 3. With a phone and an email, the three slots are Call, SMS, and Email. Social pages appear only in slots that are left.

Each item is `{ kind, href, value, label }`.

- `kind` is `"phone"`, `"sms"`, `"email"`, or `"social"`.
- `href` is what you put on the link (`tel:`, `sms:`, `mailto:`, or an `http(s)` URL).
- `value` is what you show. For a phone or an email it is trimmed. For a social page it is the original string, spaces included. It is not the normalized href.
- `label` is the English word `Call`, `SMS`, `Email`, or `Social`. These four words do not change with locale.

Helpers, if you need one link and not the list: `phoneForUri`, `toMailtoHref`, `resolvableSocialHref`.

## What this is not

- Not a dialler, a mailer, or a fetcher. It only builds strings.
- Not a validator of phone numbers or email addresses. `tel:abc` is still returned if you pass `abc`. A value that is only the prefix `tel:` becomes `tel:` and `sms:` with nothing after them. Do not pass that. The package will not drop it, because the app does not drop it.
- Not a translator. Map `kind` to your own word if the screen is not English, and ignore `label`.
- Not a guess for `@someone`. A social value that starts with `@` is skipped. No site is assumed.
- Not a place for `javascript:`, `data:`, or `vbscript:` links. Those are skipped. `ftp:` and `mailto:` are also skipped when they appear in the social list (email has its own field).

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-actions`

```ts
import { pickContactActions } from "@kaigilb/gilbplatformcode-contact-actions";

const actions = pickContactActions({ phones, emails, socials });
```

Path: `units/contact-actions/`.

## What you pass

```ts
pickContactActions({
  phones?: readonly string[],
  emails?: readonly string[],
  socials?: readonly string[],
}, max = 3)
```

Missing arrays mean none. Blank entries (spaces only) are skipped. Only the first usable phone and the first usable email are used. Further numbers are not extra buttons.

`max` is the most items to return. `0` and any negative number return `[]`. They do not mean "no limit".

## What you get

An array, in the order above, length at most `max`. It may be shorter. It may be empty. It is a new array. Changing it does not change the source.

`phoneForUri`:

- Trims.
- If the text starts with `tel:` in any letter case, that prefix is removed. The rest of the original casing is kept.
- Every whitespace run is removed.
- Parentheses and dashes stay. `"(47) 123-45"` becomes `"(47)123-45"`.

`toMailtoHref`:

- Trims.
- If it already starts with `mailto:` in any letter case, the trimmed original is returned, not a lowercased copy. `"Mailto:A@b.c"` stays `"Mailto:A@b.c"`.
- Otherwise `mailto:` is added in lowercase. The address is not encoded.

`resolvableSocialHref`:

- Returns `null` for blank, for a leading `@`, for `javascript:`, `data:`, `vbscript:` (any case), for a scheme other than http(s), and for text the URL parser rejects (`"not a url"`).
- A value with no scheme gets `https://` in front, then it is parsed. `"example.test/someone"` becomes `"https://example.test/someone"`.
- A single word is a host. `"foo"` becomes `"https://foo/"`. That is the URL parser, not a special case. Do not pass a display name with no dot if you do not want a link.
- The return value is `url.href`, not the string you typed. A host with no path gains a trailing slash: `"https://example.test"` becomes `"https://example.test/"`. The host is lowercased: `"HTTP://Example.Test/A"` becomes `"http://example.test/A"`. The path's case is kept.
- Show `value` to the person. Use `href` only as the link target.
- Phone and email values are trimmed. A social `value` is not. `"  example.test/a  "` still shows with the spaces. Trim social text before you pass it, or trim it when you draw it. The href is built from the trimmed text either way.

## Examples

```ts
pickContactActions({
  phones: [" +47 1 ", "+99"],
  emails: ["a@b.c"],
  socials: ["https://example.test/a"],
});
// [
//   { kind: "phone", href: "tel:+471", value: "+47 1", label: "Call" },
//   { kind: "sms",   href: "sms:+471", value: "+47 1", label: "SMS" },
//   { kind: "email", href: "mailto:a@b.c", value: "a@b.c", label: "Email" },
// ]
// The second phone and the social page are past the default of 3.

pickContactActions({
  emails: ["a@b.c"],
  socials: ["@someone", "javascript:alert(1)", "example.test/a"],
}, 3);
// email, then one social. @someone and javascript: are skipped, not replaced with a made-up page.

pickContactActions({ phones: ["1"] }, 1);
// only Call. SMS needs a second slot.

resolvableSocialHref("@someone"); // null
resolvableSocialHref("ftp://example.test/a"); // null
```

## What the host must supply

The three lists, already read from the profile or the card. This package does not know which fact is a phone. It does not look up a calling code. Pair it with the phone-text unit if you need to split a stored number. Do not ask this unit to do that.

The host draws the buttons and opens `href`. Opening `tel:` and `sms:` is the platform's job.

## Do not

- Do not build `https://twitter.com/` + an `@name`, or any other site, when this returns null.
- Do not show `href` as the phone number. `value` still has the spaces the person typed. `href` does not.
- Do not add SMS for an email, or a second SMS for a second phone. One phone, one SMS, and only when Call was also possible.
- Do not reorder to "whatever fits". The order is Call, SMS, Email, then socials. A screen that wants a different order should not sort this array by guessing. It should ask for a smaller `max` or skip a `kind`.
- Do not pass a sentence as a social value. `"not a url"` is null. `"foo"` is a link to `https://foo/`. If your field mixes names and urls, filter before calling.

## Wrong readings

- "Three actions means the person has a phone, an email, and a social page." No. The default three are often Call, SMS, and Email, from two facts.
- "A skipped social was dangerous, so it was deleted from the profile." No. It is omitted from this list only. The stored value is untouched.
- "`label` will follow the screen language." No. It is one of four English words. Use `kind` for a translation.

## Where it came from

MyNetBase `src/lib/base/contactActions.ts`. The pick order, the scheme checks, and the refusal to invent an `@` destination are unchanged.
