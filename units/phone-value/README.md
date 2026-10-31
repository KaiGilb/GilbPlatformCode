# phone-value

Draws a phone number with its country, and lets the holder type one.

## What this is

Draws a phone number with its country, and lets the holder type one.

`PhoneValue({ value, suggestedDial?, onCommit, onDialSet?, ariaLabel, startEditing? })` is one phone, in two states:

- **Showing:** the stored number as text in a button named `ariaLabel` (an empty one shows "Add phone"). Pressing it opens the editor.
- **Editing:** two boxes, a country-code box ("Country code": a `+` and digits) and a number box ("Phone number": free text), laid out side by side. `data-testid`s: `phone-parts` (the pair), `phone-country-code`, `phone-national`.

How a phone is split and joined: opening splits the stored phone at its first space (`splitPhone`, from `phone-text`: `+47 900 00 000` becomes `47` and `900 00 000`; a number with no space keeps its code out of the code box, the code is never guessed; a `tel:` prefix is dropped). Saving joins the boxes with **the app's `joinPhone`** (from `home-dial`; see "Wrong readings": it is not the `joinPhone` of `phone-text`). A number typed with its own `+` keeps its own code and the code box becomes read-only until the plus is gone.

Props:

- `value`: the stored phone ("" for none).
- `suggestedDial`: digits of the home country's calling code (from `home-dial`'s `useHomeDial`). It starts the code box only for an EMPTY phone; a stored phone never gets it.
- `onCommit(next)`: the new stored phone (`""` when the number was emptied). Called once on leaving the pair (focus moves outside both boxes) or on Enter in the number box, and only when the text would change. Leaving without a change saves nothing.
- `onDialSet(digits)`: the person changed the code box from what it showed at open (a prefill accepted as shown is not a change); called after `onCommit`, once per distinct code, never for an empty code. Optional.
- `startEditing`: a row just added opens straight into editing, with the cursor in the code box after the "+".

## What this is not

- Not the lookup of the home country (`home-dial`) and not the section that lists phones (`contact-rows`), which pass `suggestedDial`, `onCommit` and `onDialSet`.
- Not a validator: no number is refused, no length or format is checked.
- Not a store: it holds the text being edited and nothing else; saving is the caller's.

## How to take it

Package: `@kaigilb/gilbplatformcode-phone-value`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/phone-value` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/phone-value
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/phone-value/src";`. The page must define these variables: `--ink` (the text and the boxes' text), `--ink-faint` ("Add phone"), `--line-2` (the boxes' border), `--surface` (the boxes' ground) and `--r-sm` (their corner radius).

## Requests and their servers

None. The unit makes no request and writes nothing; what it hands back is text.

## Examples

```tsx
import { PhoneValue } from "@kaigilb/gilbplatformcode-phone-value";

<PhoneValue
  value={row.phone}
  suggestedDial={homeDial} // from useHomeDial(...), "" when unknown
  ariaLabel="Edit Phone"
  onCommit={(next) => savePhone(next)}
  onDialSet={(digits) => rememberMyCode(digits)}
/>;
```

## What the host must supply

- Tailwind scanning this unit's `src` and the CSS variables above.
- Nothing else: no provider, no context, no setting, no state of its own beyond the text being edited.

## Module state

None.

## Do not

- Do not swap `phone-text`'s `joinPhone` in for the app's: a number typed with its own `+` would be saved as "+47 +1 555 0100".
- Do not report a prefill through `onDialSet`; it is for a code the person changed.
- Do not save from the prefill alone: an empty number never commits.

## Wrong readings

- "`joinPhone` is `joinPhone`." There are two. This unit uses the app's (`home-dial`), which returns a number that starts with `+` as it is; `phone-text`'s puts the code in front of it. The code box is read-only while the number starts with `+` because the code there would be dropped without a sign.
- "A changed code is saved by `onDialSet`." It is only reported (for the caller to remember as the next suggestion); the phone is saved by `onCommit`.
- "Emptying the number does nothing." It commits `""` (the phone is cleared), and a code changed in the same edit is still reported (as the source does).
- "Typing back to the stored text saves." It does not: a text equal to the stored one saves nothing.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, whole file:

- `src/components/mynet/PhoneValue.tsx` (159 lines) to `src/PhoneValue.tsx`.

(The component was itself copied from the MyNet app; the code is MyNet's, line for line, except the stylesheet tokens and the `startEditing` prop.)

Named changes, and only these:

1. The imports are imports of units: `joinPhone` from `home-dial` (the app's, not `phone-text`'s) and `splitPhone` from `phone-text`.
2. The header comments are new and shorter; the comments that name a cycle, a ruling, an agent, a date, a ticket or a MyNet commit are reworded with the same facts. No code changed.
3. `src/index.ts` is new and exports by name.

With comments and imports removed, `PhoneValue.tsx` is token-equal to the source (356 words, 0 diff lines).

## Tests

46 tests in 3 files (`npx vitest run`):

- `PhoneValue.test.tsx` 32: PORTED the source's 2 cases (`ContactRows.addFocus.c214e9.test.tsx`; the click is a `fireEvent` here, not `user-event`); NEW 30: what is shown, opening (split, `tel:`, no space, suggestion for an empty phone only), the code box's digits, leaving (no change, focus moving inside, a change, Enter, other keys, emptying, typing back, a new number with and without the suggestion, a code with no number), a number that carries its own `+`, `onDialSet` (prefill accepted, changed, stored phone, once per code, cleared, optional), the boxes' accessible names.
- `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Left out: the phone cases of the section's tests (`ContactRows.c214e4.test.tsx` "MyNet's Phone section", 3 cases) drive `PhoneValue` through `ContactRows` and a record writer; they belong to `contact-rows`, which already has its own. No `vi.mock`.

Mutation checks: 22 mutants (the open and the suggestion, the three early outs of a commit, the three guards of `onDialSet`, the blur and Enter rules, the read-only rule, the code box's display, the shown text, the focus and cursor of a new row, the joined text, the boxes' names, the commit call), 21 killed and 1 equivalent (the code box's change handler strips non-digits, but every later step strips them again, so keeping them changes nothing visible). The first run had 6 survivors (the once-per-code rule did not reach the remembered code, a cleared code after a reported one, the two accessible names, the same-text join check, one dropped guard); tests added.
