# fact-faithful

Whether a fact can be shown as text without dropping part of it.

## What this is

`isFactStringFaithful(value)` is a shape test.

True means a string conversion that keeps strings, numbers, booleans, and `@id` edges will not drop a member. False means the value has a part that conversion cannot carry. Showing the conversion anyway presents a hole as the stored fact.

## What this is not

- Not a converter. It does not return the string.
- Not a field list. It does not know attribute names.
- Not a write. The host decides what to do with a value that is not faithful. Usually that means "do not replace this fact with the string".

## How to take it

Package: `@kaigilb/gilbplatformcode-fact-faithful`

```ts
import { isFactStringFaithful } from "@kaigilb/gilbplatformcode-fact-faithful";

if (!isFactStringFaithful(value)) {
  // do not save a string in its place
}
```

## What you pass

Any value from a fact.

## What you get

A boolean.

| Value | Result |
|---|---|
| `null`, `undefined` | true |
| a string, including `""` | true |
| a number, including `0` and `NaN` | true |
| a boolean | true |
| `[]` | true |
| a list whose every member is faithful | true |
| a list with one unfaithful member | false |
| an object that has an `@id` key | true, even when the value is `""` |
| `{}` or a `Date` | false |
| a function | true |

A function is true because it is not an object. Do not change that. The test is the five shapes a string conversion already branches on, not a list of JavaScript types you would rather refuse.

## Host must supply

The fact value. This unit does not read a document.

## Do not

- Do not treat `true` as "safe to show to a person" for a function or a symbol. It means "a string conversion will not drop a member". The host should still not render a function as a field.
- Do not treat `false` as "the fact is absent". The fact is there, and it is not a string.
- Do not treat `null` as unfaithful. Absence and an empty list are both faithful, on purpose. Splitting them would change the editor this was measured against.

## Wrong readings

- `{ "@id": "" }` is faithful. The key's presence is the test, not a non-empty address.
- One bad member makes the whole list false. The other members being strings does not save it.

## Source

GilbApp `src/lib/base/records.ts`, `isFactStringFaithful`. The string conversion next to it was not copied. A second conversion in the app renders a plain object as `"[object Object]"` and was left there. Do not "repair" that by changing this predicate.
