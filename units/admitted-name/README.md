# admitted-name

The name a profile may publish. A field the holder did not admit is skipped.

## What this is

- `holderAdmittedField(field)` — whether this app may act on that field.
- `displayName(fields)` — the given name and the family name, joined by one space.

## What this is not

- Not the access rung. A closed rung and "nobody admitted this" are different facts. This unit does not read a rung, and the field type has no rung on it. Do not add one and then consult it here.
- Not the per-type default audience. That table is for a field the holder just added. It must not be used as a fallback for a field that arrived with no admission.
- Not `units/name-cap`. That one capitalises a name as it is typed. This one decides which name may be published.
- Not the whole profile. Pass `model.fields`, not the model.

## How to take it

Package: `@kaigilb/gilbplatformcode-admitted-name`

```ts
import { displayName, holderAdmittedField } from "@kaigilb/gilbplatformcode-admitted-name";
```

Path: `units/admitted-name/`.

## What you pass

A field is `{ type, value, unadmitted? }`.

`unadmitted: true` is the only flag that blocks. Omit the property when the field is admitted. Do not set it to `undefined`.

`displayName` takes the field list in its stored order.

## What you get

`holderAdmittedField`:

- `{ unadmitted: true }` → `false`
- no flag → `true`
- any other value, including `false` → `true`

`displayName`:

1. Find the first field whose type is exactly `given-name` and which is admitted.
2. Find the first field whose type is exactly `family-name` and which is admitted.
3. Trim each value.
4. Drop a blank.
5. Join the remaining parts with one space.

Other types are ignored, including email.

The first admitted field of that type wins **even when its trimmed value is blank**. A later admitted name does not fill the blank. The blank is then dropped from the join, so you do not get a leading space. You also do not get the later name.

An unadmitted field is skipped, even when it is the only one that has text. The next admitted field of that type is used.

Two admitted given names: the earlier one is used. They are not both shown.

No admitted name: `""`.

## Examples

```ts
holderAdmittedField({ unadmitted: true }); // false
holderAdmittedField({}); // true

displayName([
  { type: "family-name", value: "Gilb" },
  { type: "given-name", value: " Kai " },
  { type: "email", value: "kai@example.test" },
]);
// "Kai Gilb"

displayName([
  { type: "given-name", value: "   " },
  { type: "given-name", value: "Later" },
  { type: "family-name", value: "Secret", unadmitted: true },
  { type: "family-name", value: "Shown" },
]);
// "Shown"
// "Later" is not used. The first given name was admitted and blank.
```

## What the host must supply

The field list, with `unadmitted: true` already set on fields the holder did not admit. This unit does not decide admission from the vault. It only reads the flag.

The published string is what other screens title that person with. Do not build it from a name you would not show.

## Do not

- Do not treat a private rung as unadmitted, or an unadmitted field as merely private.
- Do not search for the first non-blank given name. The first admitted one wins, blank included.
- Do not pass the profile object. It is not an array. Pass its `fields`.
- Do not join with a comma or a newline. One space.
- Do not include an email or an organisation in this string. The types are `given-name` and `family-name` only.

## Wrong readings

- "Unadmitted means the value is hidden from the holder." It means this app must not publish it as the holder's name. The holder's own editor is a different screen.
- "A blank given name falls through to the next given name." It does not.
- "`false` on the flag means admitted." Only the exact value `true` blocks. `false` does not block. Prefer omitting the property.

## Where it came from

MyNetBase `src/model/profile.ts`, `holderAdmittedField` and `displayName`. The rung table and the write path are not in this unit.
