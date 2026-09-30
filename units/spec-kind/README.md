# spec-kind

Which stored type a Value, Function, or Solution card is, and which of those three forms opens a stored type.

The word lists are the words the form offers. These functions do not check them.

## What this is

| Function | Result |
|---|---|
| `specCardStoredType("function", { constraint: "yes" })` | `FunctionConstraint` |
| `specCardStoredType("function", { constraint: "Yes" })` | `Function` |
| `specCardStoredType("solution", { constraint: " yes " })` | `Constraint` |
| `specCardStoredType("solution", {})` | `Solution` |
| `specCardStoredType("value", { constraint: "yes" })` | `Value` |
| `specCardKindOfTypeName("FunctionConstraint")` | `function` |
| `specCardKindOfTypeName("Constraint")` | `solution` |
| `specCardKindOfTypeName("function")` | `null` |
| `specCardKindOfTypeUri("https://example.test/base/t/Function")` | `function` |
| `specCardKindOfTypeUri("t:Value")` | `value` |

`specCardConstraintOn` is true only for `FunctionConstraint` and `Constraint`.

`SPEC_LEVELS` is `Business`, `Stakeholder`, `Product`, `Solution`, `ValueDeliveryStep`, `To-Do`.

`SPEC_DELIVERY_STATES` is `Planned`, `Developed`, `In-Production`, `Retired`.

## What this is not

- Not the form, and not the facts the form writes. The composer that turns every template field into a write stays in the app.
- Not a validator. `specCardStoredType` does not read `level`. A level that is not in `SPEC_LEVELS` does not change the type name. Do not add a check here.
- Not `type-curie` or `type-name`. `specCardKindOfTypeUri` takes the last `/` segment and strips one leading `t:`. That is enough for `…/base/t/Function` and for `t:Function`. It does not decode, and it does not understand a prefix other than `t:`.

## How to take it

Package: `@kaigilb/gilbplatformcode-spec-kind`

```ts
import { specCardStoredType, specCardKindOfTypeName } from "@kaigilb/gilbplatformcode-spec-kind";
```

Path: `units/spec-kind/`.

## Constraint

The flag is the string `yes` after trim. `Yes`, `true`, and `1` are off. Only function and solution change. A value stays `Value` even when the box is ticked.

`Constraint` (the solution one) and `FunctionConstraint` are different types. Both open a form (`solution` and `function`). `specCardConstraintOn` tells you the box starts ticked.

Case matters. `function` is null. The stored names are Pascal case as listed above.

Null from the kind functions means this form does not edit that type. The record can still be a real record of some other type.

## What the host must supply

The form's `constraint` field, as the string the checkbox writes (`"yes"` or anything else). And, when opening an existing record, its type name or type address.

## Do not

- Do not treat `SPEC_LEVELS` as the legal set of a vault. It is the set of words this form shows. A new word in the template is not here until the form adds it.
- Do not map `Constraint` to `function`. It is a solution constraint.
- Do not tick a value by changing its type. The type stays `Value`.

## Wrong readings

- "`null` means untyped." It means not one of Value, Function, FunctionConstraint, Solution, Constraint.
- "The constraint box always changes the type." Not for a value.

## Where it came from

GilbApp `src/lib/base/specCards.ts`: `specCardStoredType`, `specCardConstraintOn`, `specCardKindOfTypeName`, `specCardKindOfTypeUri`, `SPEC_LEVELS`, `SPEC_DELIVERY_STATES`. The composer that writes the rest of the card was not copied.
