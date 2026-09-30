# name-cap

Capitalises a given name or a family name. Every other field is left as typed.

## What this is

`formatFieldValue(type, value)`.

The type decides. The value is changed only for `given-name` and `family-name`.

## What this is not

- Not a title-caser. Only the first code unit is upper-cased. `mcLars` becomes `McLars`. The rest stays, so `McLars` stays `McLars`.
- Not `units/name-from-email`, except that the one-letter rule is the same as `capitalizeFirst` there. Keep them in agreement. Use that unit when you are splitting an email. Use this unit when you already have a field type.
- Not `units/admitted-name`. That one decides which name may be published. This one does not look at admission.
- Not a trim. A leading space stays a leading space, and the space is what gets upper-cased.

## How to take it

Package: `@kaigilb/gilbplatformcode-name-cap`

```ts
import { formatFieldValue } from "@kaigilb/gilbplatformcode-name-cap";
```

Path: `units/name-cap/`.

## What you pass

`type` is the field type string. `value` is the text as typed.

The type match is exact:

- `given-name` is capitalised
- `family-name` is capitalised
- `Given-name`, ` given-name`, `email`, `org`, and every other string are returned unchanged

## What you get

The same string, or that string with the first UTF-16 code unit upper-cased.

- `""` stays `""`
- `lars` on a name type becomes `Lars`
- `école` becomes `École`
- an emoji can be two code units. Only the first unit is passed to `toUpperCase`. For a typical emoji that unit does not change, so the string comes back unchanged. Do not switch this to code points. The screens already use the code unit.

There is no locale argument. `toUpperCase` uses the runtime's default.

## Examples

```ts
formatFieldValue("given-name", "lars"); // "Lars"
formatFieldValue("family-name", "mcLars"); // "McLars"
formatFieldValue("email", "lars"); // "lars"
formatFieldValue("Given-name", "lars"); // "lars"
formatFieldValue("given-name", ""); // ""
```

## What the host must supply

The field type and the current text. Call this when the value is stored and when it is shown, on those two types only. Do not capitalise every field "to be safe". An email local-part is case-sensitive in practice even when the domain is not, and this function refuses to touch it.

## Do not

- Do not capitalise `org`, a job title, an email, or a phone.
- Do not capitalise a type that merely contains the word name. `Given-name` does not match.
- Do not trim. If you need a trim, do it in a separate step and know that you are not matching this function.
- Do not upper-case the whole word.
- Do not treat this as the published name. A name can be capitalised here and still be unadmitted. Publication is `units/admitted-name`.

## Wrong readings

- "Names are title case." Only the first code unit.
- "Any field called a name is included." Only the two type strings above.
- "An empty name becomes a placeholder." It stays empty.

## Where it came from

MyNetBase `src/model/profile.ts`, `formatFieldValue` and `capitalizeFirst`.
