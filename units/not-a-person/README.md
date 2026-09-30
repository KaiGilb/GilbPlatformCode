# not-a-person

Whether an error is the server's ruling that this principal is not a person. A failed read is not that ruling.

## What this is

`NOT_A_PERSON_CODE` is the string `not_a_person`.

`isNotAPersonError(error)` is true only when the value is an object whose `name` is `PublicCardError` and whose `code` is `not_a_person`.

## What this is not

- Not a fetch, and not a guess about a 404.
- Not `person-ruling-key`. That unit spells a ruling the app remembered, and a missing ruling still admits the principal. This unit reads an error the server already returned.
- Not an instance check. A plain object with those two fields counts. It does not have to be an `Error`.

## How to take it

Package: `@kaigilb/gilbplatformcode-not-a-person`

```ts
import { isNotAPersonError } from "@kaigilb/gilbplatformcode-not-a-person";

if (isNotAPersonError(error)) {
  // the server ruled
}
```

## What you pass

The thrown value, or null.

## What you get

True or false.

`not-a-person` with a hyphen is false. The name `Error` with the right code is false. `new Error("missing")` is false. Null and undefined are false.

## Examples

```ts
isNotAPersonError({ name: "PublicCardError", code: "not_a_person" }) === true;
isNotAPersonError({ name: "PublicCardError", code: "not-a-person" }) === false;
isNotAPersonError(new Error("missing")) === false;
```

## The host must supply

The error object the card read already built, with `name` and `code` set from the server body. This unit does not parse a response.

## Do not

- Do not treat false as "this is a person". False means this value is not that ruling. The question stays open.
- Do not treat a 404, a typo, or an unknown principal as this ruling unless the server sent this code.
- Do not accept the hyphenated spelling.

## Wrong readings

- "Any failure to load the card means not a person." It does not.
- "The object must be an Error." It must carry the two fields. A class check would reject a plain object the app would have accepted.

## Where it was taken from

MyNetBase `src/lib/card/publicCard.ts`, `NOT_A_PERSON_CODE` and `isNotAPersonError`. The card fetch stays in the app.
