# specimen-role

The one line that says what role a unit declared. Absence, a known word, and an unknown word stay three different things.

## What this is

`specimenRoleLine(role)` returns the text to draw, or `null` when you should draw nothing.

| You pass | What it means | What you draw |
|---|---|---|
| `undefined` | This family has no role field at all. | Nothing. `null`. Not a dash, not a spacer, not "Role not declared". |
| `null` | This family has roles, and this unit declared none. | Exactly `Role not declared`. |
| `"blank"` | The unit declared the blank specimen. | `blank` |
| `"example"` | The unit declared an example. | `example` |
| `"counterExample"` | The unit declared a counter-example. | `counter-example` |
| `"guidance"` | The unit declared guidance. | `guidance` |
| any other string | The vault stored a token this package does not have a spelling for. | That string, unchanged. |

`undefined` and `null` are different. Do not coerce one into the other before you call. A missing field on a family that has no roles is `undefined`. A missing value on a unit whose family does have roles is `null`. The caller already knows which one it is. This function does not look at the family.

The absence sentence is the constant `UNIT_ROLE_NOT_DECLARED`. Its value is `Role not declared`. Do not rephrase it in one screen ("No role", "Unset", "blank"). A check compares the exact characters.

## What this is not

- Not a decision about whether a token is legal in the vocabulary. `SPECIMEN_ROLE_LABELS` is a spelling table. It admits nothing and refuses nothing. Adding a key to the table does not make a token legal. A token that is not in the table is still shown.
- Not a reader of headings or body text. The corpus spells roles in several ways in headings. None of those are consulted. If you only have a heading, you do not have a role. Pass `null` (the family has the field, the unit did not declare one) or `undefined` (the family has no such field). Do not parse the heading and pass the result.
- Not the React chip. The app draws a dashed box around the absence line. That styling stays in the app. This package returns the string.
- Not a writer. It does not save a role and it does not default a save to `blank`.

## How to take it

Package: `@kaigilb/gilbplatformcode-specimen-role`

```ts
import { specimenRoleLine, UNIT_ROLE_NOT_DECLARED } from "@kaigilb/gilbplatformcode-specimen-role";

const line = specimenRoleLine(role);
if (line === null) {
  // family has no role field — draw nothing
} else {
  // draw `line`. When it equals UNIT_ROLE_NOT_DECLARED, it is the absence line.
}
```

Path: `units/specimen-role/`.

## What you pass

`role: string | null | undefined`.

- Do not pass `""` to mean absent. An empty string is a stored token. The result is `""`, not `Role not declared`.
- Do not trim first if you want the stored characters. `" blank "` stays `" blank "`. It is not looked up as `blank`.
- The lookup is case-sensitive. `"Example"` is not `"example"`. It is shown as `Example`. `"counter-example"` (already hyphenated) is not the key `counterExample`, so it is shown unchanged, which happens to look the same. `"CounterExample"` is shown as `CounterExample`, not hyphenated.

`specimenRoleLabel(level)` is the spelling step alone. It does not understand `null` or `undefined`. Use `specimenRoleLine` at the call site.

## What you get

`string | null`.

`null` means draw nothing. It does not mean "show the absence line". The absence line is the string `Role not declared`, and you get it only from `null`.

The four spellings:

```text
blank            → blank
example          → example
counterExample   → counter-example
guidance         → guidance
```

Only `counterExample` changes. The change is a hyphen. The stored token is still `counterExample`. Do not write the hyphenated form back to the vault unless the vault already stored that.

## Examples

```ts
specimenRoleLine(undefined);       // null
specimenRoleLine(null);            // "Role not declared"
specimenRoleLine("blank");         // "blank"
specimenRoleLine("counterExample"); // "counter-example"
specimenRoleLine("futureRole");    // "futureRole"
specimenRoleLine("");              // ""
specimenRoleLine(" blank ");       // " blank "
```

A counter-example specimen is a specimen the reader must not copy. If you painted it as `blank` or as `example` because the body looked filled in, you would offer a forbidden specimen as a model. That is why an undeclared role is not defaulted, and why a declared token is not replaced with a friendlier word except for the one hyphen above.

## What the host must supply

The role value, already projected:

- Leave it `undefined` when the family does not have a role field. Do not pass `null` for those families, or every unit in a family that has no roles will say "Role not declared".
- Pass `null` when the family has the field and this unit's value is absent.
- Pass the stored string when the vault has one. Do not map an unknown string to `null` first. That would turn a real declaration into the absence line, which denies a fact the store holds.

The host draws the line. For the absence line, the app's chip says, in its tooltip, that nothing was inferred from the heading or the body. Keep that meaning if you write your own tooltip. This package does not include the tooltip text.

## Do not

- Do not default a missing role to `blank`. `blank` is a declared specimen, an empty form. Absence is not an empty form.
- Do not infer `example` because the section has text in it.
- Do not drop an unknown token, and do not show `Role not declared` for it.
- Do not treat `specimenRoleLine` returning `""` as "draw the absence line". `""` means the stored token was empty. Absence is `null` in, and `Role not declared` out.
- Do not use this to decide if a save is allowed. It is display.

## Wrong readings

- "`null` and `undefined` both mean we have nothing to say." They both mean the unit did not carry a token, and they mean different things about the family. `undefined` hides the line. `null` shows the absence sentence. Mixing them changes families that have no role field.
- "`counter-example` on screen means the vault stored the hyphen." The known token `counterExample` is shown with a hyphen. A vault that actually stored the hyphenated string is also shown with a hyphen. You cannot tell those apart from the line alone. The stored value is the authority.
- "An unknown word is a bug, so hide it." Hiding it tells the reader the unit said nothing. The unit said a word this app has not learned. Show the word.

## Where it came from

GilbApp `src/components/process/StandardsUnitRole.tsx`. The absence sentence, the four spellings, and the unknown-token rule are the same. The component, the CSS, and the ontology list it used to ask "is this one of the declared levels?" were not copied. This package does not know the legal set. The caller does not need that set to draw the line.
