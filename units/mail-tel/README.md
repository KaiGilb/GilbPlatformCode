# mail-tel

Put `mailto:` or `tel:` on a value, or take it off.

The prefix match is case-sensitive. `Mailto:` is not `mailto:`. `Tel:` is not `tel:`. Spaces are not trimmed, except the spaces `toTel` removes when it is the one adding the prefix.

## What this is

| Function | You pass | You get |
|---|---|---|
| `toMailto` | A string, possibly empty. | The same string if it starts with `mailto:`. Otherwise `mailto:` in front. |
| `fromMailto` | A string or undefined. | The string without one leading `mailto:`, or undefined. |
| `toTel` | A string. | Unchanged if it starts with `tel:`. Otherwise every whitespace character is removed, then `tel:` is added. |
| `fromTel` | A string or undefined. | The string without one leading `tel:`. Spaces after the prefix stay. |

## What this is not

- Not `phone-text`. That unit splits a stored phone into a dial code and a national number, and it does not guess a code. This unit only moves the `tel:` prefix.
- Not `contact-actions`. That unit builds Call and SMS links and strips a leading `tel:` for the link. It does not define storage.
- Not a validator. `mailto:` with an empty address is `mailto:`. `toTel("not a phone")` is `tel:notaphone`.

## How to take it

Package: `@kaigilb/gilbplatformcode-mail-tel`

```ts
import { fromMailto, toTel } from "@kaigilb/gilbplatformcode-mail-tel";
```

Path: `units/mail-tel/`.

## What you pass

The stored string, or the string the person typed. Undefined is only accepted by the two `from` functions, and it stays undefined. Do not coerce undefined to `""` before calling them if you need to tell "missing" from "present and empty".

## What you get

`toMailto("")` is `mailto:`. That is a prefix on an empty address, not a refusal.

`toMailto("mailto:a@b.test")` is unchanged. `toMailto("Mailto:a@b.test")` becomes `mailto:Mailto:a@b.test`, because the prefix did not match. Do not lowercase the check.

`toTel("+1 2")` is `tel:+12`. All whitespace goes, not only the ends. `toTel("tel:+1 2")` stays `tel:+1 2`, spaces included, because the prefix was already there. The space removal happens only when this function adds the prefix.

`fromTel("tel: 1 2")` is ` 1 2`. The spaces after `tel:` are kept. `fromMailto("mailto:mailto:a@b.test")` drops one prefix and leaves `mailto:a@b.test`.

A leading space blocks the prefix: ` fromMailto(" mailto:a@b.test")` returns the string unchanged.

## What the host must supply

Nothing. The value is the whole input.

## Do not

- Do not trim before you call these if you need the stored bytes back. Trim is a different decision.
- Do not use `toTel` to clean a value that already has `tel:`. It will not remove the spaces.
- Do not treat `Mailto:` as already prefixed.

## Wrong readings

- "tel: means the spaces were normalised." Only when this function added the prefix.
- "undefined in, empty string out." Undefined stays undefined.
- "This checks that the address is deliverable." It does not.

## Where it came from

MyNetBase `src/model/profile.ts`, `toMailto`, `fromMailto`, `toTel`, and `fromTel`.
