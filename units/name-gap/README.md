# name-gap

Whether a found person is still missing a given name or a family name. A space is not a name. This does not decide who may see the name.

## What this is

`needsNameRecovery(person)` is the gate in front of a second read. The find index and the profile card are different stores. A person can be short on the find surface and whole on the card. This function says only whether it is still worth asking the card.

True means at least one of the two names is not a non-blank string. False means both are already present. False does not mean the names are correct, public, or complete in any other field.

## What this is not

- Not an access decision. The card, not this function, decides what the viewer may see. Do not skip the card's own check because this returned true, and do not hide a person because this returned true.
- Not a fetch. It does not call the card. The host calls the card only for the people this marks.
- Not a skill test. An older check also required that the person was found by skill, and that skipped people who already had one name. Do not add that requirement back.
- Not a name builder. It does not join given and family, and it does not invent a label.
- Not the name-field unit. That unit says which profile types are the searchable name fields. This unit says whether the two values already in hand are usable.

## How to take it

Package: `@kaigilb/gilbplatformcode-name-gap`

```ts
import { needsNameRecovery } from "@kaigilb/gilbplatformcode-name-gap";

const stillShort = people.filter(needsNameRecovery);
```

## What you pass

An object with optional `given` and `family`. Any other fields are ignored. The values are `unknown` on purpose: a number, null, or a missing field must not count as a name.

## What you get

A boolean.

| `given` | `family` | Result |
|---|---|---|
| `"Ada"` | `"Lovelace"` | `false` |
| `"  Ada  "` | `"Lovelace"` | `false` — trim is only the emptiness test. The value is not returned. |
| `"Ada"` | `""` or `"   "` | `true` |
| `null`, missing, or a number | `"Lovelace"` | `true` |
| both missing | | `true` |

Either side is enough. A present family name does not save a missing given name, and the reverse.

## Examples

```ts
needsNameRecovery({ given: "Ada", family: "Lovelace" }); // false
needsNameRecovery({ given: "Ada" });                      // true
needsNameRecovery({ given: "Ada", family: "   " });       // true
needsNameRecovery({ given: 1, family: "Lovelace" });      // true
```

## Host must supply

The person object from the find result, with `given` and `family` already placed on those two keys. This function does not read `a:givenName`, `label`, or a card payload. If the find result still uses other keys, map them before the call.

## Do not

- Do not treat `true` as "show a placeholder" or "this person has no name". It means "ask the card; it may still have a name this viewer is admitted to".
- Do not treat `false` as "do not refresh anything else". Skills, the organisation, and the photo are separate questions.
- Do not require both names to be missing. One missing name is a gap.
- Do not trim the stored values in the host and then also trim here as if that changed the result. The emptiness test already trims. The stored spelling is left alone because this function does not write.

## Wrong readings

- A whitespace string is not a name. `"   "` on either side is a gap.
- A number is not a name, even when it is truthy. `1` is a gap.
- A person found only through a skill is still judged by these two fields. Do not skip them for lack of a skill.
- Both names present is `false` even when the strings are tags, emails, or single letters. This function does not judge quality. It judges presence.

## Source

MyNetBase `src/lib/base/findPeople.ts`, `needsNameRecovery`. The local `present` helper there is copied here. It is not exported.
