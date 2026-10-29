# birthday-picker

Picks a birthday from day, month and an optional year, with no free text.

## What this is

Picks a birthday from day, month and an optional year, with no free text.

Plain React, inline styles, no state outside the component. The person picks from three lists: day, month and year (or "No year"). Nothing typed is ever stored. Save hands back the one shape the master stores: `"1961-03-14"`, or `"--03-14"` with no year (the writer is `birthdayValue` of `birthday-text`). The day and month are required; the year is optional. An impossible day (31 February, 29 February of a common year) is said in words and cannot be saved.

- `BirthdayPicker({ label, value, onPick, onCancel, onClear?, locale?, thisYear? })`: a group (`role="group"`, `aria-label` = `label`, `data-testid="birthday-picker"`) with three lists (`birthday-day`, `birthday-month`, `birthday-year`), a line that says what is missing or impossible, and Save (`birthday-save`), Cancel (`birthday-cancel`) and, when something is stored, Clear (`birthday-clear`).
  - `value` is the stored text ("1961-03-14", "--03-14") or `""`. A lawful value opens the lists on it and a line `Now: 14 March 1961` says it. A value that is not a lawful birthday is shown as stored (`Now: "...", which is not a date the card can read. Pick the day to replace it.`), the lists start empty, and it is replaced only if the person picks a day and saves.
  - Save calls `onPick(value)` with the master's shape. It is off until day and month are picked and the day exists in that month and year.
  - Enter in a list saves (when lawful) and Escape cancels. Both are stopped from reaching handlers outside the picker. Enter on a button is left to the button.
  - `onClear` is offered as Clear only when a value is stored.
  - `locale` names the months (the reader's own when left out). `thisYear` is the first year of the year list (this year when left out; for tests).
  - The year list runs down to `BIRTHDAY_FIRST_YEAR` (1900). A stored year outside the list is added at its end, so opening the picker never drops it.
  - The day list is always 1 to 31; the month decides whether a day is lawful.
- `BIRTHDAY_WORDS`: every word the picker says: `day`, `month`, `year`, `noYear`, `pickDay`, `pickMonth`, `save`, `cancel`, `clear`, `needDayMonth`, and the sentences `now(text)`, `unreadable(raw)`, `noSuchDay(day, month, year)`.
- `BIRTHDAY_FIRST_YEAR`: `1900`.
- Type: `BirthdayPickerProps`.

## What this is not

- Not a reader or a writer. It reads nothing and writes nothing: the host saves through its own write path for the field (`onPick`).
- Not a text box. There is no `<input>`; a free-text birthday cannot be typed.
- Not a `<form>`: it is drawn inside a host's own form, and forms do not nest. Enter and Escape are handled on the group.
- Not the rules for a lawful birthday. Those are in `birthday-text`, which this unit uses.
- Not a theme. It reads the host's CSS variables and falls back to a literal.

## How to take it

Package: `@kaigilb/gilbplatformcode-birthday-picker`

From a clone of this repository, install the peer first, then the unit's folder:

```sh
npm install <path-to-the-library>/units/birthday-text <path-to-the-library>/units/birthday-picker
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 and `birthday-text` (`^0.1.0`) are peers. The unit draws with inline styles only, so no Tailwind scan is needed.

## Examples

```tsx
import { BirthdayPicker } from "@kaigilb/gilbplatformcode-birthday-picker";

function BirthdayField({ stored, close }: { stored: string; close: () => void }) {
  return (
    <BirthdayPicker
      label="Birthday"
      value={stored}                                // "1961-03-14", "--03-14" or ""
      onPick={(value) => { saveBirthday(value); close(); }} // yours: the host's write path
      onCancel={close}
      onClear={() => { saveBirthday(""); close(); }}
    />
  );
}
```

## What the host must supply

- React 19, and `birthday-text` installed once.
- `onPick` (the write), `onCancel`, and optionally `onClear`.
- Nothing else is required. The CSS contract is below.

### CSS contract

Every colour is a chain `var(--host, var(--second, literal))`: the host's variable first, a second app's variable second, a literal last. A host with none of the variables still draws.

| Host variable | Second variable | Literal fallback | Draws |
|---|---|---|---|
| `--ink` | `--color-ink` | `#2a2622` | the lists' text, Save and Clear, the impossible-day line |
| `--ink-soft` | `--color-ink-secondary` | `#67635e` | the lists' labels, the "Now" line, the quiet line, Cancel, Save while off |
| `--surface` | `--color-card` | `#ffffff` | the lists' background |
| `--line` | `--color-line` | `#d9d4cb` | the lists' border |
| `--r-sm` | none | `7px` | the corner radius of the lists |

Every control is at least 44 px high (touch target). The picker uses the ink and the soft ink only, never a brand colour or an error colour, because those cannot be known to keep their contrast in every theme; weight (600 for the impossible-day line, 700 for Save) marks what matters.

## Module state

None. The unit holds no module-level state that changes; the lists' values are React state inside each picker.

## Do not

- Do not store a typed birthday. Take `onPick`'s value as it is; it is already in the master's shape.
- Do not turn a saved value into something else before storing it. The year-less shape is `--MM-DD`, and `onPick` already gives it.
- Do not rely on the picker to keep a bad stored value: it is replaced only if the person picks and saves, and cleared only through `onClear`.
- Do not put it inside code that submits on Enter and expects the picker to pass the key on: Enter in a list is stopped at the group.

## Wrong readings

These behaviours are as the source has them, kept on purpose and pinned by tests (nothing is fixed in the extraction).

- "The picker offers only lawful days." It offers 1 to 31 always; an impossible one is said in words and Save stays off.
- "A stored year before 1900 is dropped." It is offered at the end of the year list and stays selected.
- "Clear shows whenever `onClear` is given." Only when a non-blank value is stored.
- "An unreadable stored value is erased on opening." It is kept as stored until a day is picked and saved.

## Where it came from

`KaiGilb/gilb-stakeholders-ui` (private repo), commit `69015111d0f8dc98406acb1579dba10f9ae471bb`: `src/BirthdayPicker.tsx` lines 1-213 (whole file) to `src/BirthdayPicker.tsx`, copied by script.

Named changes, and only these:

1. the import of the birthday functions from `gilb-stakeholders` is the peer `@kaigilb/gilbplatformcode-birthday-text` (`birthdayMonthName`, `birthdayText`, `birthdayValue`, `daysInBirthdayMonth`, `parseBirthday`; the unit is the source's `birthday.ts`, checked token by token in an earlier batch);
2. comments made generic (person names, cycle and ticket tags, app names and a mobile-rule tag removed); no code change. No string literal carried a tag, so none was changed.

`src/index.ts` is new. It does not import `tokens.ts`: the file draws with its own colour chains, so `stakeholder-ui-kit` is not a peer. Tests: the source's one BirthdayPicker test file in `gilb-stakeholders-ui` `test/` (16 tests) ported to `src/BirthdayPicker.test.tsx` (import path changed, tags in comments and the describe name removed; one assertion `toHaveBeenCalledExactlyOnceWith` written as `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith` because this unit's vitest 2 has no such matcher), and `src/birthdayPickerPinned.test.tsx`, which pins every export, the year list, the keys, the messages and the colour chains. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
