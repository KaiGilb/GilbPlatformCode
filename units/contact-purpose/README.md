# contact-purpose

The purpose stated by an email slot: Work or Private.

"Private" here is that purpose word. It is not an audience rung, and it is not the name of a narrow audience. This unit never reads a rung.

## What this is

`purposeFromSlot` maps four slot keys:

- `email` and `hasEmail` → `"Work"`
- `emailPrivate` and `hasEmailPrivate` → `"Private"`

`vcardPurposeType` maps those to a vCard 3.0 TYPE token:

- Work → `WORK`
- Private → `HOME`

The card still shows the word Private. HOME is the vCard token, not the word you print.

## What this is not

- Not a phone purpose. A phone slot returns null. Do not guess Work or Private for it.
- Not `units/mail-tel`. That one adds or removes a `mailto:` or `tel:` prefix.
- Not `units/phone-text` and not `units/contact-actions`. Those split a number or build Call / SMS / Email links.
- Not `units/vcard-line`. That one escapes and folds a line. It does not choose WORK or HOME. Call this unit first, then put the token in the line yourself.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-purpose`

```ts
import { purposeFromSlot, vcardPurposeType } from "@kaigilb/gilbplatformcode-contact-purpose";
```

Path: `units/contact-purpose/`.

## What you pass

The slot key the claim already carries, or null. It is trimmed. Case is not changed.

The vCard helper takes `"Work"`, `"Private"`, or null. Any other string is not in the type. At runtime, anything that is not those two exact strings returns null.

## What you get

`"Work"`, `"Private"`, or null from the slot.

`"WORK"`, `"HOME"`, or null from the vCard helper.

Null means the slot stated no purpose. Leave the TYPE off. Do not default to WORK. Do not default to HOME.

## Examples

```ts
purposeFromSlot(" email "); // "Work"
purposeFromSlot("Email"); // null — case differs
purposeFromSlot("phone"); // null
purposeFromSlot(null); // null

vcardPurposeType("Private"); // "HOME"
vcardPurposeType(null); // null
```

## What the host must supply

The slot key from the claim it already holds. This unit does not look up a profile.

## Do not

- Do not treat Private as an audience and filter the card with it.
- Do not add a fifth slot. A new slot that should state a purpose is a change to this list, not a guess at the call site.
- Do not trim case. `Email` is not Work.

## Wrong readings

- "Every email-shaped slot is Work." Only `email` and `hasEmail`.
- "HOME means print the word Home." Print Private. Write HOME in the vCard type.

## Where it came from

MyNetBase `src/lib/card/contactPointPurpose.ts`.
