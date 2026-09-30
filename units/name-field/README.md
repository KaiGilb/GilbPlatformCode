# name-field

The two searchable name fields. Any other profile type is not one.

## What this is

`NAME_FIELDS` is `["given-name", "family-name"]`.

`isNameFieldKey(value)` is true only for those two strings.

`nameFieldKeyFromProfileType(type)` returns the same string when the profile type is one of the two, and `null` otherwise.

## What this is not

- Not an audience rung, and not a list of who may see a name. That list stays in the app. Do not copy it into this unit.
- Not a display name. A row's visible name is `units/entity-name`.
- Not a claim writer. `null` means "do not publish a name claim for this profile type". The person may still have a name on the screen.
- Not a trimmer. `"given-name "` is not a name field. `"Given-name"` is not a name field.

## How to take it

Package: `@kaigilb/gilbplatformcode-name-field`

```ts
import { nameFieldKeyFromProfileType } from "@kaigilb/gilbplatformcode-name-field";

const field = nameFieldKeyFromProfileType(profileType);
if (field === null) return; // not a searchable name
```

## What you pass

`value` may be anything. Only the two strings pass.

`type` is the profile field's type word, such as `given-name`, `family-name`, `email`, `org`, `title`, `skill`, `address`.

## What you get

| Input | Result |
|---|---|
| `"given-name"` | the same string |
| `"family-name"` | the same string |
| `"email"`, `"org"`, `"title"`, `"skill"`, `"address"`, `""` | `null` from the profile mapper, `false` from the check |
| `"Given-name"`, `"given-name "` | not a match |

There is no third field. Adding one here would not make the server accept it, and it is not this unit's job.

## Do not

- Do not treat `null` as "the name is missing". It means this profile type is not a searchable name field.
- Do not prefix-match. `"given"` is not `"given-name"`.
- Do not fold case or trim.
- Do not put organisation or job title through this. Those are employment claims, not name claims.

## Wrong readings

- "First name and last name are the only name-shaped facts in the product." No. They are the only two that publish a searchable name claim. Other facts exist. They do not go through this function.
- "A failed check should default to given-name." No. The result is `null`. Do not guess a field.

## Where it came from

MyNetBase `src/lib/base/nameClaim.ts` — `NAME_FIELDS`, `isNameFieldKey`, `nameFieldKeyFromProfileType`. The write, the audience witness, and the rung list stayed in the app.
