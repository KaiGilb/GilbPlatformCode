# name-from-email

A first name, and sometimes a last name, taken from the mailbox of an email. Used when a signup has an address and no name yet.

If the mailbox is not one of the two shapes below, the result is `{}`. The screen leaves the name blank. It does not guess.

## What this is

`nameFromEmail("lars.larson@example.test")` → `{ firstName: "Lars", lastName: "Larson" }`.

The same for `_` and `-`. The domain is ignored. Tokens are lowercased, then the first letter of each is uppercased. `LARS-LARSON` becomes Lars / Larson.

`nameFromEmail("lars@example.test")` → `{ firstName: "Lars" }`. There is no `lastName` key. Do not read it as `""` and save an empty last name. Check `in` or `=== undefined`.

`capitalizeFirst` uppercases character 0 only. `mcLars` stays `McLars`. An empty string stays empty.

## What this is not

- Not a parser for every human name. Three pieces (`lars.b.larson`), a digit (`lars2.larson`), an apostrophe, or a space is `{}`.
- Not the email itself. The address is stored separately. This function does not return it.
- Not a translation, and not a uniqueness check.

## How to take it

Package: `@kaigilb/gilbplatformcode-name-from-email`

```ts
import { nameFromEmail } from "@kaigilb/gilbplatformcode-name-from-email";
```

Path: `units/name-from-email/`.

## Which separator wins

`.` is tried first, then `_`, then `-`. The first one that splits the local part into exactly two letter-only tokens wins. `lars.larson-extra` fails the dot (the second token contains a hyphen) and fails the hyphen (the first token contains a dot), then fails the single-token test. The result is `{}`.

`undefined`, `""`, and `@example.test` are `{}`.

## Do not

- Do not invent a last name from a one-word mailbox.
- Do not fall back to the whole local part when the guess fails. The empty result is the point.
- Do not run `capitalizeFirst` on the domain.

## Wrong readings

- "`{}` means the email was invalid." It means a name was not derived. The email can still be stored.
- "Missing `lastName` is an empty string." The key is absent. An empty string would be a stored clearing. This is not that.

## Where it came from

MyNetBase `src/model/profile.ts`, `nameFromEmail` and `capitalizeFirst`. The audience defaults that sit next to them in that file were not copied.
